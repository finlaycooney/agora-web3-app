import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { POSTGRES_17_IMAGE, assertLocalTestEnvironment, psql, startPostgresContainer, stopAndRemoveContainer } from '../support/foundation-docker.js';
import { AUTHZ_ID, installStaffFixture, staffPoolOptions } from '../support/staff-authorization.js';
import { CJ_ID, CJ_SUBJECTS, clientJobFixtureSql } from '../support/client-job-workflows.js';
import { withStaffTransaction } from '../../src/lib/staff-authorization.js';
import { telegramExtractionAction, telegramExtractionStatus, telegramExtractionWorkerOperation } from '../../src/lib/telegram-extraction-operations.js';
import { getTelegramDraft, updateTelegramDraft, decideTelegramDraft, listTelegramDrafts } from '../../src/lib/telegram-intake-operations.js';
const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const migrations = readdirSync(dir).filter(f => f >= '20260922090000_foundation_roles.sql' && f <= '20261002160000_telegram_extraction.sql' && f.endsWith('.sql')).sort();
const identity = subject => ({ provider: 'google', issuer: 'https://accounts.google.com', subject });
const quoteSql = text => `'${String(text).replaceAll("'", "''")}'`;
const message = (id, text, extra = {}) => ({ messageId: String(id), kind: 'message', sentAt: '2026-01-01T00:00:00.000Z', editedAt: null, sender: { peer: { kind: 'user', id: '777' }, username: 'ali', displayName: 'Alice Smith' }, replyToMessageId: null, forwardedFrom: null, text, attachments: [], ...extra });

test('private extraction queues, provenance, human decisions and approved truth', async t => {
    assertLocalTestEnvironment(); const container = await startPostgresContainer('pgtelegramextract', POSTGRES_17_IMAGE, { publish: true });
    let pool; let workerPool; t.after(async () => { await Promise.all([pool?.end(), workerPool?.end()]); await stopAndRemoveContainer(container); });
    for (const f of migrations) psql(container, readFileSync(join(dir, f), 'utf8'));
    const password = installStaffFixture(container); psql(container, clientJobFixtureSql);
    const { ORG_B } = AUTHZ_ID;
    psql(container, `insert into app.role_permissions(organization_id,role_id,permission_key) values('${ORG_B}','${CJ_ID.ROLE_B_RECRUITER}','candidates.write');`);
    pool = new pg.Pool(staffPoolOptions(container, password, 4));
    const workerPassword = randomUUID(); psql(container, `create role extraction_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${workerPassword}'; grant app_telegram_worker to extraction_test;`);
    workerPool = new pg.Pool({ ...staffPoolOptions(container, workerPassword, 3), user: 'extraction_test' });
    const owner = identity(CJ_SUBJECTS.ADMIN); const other = identity(CJ_SUBJECTS.RECRUITER);
    const staff = (sql, args = [], who = owner) => withStaffTransaction(pool, who, ORG_B, ['candidates.read', 'candidates.write'], async ({ client }) => (await client.query(sql, args)).rows[0]?.result);
    const user = await staff("select app.context_uuid_v1('app.actor_id') as result");
    const token = randomBytes(48).toString('base64url'); const otherToken = randomBytes(48).toString('base64url');
    const worker = await staff('select app.telegram_register_worker_v1($1,$2) as result', ['Extractor', token]);
    await staff('select app.telegram_register_worker_v1($1,$2) as result', ['Other extractor', otherToken], other);
    const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const connection = randomUUID(); const account = randomUUID(); const chat = randomUUID();
    psql(container, `insert into app.telegram_connector_workers(id,organization_id,owner_user_id,public_key_spki) values('${worker.id}','${ORG_B}','${user}','${publicKey}');
      insert into app.telegram_connections(id,organization_id,owner_user_id,worker_id,status,auth_expires_at) values('${connection}','${ORG_B}','${user}','${worker.id}','disconnected',now());
      insert into app.telegram_history_accounts(id,organization_id,owner_user_id,connection_id,account_user_id) values('${account}','${ORG_B}','${user}','${connection}','999');
      insert into app.telegram_history_limits(organization_id,owner_user_id) values('${ORG_B}','${user}');
      insert into app.telegram_history_chats(id,organization_id,owner_user_id,account_id,peer_kind,peer_id,title) values('${chat}','${ORG_B}','${user}','${account}','user','777','Synthetic extraction chat');`);
    const insert = (records, cid = chat) => {
        for (const m of records) psql(container, `insert into app.telegram_history_messages(organization_id,owner_user_id,chat_id,message_id,body,stored_bytes) values('${ORG_B}','${user}','${cid}',${m.messageId},${quoteSql(JSON.stringify(m))},octet_length(${quoteSql(JSON.stringify(m))}::jsonb::text));`);
    };
    const call = (action, input = {}, credential = token) => telegramExtractionWorkerOperation(workerPool, credential, action, input);
    const action = (input, who = owner) => telegramExtractionAction(pool, who, ORG_B, input);
    const status = (filters = {}, who = owner) => telegramExtractionStatus(pool, who, ORG_B, filters);
    const draft = id => getTelegramDraft(pool, owner, ORG_B, id);
    const fact = (field, value, m) => ({ field, value, evidence: [{ messageId: m.messageId, quote: m.text }] });
    const subject = (m, fields, ident = { kind: 'telegram_sender', messageId: m.messageId, quote: m.text }) => ({ subjects: [{ key: 'person', identity: ident, facts: Object.entries(fields).map(([k, v]) => fact(k, v, m)), attachments: [] }] });
    const complete = (j, result) => ({ jobId: j.id, leaseToken: j.leaseToken, sourceDigest: j.sourceDigest, result, metadata: { model: 'synthetic-demo', promptVersion: 'candidate-extraction-prompt-v1', reportedModel: null } });
    const newest = message(100, 'I am Alice Smith; email alice@example.test. Engineer in Paris, compensation 150000.');
    const oldest = message(60, 'I am Alice Smith; email alice@example.test. Engineer in Paris, compensation 100000.');
    insert([newest, ...Array.from({ length: 39 }, (_, i) => message(99 - i, 'No candidate information here.')), oldest]);
    let first; let second; let candidateDraft; let approvedCandidate; let ambiguousDraft;
    await t.test('private bounded queue, atomic completion and lost acknowledgement replay', async () => {
        const c = await workerPool.connect(); try { await c.query('set role app_telegram_worker'); await assert.rejects(c.query('select * from app.telegram_extraction_jobs'), { code: '42501' }); } finally { c.release(); }
        await assert.rejects(action({ action: 'enqueue', chatIds: [chat] }, other), { code: 'P0002' });
        assert.deepEqual(await action({ action: 'enqueue', chatIds: [chat] }), { queued: 1 }); assert.deepEqual(await action({ action: 'enqueue', chatIds: [chat] }), { queued: 0 });
        assert.equal((await status({}, other)).jobs.length, 0); assert.equal((await call('claim', {}, otherToken)).job, null);
        first = (await call('claim')).job; assert.equal(first.source.messages.length, 40); assert.ok(Buffer.byteLength(JSON.stringify(first.source)) <= 49152);
        const body = complete(first, subject(newest, { firstName: 'Alice', lastName: 'Smith', primaryEmail: 'alice@example.test', headline: 'Engineer', location: 'Paris', compensationPreference: '150000' }));
        const receipt = await call('complete', body); assert.equal(receipt.nextQueued, true); candidateDraft = await draft(receipt.draftIds[0]);
        assert.equal(candidateDraft.fields.telegramUserId, '777'); assert.equal(candidateDraft.fields.telegramUsername, 'ali'); assert.ok(candidateDraft.evidence.length);
        assert.deepEqual(await call('complete', body), receipt);
        await assert.rejects(call('complete', { ...body, metadata: { ...body.metadata, model: 'different' } }), { code: '40001' });
        await assert.rejects(call('complete', body, otherToken), { code: 'P0002' });
        second = (await call('claim')).job; assert.equal(second.source.messages.length, 1);
    });
    await t.test('human clears and edits survive late history; proposals make inbox unready', async () => {
        candidateDraft = await updateTelegramDraft(pool, owner, ORG_B, candidateDraft.id, { expectedVersion: candidateDraft.version, fields: { firstName: '', location: 'Remote' } });
        const detail = await status({ draftId: candidateDraft.id }); assert.deepEqual(detail.humanFields.sort(), ['firstName', 'location']);
        const receipt = await call('complete', complete(second, subject(oldest, { firstName: 'Alice', location: 'Paris', compensationPreference: '100000' })));
        assert.equal(receipt.proposalCount, 3); candidateDraft = await draft(candidateDraft.id);
        assert.equal(candidateDraft.fields.firstName, ''); assert.equal(candidateDraft.fields.location, 'Remote'); assert.equal(candidateDraft.fields.compensationPreference, '150000');
        assert.equal(candidateDraft.pendingProposalCount, 3); assert.ok(candidateDraft.missingFields.includes('proposals'));
        await assert.rejects(decideTelegramDraft(pool, owner, ORG_B, candidateDraft.id, { expectedVersion: candidateDraft.version, action: 'approve', operationId: randomUUID() }), e => e.code === 'DRAFT_INCOMPLETE' && Boolean(e.fieldErrors.proposals));
        const pending = (await status({ draftId: candidateDraft.id })).proposals.filter(p => p.status === 'pending');
        for (const p of pending) candidateDraft = (await action({ action: 'resolve', proposalId: p.id, decision: p.field === 'firstName' ? 'apply' : 'dismiss', expectedDraftVersion: candidateDraft.version })).draft;
        assert.equal(candidateDraft.pendingProposalCount, 0); assert.equal(candidateDraft.fields.firstName, 'Alice');
        await assert.rejects(action({ action: 'resolve', proposalId: pending[0].id, decision: 'dismiss', expectedDraftVersion: candidateDraft.version }), { code: '40001' });
    });
    await t.test('manual CV approval retains identity receipt and protects canonical fields from late completion', async () => {
        const target = await staff('select app.telegram_cv_target_v1($1) as result', [candidateDraft.id]);
        const document = { filename: 'Synthetic CV.pdf', sha256: 'a'.repeat(64), sizeBytes: 500, extension: 'pdf', mimeType: 'application/pdf', objectKey: `staff/${ORG_B}/${target}/${randomUUID()}.pdf` };
        await staff('select app.telegram_reserve_upload_v1($1,$2,$3) as result', [candidateDraft.id, candidateDraft.version, document.objectKey]);
        candidateDraft = await staff('select app.telegram_attach_cv_v1($1,$2,$3::jsonb) as result', [candidateDraft.id, candidateDraft.version, JSON.stringify(document)]);
        assert.equal((await listTelegramDrafts(pool, owner, ORG_B, { view: 'ready' })).drafts.length, 1);
        const approved = await decideTelegramDraft(pool, owner, ORG_B, candidateDraft.id, { expectedVersion: candidateDraft.version, action: 'approve', operationId: randomUUID() }); approvedCandidate = approved.candidateId;
        const late = message(59, 'I am Alice Smith, compensation 90000.'); insert([late]); await action({ action: 'enqueue', chatIds: [chat] }); const j = (await call('claim')).job;
        const receipt = await call('complete', complete(j, subject(late, { firstName: 'Alice', compensationPreference: '90000' })));
        assert.deepEqual(receipt.draftIds, [candidateDraft.id]); assert.equal(receipt.proposalCount, 1, 'unchanged reviewed name is not a false conflict');
        candidateDraft = await draft(candidateDraft.id); assert.equal(candidateDraft.status, 'approved'); assert.deepEqual(candidateDraft.fields, {});
        const detail = await status({ draftId: candidateDraft.id }); assert.equal(detail.candidateId, approvedCandidate);
        const p = detail.proposals.find(p => p.status === 'pending'); assert.equal(p.currentValue, '150000');
        await assert.rejects(action({ action: 'resolve', proposalId: p.id, decision: 'apply', expectedDraftVersion: candidateDraft.version }), { code: '40001' });
        candidateDraft = (await action({ action: 'resolve', proposalId: p.id, decision: 'dismiss', expectedDraftVersion: candidateDraft.version })).draft;
        await action({ action: 'reviewBatch', jobId: j.id }); await action({ action: 'reviewBatch', jobId: first.id }); await action({ action: 'reviewBatch', jobId: second.id });
        assert.equal((await status()).counts.needsReview, 0);
        assert.equal(psql(container, `select count(*) from app.telegram_history_messages where chat_id='${chat}'`).trim(), '42', 'future extraction and attachment holds retain raw data');
    });
    await t.test('invalid provenance fails atomically, provider failure is retryable, old leases cannot commit', async () => {
        const m = message(58, 'No relevant candidate.'); insert([m]); await action({ action: 'enqueue', chatIds: [chat] }); let j = (await call('claim')).job;
        await assert.rejects(call('complete', complete(j, subject(m, { firstName: 'Invented' }))));
        assert.equal((await status()).counts.leased, 1);
        const failure = { jobId: j.id, leaseToken: j.leaseToken, code: 'PROVIDER_UNAVAILABLE', retryAfterSeconds: 1 };
        await call('fail', failure); await call('fail', failure); assert.equal((await status()).counts.waiting, 1);
        psql(container, `update app.telegram_extraction_jobs set available_at=now()-interval '1 second' where id='${j.id}'`);
        const previous = j; j = (await call('claim')).job;
        await assert.rejects(call('complete', complete(previous, { subjects: [] })), { code: '40001' });
        await call('complete', complete(j, { subjects: [] })); assert.equal((await status()).counts.needsReview, 1);
        await action({ action: 'reviewBatch', jobId: j.id });
    });
    await t.test('ambiguous same-name subjects remain separate and metadata-only attachments do not make CV ready', async () => {
        const m = message(57, 'Alice Smith referred Alice Smith for a role.', { attachments: [{ id: '90', kind: 'document', filename: 'CV.pdf', mimeType: 'application/pdf', sizeBytes: 200 }] }); insert([m]); await action({ action: 'enqueue', chatIds: [chat] }); const j = (await call('claim')).job;
        const s = subject(m, { firstName: 'Alice', lastName: 'Smith' }, null).subjects[0]; s.attachments = [{ messageId: '57', attachmentIndex: 0 }];
        const receipt = await call('complete', complete(j, { subjects: [s, { ...s, key: 'second' }] })); assert.equal(new Set(receipt.draftIds).size, 2);
        const d = await draft(receipt.draftIds[0]); ambiguousDraft = d; assert.ok(d.missingFields.includes('cv')); assert.equal((await status({ draftId: d.id })).attachments[0].filename, 'CV.pdf');
        await assert.rejects(action({ action: 'reviewBatch', jobId: j.id }), { code: '23514' });
    });
    await t.test('indexed unassigned tail remains bounded after a large processed prefix; explicit oversized block', async () => {
        const body = quoteSql(JSON.stringify(message(200000, 'Already processed synthetic row.')));
        psql(container, `insert into app.telegram_history_messages(organization_id,owner_user_id,chat_id,message_id,body,stored_bytes,extraction_job_id)
          select '${ORG_B}','${user}','${chat}',g,jsonb_set(${body}::jsonb,'{messageId}',to_jsonb(g::text)),500,'${first.id}' from generate_series(1000,200999) g;
          analyze app.telegram_history_messages;`);
        insert([message(1, 'Tail source')]);
        const plan = JSON.parse(psql(container, `explain(analyze,buffers,format json) select body from app.telegram_history_messages where chat_id='${chat}' and extraction_job_id is null order by message_id desc limit 40`));
        assert.ok(JSON.stringify(plan).includes('telegram_extraction_unassigned_idx'));
        await action({ action: 'enqueue', chatIds: [chat] }); const job = (await call('claim')).job;
        assert.equal(job.source.messages.length, 1); assert.equal(job.source.messages[0].messageId, '1');
        await call('complete', complete(job, { subjects: [] }));
        const big = message(2, 'x\n'.repeat(16384), { attachments: Array.from({ length: 16 }, () => ({ id: '1', kind: 'document', filename: 'a'.repeat(200), mimeType: 'x'.repeat(100), sizeBytes: 1 })) });
        insert([big]); await action({ action: 'enqueue', chatIds: [chat] });
        const block = (await status()).jobs.find(j => j.errorCode === 'INPUT_TOO_LARGE'); assert.ok(block); assert.equal(block.messageCount, 0);
        assert.equal((await call('claim')).job, null);
        await action({ action: 'retry', jobId: block.id }); assert.ok((await status()).jobs.some(j => j.errorCode === 'INPUT_TOO_LARGE'));
    });

    await t.test('pending proposals and source review stay usable after many resolved facts', async () => {
        const pendingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
        psql(container, `with newjobs as (
          insert into app.telegram_extraction_jobs(organization_id,owner_user_id,chat_id,source,source_digest,message_count,status,receipt,completed_at)
          select '${ORG_B}','${user}','${chat}',source,source_digest,40,'completed',jsonb_build_object('draftIds',jsonb_build_array('${ambiguousDraft.id}')),now() from app.telegram_extraction_jobs,generate_series(1,61) where id='${first.id}' returning id,organization_id,owner_user_id
        ) insert into app.telegram_extraction_proposals(id,organization_id,owner_user_id,job_id,draft_id,field,suggested_value,evidence,status)
          select case when row_number() over()=61 then '${pendingId}'::uuid else gen_random_uuid() end,organization_id,owner_user_id,id,'${ambiguousDraft.id}','headline','"Engineer"','[]',case when row_number() over()=61 then 'pending' else 'applied' end from newjobs;
        with e as (
          insert into app.telegram_evidence(organization_id,owner_user_id,source_key,text) select '${ORG_B}','${user}','synthetic-volume-'||g,'Synthetic quote '||g from generate_series(1,101) g returning id,organization_id,owner_user_id
        ) insert into app.telegram_draft_evidence(organization_id,owner_user_id,draft_id,evidence_id) select organization_id,owner_user_id,'${ambiguousDraft.id}',id from e;`);
        const detail = await status({ draftId: ambiguousDraft.id }); assert.equal(detail.pendingCount, 1); assert.equal(detail.proposals.length, 1); assert.equal(detail.proposals[0].id, pendingId);
        const current = await draft(ambiguousDraft.id); assert.equal(current.evidence.length, 100); assert.ok(current.evidenceCount > 100); assert.equal(current.evidenceTruncated, true);
        const firstPage = await status({ view: 'needs_review' }); assert.equal(firstPage.jobs.length, 50); assert.ok(firstPage.nextAfter);
        const secondPage = await status({ view: 'needs_review', after: firstPage.nextAfter }); assert.ok(secondPage.jobs.length); assert.ok(secondPage.jobs.every(j => !firstPage.jobs.some(first => first.id === j.id)));
        const inspected = await status({ jobId: first.id }); assert.equal(inspected.source.messages.length, 40); assert.equal(inspected.metadata.model, 'synthetic-demo');
        await assert.rejects(status({ jobId: first.id }, other), { code: 'P0002' });
    });

});

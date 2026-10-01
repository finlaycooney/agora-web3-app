import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { POSTGRES_17_IMAGE, assertLocalTestEnvironment, psql, startPostgresContainer, stopAndRemoveContainer } from '../support/foundation-docker.js';
import { AUTHZ_ID, installStaffFixture, staffPoolOptions } from '../support/staff-authorization.js';
import { CJ_ID, CJ_SUBJECTS, clientJobFixtureSql } from '../support/client-job-workflows.js';
import { withStaffTransaction } from '../../src/lib/staff-authorization.js';
import { telegramConnectionAction, telegramConnectorOperation } from '../../src/lib/telegram-connection-operations.js';
import { telegramHistoryAction, telegramHistoryStatus } from '../../src/lib/telegram-history-operations.js';
import { createTelegramDraft, getTelegramDraft, updateTelegramDraft, decideTelegramDraft } from '../../src/lib/telegram-intake-operations.js';
import { telegramCvStatus, telegramCvAction, telegramCvWorkerOperation, uploadTelegramCv } from '../../src/lib/telegram-cv-operations.js';
import { createSyntheticPdf, createSyntheticDocx } from '../support/cv-fixtures.js';
const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const migrations = readdirSync(dir).filter(f => f >= '20260922090000_foundation_roles.sql' && f <= '20261002170000_telegram_cv.sql' && f.endsWith('.sql')).sort();
const identity = subject => ({ provider: 'google', issuer: 'https://accounts.google.com', subject });
const q = v => `'${String(v).replaceAll("'", "''")}'`;

test('private CV retrieval reservation, permissions, document guards and exact replay', async t => {
    assertLocalTestEnvironment(); const db = await startPostgresContainer('pgtelegramcv', POSTGRES_17_IMAGE, { publish: true });
    let pool; let workerPool; t.after(async () => { await Promise.all([pool?.end(), workerPool?.end()]); await stopAndRemoveContainer(db); });
    for (const f of migrations) psql(db, readFileSync(join(dir, f), 'utf8'));
    const password = installStaffFixture(db); psql(db, clientJobFixtureSql); const { ORG_B } = AUTHZ_ID;
    psql(db, `insert into app.role_permissions(organization_id,role_id,permission_key) values('${ORG_B}','${CJ_ID.ROLE_B_RECRUITER}','candidates.write');`);
    pool = new pg.Pool(staffPoolOptions(db, password, 4));
    const wp = randomUUID(); psql(db, `create role cv_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${wp}'; grant app_telegram_worker to cv_test;`);
    workerPool = new pg.Pool({ ...staffPoolOptions(db, wp, 3), user: 'cv_test' });
    const owner = identity(CJ_SUBJECTS.ADMIN); const other = identity(CJ_SUBJECTS.RECRUITER);
    const staff = (sql, args = []) => withStaffTransaction(pool, owner, ORG_B, ['candidates.read', 'candidates.write'], async ({ client }) => (await client.query(sql, args)).rows[0]?.result);
    const user = await staff("select app.context_uuid_v1('app.actor_id') as result");
    const token = randomBytes(48).toString('base64url'); const worker = await staff('select app.telegram_register_worker_v1($1,$2) as result', ['CV connector', token]);
    const connector = (action, input = {}) => telegramConnectorOperation(workerPool, token, action, input);
    const publicKeySpki = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    await connector('heartbeat', { publicKeySpki }); await telegramConnectionAction(pool, owner, ORG_B, { action: 'connect', workerId: worker.id });
    let lease = await connector('claim');
    const connectAccount = async accountUserId => { await connector('update', { connectionId: lease.id, generation: lease.generation, leaseToken: lease.leaseToken, status: 'connected', profile: { telegramUserId: accountUserId, username: 'synthetic_owner', displayName: 'Synthetic Owner' } }); };
    await connectAccount('999');
    let proof = { connectionId: lease.id, generation: lease.generation, connectionLeaseToken: lease.leaseToken, accountUserId: '999' };
    await telegramHistoryAction(pool, owner, ORG_B, { action: 'discover' }); const account = (await telegramHistoryStatus(pool, owner, ORG_B)).account.id;
    const chat = randomUUID(); const extraction = randomUUID(); const bytes = createSyntheticPdf(); const hash = createHash('sha256').update(bytes).digest('hex');
    const metadata = { id: '123456789123456789', kind: 'document', filename: 'Synthetic CV.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length };
    const source = { chat: { id: chat, title: 'Synthetic chat', peer: { kind: 'user', id: '777' }, accountUserId: '999' }, messages: [] };
    psql(db, `insert into app.telegram_history_chats(id,organization_id,owner_user_id,account_id,peer_kind,peer_id,title) values('${chat}','${ORG_B}','${user}','${account}','user','777','Synthetic chat');
      insert into app.telegram_extraction_jobs(id,organization_id,owner_user_id,chat_id,source,source_digest,message_count,status) values('${extraction}','${ORG_B}','${user}','${chat}',${q(JSON.stringify(source))},sha256('synthetic'),1,'completed');`);
    const draft = id => getTelegramDraft(pool, owner, ORG_B, id);
    const makeDraft = async (hint = metadata) => {
        const d = await createTelegramDraft(pool, owner, ORG_B, { fields: {}, sourceTitle: 'Synthetic attachment' });
        psql(db, `insert into app.telegram_extraction_attachments(organization_id,owner_user_id,job_id,draft_id,message_id,attachment_index,metadata) values('${ORG_B}','${user}','${extraction}','${d.id}','1',0,${q(JSON.stringify(hint))});`); return d;
    };
    const status = id => telegramCvStatus(pool, owner, ORG_B, id);
    const action = body => telegramCvAction(pool, owner, ORG_B, body);
    const retrieve = d => action({ action: 'retrieve', draftId: d.id, expectedDocumentRevision: d.documentRevision, extractionJobId: extraction, messageId: '1', attachmentIndex: 0 });
    const call = (action, body = {}, current = proof) => telegramCvWorkerOperation(workerPool, token, action, { ...current, ...body });
    const uploadProof = job => ({ ...proof, jobId: job.id, jobLeaseToken: job.leaseToken, sourceDigest: job.sourceDigest, sha256: hash, sizeBytes: bytes.length });
    const store = new Map(); let puts = 0; let uploads = 0; let onUpload = null; let loseStorageAck = false;
    const storage = { storage: { from: () => ({ upload: async (key, body) => {
        uploads++; if (store.has(key)) return { error: { statusCode: '400', message: 'Asset Already Exists' } };
        puts++; store.set(key, Buffer.from(body)); if (onUpload) await onUpload();
        if (loseStorageAck) { loseStorageAck = false; return { error: { statusCode: '503' } }; } return { data: { path: key } };
    }, download: async key => ({ data: new Blob([store.get(key)]) }) }) } };
    let first;
    await t.test('eligibility is explicit/private; profile edits preserve retrieval and exact completed replay avoids storage', async () => {
        first = await makeDraft(); const snap = await status(first.id); assert.equal(snap.attachments[0].eligible, true); assert.equal(snap.documentRevision, 0);
        await assert.rejects(telegramCvStatus(pool, other, ORG_B, first.id));
        assert.equal((await retrieve(first)).job.status, 'queued'); assert.equal((await retrieve(first)).job.status, 'queued');
        const j = (await call('claim')).job; assert.equal((await call('claim')).job.leaseToken, j.leaseToken);
        first = await updateTelegramDraft(pool, owner, ORG_B, first.id, { expectedVersion: first.version, fields: { firstName: 'Human' } }); assert.equal(first.documentRevision, 0);
        const receipt = await uploadTelegramCv(workerPool, token, uploadProof(j), async () => bytes, storage); assert.equal(receipt.documentRevision, 1);
        const current = await draft(first.id); assert.equal(current.fields.firstName, 'Human'); assert.equal(current.cv.status, 'validated');
        const uploadCount = uploads;
        assert.deepEqual(await uploadTelegramCv(workerPool, token, uploadProof(j), async () => { throw new Error('must not read replay'); }, storage), receipt); assert.equal(uploads, uploadCount);
        await assert.rejects(retrieve(current), { code: '40001' });
    });
    await t.test('lost storage acknowledgement verifies documented400 duplicate without overwriting the key', async () => {
        const d = await makeDraft(); await retrieve(d); const j = (await call('claim')).job; const before = puts; loseStorageAck = true;
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => bytes, storage));
        const receipt = await uploadTelegramCv(workerPool, token, uploadProof(j), async () => bytes, storage);
        assert.equal(receipt.status, 'completed'); assert.equal(puts, before + 1); assert.equal(new Set([...store.keys()].map(k => k.split('/')[2])).size, 2, 'same source uses separate candidate target keys');
    });
    await t.test('manual CV wins during storage I/O; stale downloaded file remains reserved for cleanup', async () => {
        let d = await makeDraft(); await retrieve(d); const j = (await call('claim')).job;
        onUpload = async () => {
            d = await draft(d.id); const target = await staff('select app.telegram_cv_target_v1($1) as result', [d.id]); const key = `staff/${ORG_B}/${target}/${randomUUID()}.pdf`;
            await staff('select app.telegram_reserve_upload_v1($1,$2,$3) as result', [d.id, d.version, key]);
            await staff('select app.telegram_attach_cv_v1($1,$2,$3::jsonb) as result', [d.id, d.version, JSON.stringify({ filename: 'Manual CV.pdf', objectKey: key, sha256: hash, sizeBytes: bytes.length, extension: 'pdf', mimeType: 'application/pdf' })]);
        };
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => bytes, storage), { code: '40001' }); onUpload = null;
        assert.equal((await draft(d.id)).cv.filename, 'Manual CV.pdf'); assert.equal((await status(d.id)).jobs[0].status, 'cancelled');
        assert.equal(psql(db, `select count(*) from app.telegram_upload_cleanup where object_key=(select object_key from app.telegram_cv_jobs where id='${j.id}')`).trim(), '1');
    });
    await t.test('every CV worker phase enforces current document permission before reading bytes', async () => {
        const d = await makeDraft(); await retrieve(d); const j = (await call('claim')).job;
        psql(db, `delete from app.role_permissions where organization_id='${ORG_B}' and role_id='${CJ_ID.ROLE_B_ADMIN}' and permission_key='documents.write'`);
        await assert.rejects(call('claim'), { code: '42501' });
        await assert.rejects(call('defer', { jobId: j.id, jobLeaseToken: j.leaseToken, code: 'WORKER_ERROR', retryAfterSeconds: 1 }), { code: '42501' });
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => { throw new Error('unauthorized body read'); }, storage), { code: '42501' });
        psql(db, `insert into app.role_permissions(organization_id,role_id,permission_key) values('${ORG_B}','${CJ_ID.ROLE_B_ADMIN}','documents.write')`);
        await action({ action: 'cancel', jobId: j.id });
    });
    await t.test('repeated account FLOOD_WAIT remains resumable beyond five cycles', async () => {
        const d = await makeDraft(); await retrieve(d);
        for (let i = 0; i < 7; i++) {
            const j = (await call('claim')).job; assert.ok(j);
            const deferred = { jobId: j.id, jobLeaseToken: j.leaseToken, code: 'FLOOD_WAIT', retryAfterSeconds: 1 };
            await call('defer', deferred); await call('defer', deferred); const paused = await call('claim'); assert.equal(paused.job, null); assert.ok(paused.retryAt);
            psql(db, `update app.telegram_history_accounts set cooldown_until=now()-interval '1 second' where id='${account}'; update app.telegram_cv_jobs set available_at=now()-interval '1 second' where id='${j.id}'`);
        }
        const j = (await call('claim')).job; assert.ok(j); await action({ action: 'cancel', jobId: j.id });
    });
    await t.test('generation changes, changed bytes, closed drafts and stale leases cannot attach', async () => {
        const d = await makeDraft(); await retrieve(d); let j = (await call('claim')).job;
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => Buffer.alloc(bytes.length), storage));
        psql(db, `update app.telegram_cv_jobs set lease_expires_at=now()-interval '1 second' where id='${j.id}'`);
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => { throw new Error('expired body read'); }, storage), { code: '40001' });
        j = (await call('claim')).job;
        const oldProof = uploadProof(j);
        await telegramConnectionAction(pool, owner, ORG_B, { action: 'disconnect', connectionId: lease.id, generation: lease.generation });
        assert.equal((await status(d.id)).jobs[0].errorCode, 'CONNECTION_CHANGED');
        lease = await connector('claim'); await connector('update', { connectionId: lease.id, generation: lease.generation, leaseToken: lease.leaseToken, status: 'disconnected' });
        await telegramConnectionAction(pool, owner, ORG_B, { action: 'connect', workerId: worker.id }); lease = await connector('claim'); await connectAccount('999');
        proof = { connectionId: lease.id, generation: lease.generation, connectionLeaseToken: lease.leaseToken, accountUserId: '999' };
        await assert.rejects(uploadTelegramCv(workerPool, token, oldProof, async () => bytes, storage), { code: '40001' });
        await action({ action: 'retry', jobId: j.id }); j = (await call('claim')).job;
        await decideTelegramDraft(pool, owner, ORG_B, d.id, { action: 'discard', expectedVersion: d.version, operationId: randomUUID() });
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => bytes, storage), { code: '40001' }); assert.equal((await status(d.id)).jobs[0].status, 'cancelled');
    });
    await t.test('invalid signatures and mismatched extensions never reach storage; DOCX retrieval validates', async () => {
        const d = await makeDraft(); await retrieve(d); const j = (await call('claim')).job; const before = uploads;
        const bad = Buffer.alloc(bytes.length);
        await assert.rejects(uploadTelegramCv(workerPool, token, { ...uploadProof(j), sha256: createHash('sha256').update(bad).digest('hex') }, async () => bad, storage));
        assert.equal(uploads, before); await action({ action: 'cancel', jobId: j.id });
        const docx = createSyntheticDocx(); const docxDraft = await makeDraft({ ...metadata, filename: 'Synthetic CV.docx', sizeBytes: docx.length, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        await retrieve(docxDraft); const docxJob = (await call('claim')).job;
        const received = await uploadTelegramCv(workerPool, token, { ...uploadProof(docxJob), sizeBytes: docx.length, sha256: createHash('sha256').update(docx).digest('hex') }, async () => docx, storage);
        assert.equal(received.cv.filename, 'Synthetic CV.docx');
        const mismatch = await makeDraft({ ...metadata, filename: 'Wrong extension.pdf', sizeBytes: docx.length }); await retrieve(mismatch); const wrongJob = (await call('claim')).job;
        await assert.rejects(uploadTelegramCv(workerPool, token, { ...uploadProof(wrongJob), sizeBytes: docx.length, sha256: createHash('sha256').update(docx).digest('hex') }, async () => docx, storage));
        await action({ action: 'cancel', jobId: wrongJob.id });
        const unavailable = await makeDraft({ ...metadata, filename: 'script.exe' }); assert.equal((await status(unavailable.id)).attachments[0].reason, 'UNSUPPORTED_FILE');
    });

    await t.test('old retried job remains visible before twenty newer jobs; attachment pagination is bounded', async () => {
        const d = await makeDraft(); const original = (await retrieve(d)).job; await action({ action: 'cancel', jobId: original.id });
        psql(db, `insert into app.telegram_cv_jobs(organization_id,owner_user_id,draft_id,account_id,extraction_job_id,connection_id,connection_generation,document_revision,source,source_digest,status,created_at)
          select organization_id,owner_user_id,draft_id,account_id,extraction_job_id,connection_id,connection_generation,document_revision,source,source_digest,'failed',created_at+make_interval(secs=>g) from app.telegram_cv_jobs,generate_series(1,21) g where id='${original.id}';
          insert into app.telegram_extraction_attachments(organization_id,owner_user_id,job_id,draft_id,message_id,attachment_index,metadata)
          select '${ORG_B}','${user}','${extraction}','${d.id}',g::text,0,${q(JSON.stringify(metadata))}::jsonb from generate_series(2,56) g;`);
        await action({ action: 'retry', jobId: original.id });
        const snap = await status(d.id); assert.equal(snap.jobs.length, 20); assert.equal(snap.jobs[0].id, original.id); assert.equal(snap.jobs[0].status, 'queued');
        assert.equal(snap.attachments.length, 50); assert.ok(snap.nextAfter);
        const next = await telegramCvStatus(pool, owner, ORG_B, d.id, snap.nextAfter); assert.equal(next.attachments.length, 6); assert.equal(next.nextAfter, null);
        assert.equal(next.attachments[0].messageId, '51'); await action({ action: 'cancel', jobId: original.id });
    });
    await t.test('expired cleanup reservation becomes visible retryable failure instead of a renewing stale lease', async () => {
        const d = await makeDraft(); const selected = (await retrieve(d)).job; const j = (await call('claim')).job; assert.equal(j.id, selected.id);
        loseStorageAck = true; await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => bytes, storage));
        psql(db, `update app.telegram_upload_cleanup set state='deleting' where object_key=(select object_key from app.telegram_cv_jobs where id='${j.id}')`);
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => { throw new Error('expired reservation read'); }, storage), { code: '40001' });
        assert.equal((await status(d.id)).jobs[0].errorCode, 'UPLOAD_EXPIRED');
        await action({ action: 'retry', jobId: j.id }); const renewed = (await call('claim')).job; assert.notEqual(renewed.leaseToken, j.leaseToken);
        assert.equal((await uploadTelegramCv(workerPool, token, uploadProof(renewed), async () => bytes, storage)).status, 'completed');
    });
    await t.test('changing connected Telegram account never reuses another account attachment', async () => {
        const d = await makeDraft(); await retrieve(d); const j = (await call('claim')).job;
        await telegramConnectionAction(pool, owner, ORG_B, { action: 'disconnect', connectionId: lease.id, generation: lease.generation });
        lease = await connector('claim'); await connector('update', { connectionId: lease.id, generation: lease.generation, leaseToken: lease.leaseToken, status: 'disconnected' });
        await telegramConnectionAction(pool, owner, ORG_B, { action: 'connect', workerId: worker.id }); lease = await connector('claim'); await connectAccount('1000');
        proof = { connectionId: lease.id, generation: lease.generation, connectionLeaseToken: lease.leaseToken, accountUserId: '1000' };
        await telegramHistoryAction(pool, owner, ORG_B, { action: 'discover' });
        assert.equal((await status(d.id)).attachments[0].reason, 'ACCOUNT_MISMATCH');
        await assert.rejects(retrieve(d), { code: '23514' }); await assert.rejects(action({ action: 'retry', jobId: j.id }), { code: '40001' });
        await assert.rejects(uploadTelegramCv(workerPool, token, uploadProof(j), async () => { throw new Error('wrong account read'); }, storage), { code: '40001' });
    });

});

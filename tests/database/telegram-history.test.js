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
import { telegramConnectionAction, telegramConnectorOperation } from '../../src/lib/telegram-connection-operations.js';
import { telegramHistoryAction, telegramHistoryStatus, telegramHistoryWorkerOperation } from '../../src/lib/telegram-history-operations.js';
const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const migrations = readdirSync(dir).filter(f => f >= '20260922090000_foundation_roles.sql' && f <= '20261002150000_telegram_history.sql' && f.endsWith('.sql')).sort();
const identity = subject => ({ provider: 'google', issuer: 'https://accounts.google.com', subject });
const { ORG_B } = AUTHZ_ID;
const makeMessage = (id, overrides = {}) => ({ messageId: String(id), kind: 'message', sentAt: '2026-01-01T00:00:00.000Z', editedAt: null, sender: { peer: { kind: 'user', id: '1234' }, username: 'sample_user', displayName: 'Synthetic Sender' }, replyToMessageId: null, forwardedFrom: null, text: 'Synthetic recruiting conversation', attachments: [], ...overrides });

test('Telegram history private pagination, durable receipts, volume and connection fences', async t => {
    assertLocalTestEnvironment(); const container = await startPostgresContainer('pgtelegramhistory', POSTGRES_17_IMAGE, { publish: true });
    let pool; let workerPool; t.after(async () => { await Promise.all([pool?.end(), workerPool?.end()]); await stopAndRemoveContainer(container); });
    for (const f of migrations) psql(container, readFileSync(join(dir, f), 'utf8'));
    const password = installStaffFixture(container); psql(container, clientJobFixtureSql);
    psql(container, `insert into app.role_permissions(organization_id,role_id,permission_key) values('${ORG_B}','${CJ_ID.ROLE_B_RECRUITER}','candidates.write');`);
    pool = new pg.Pool(staffPoolOptions(container, password, 4));
    const workerPassword = randomUUID(); psql(container, `create role history_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${workerPassword}'; grant app_telegram_worker to history_test;`);
    workerPool = new pg.Pool({ ...staffPoolOptions(container, workerPassword, 3), user: 'history_test' });
    const owner = identity(CJ_SUBJECTS.ADMIN); const other = identity(CJ_SUBJECTS.RECRUITER);
    const staff = (sql, args = [], who = owner) => withStaffTransaction(pool, who, ORG_B, ['candidates.read', 'candidates.write'], async ({ client }) => (await client.query(sql, args)).rows[0]?.result);
    const token = randomBytes(48).toString('base64url');
    const worker = await staff('select app.telegram_register_worker_v1($1,$2) as result', ['History worker', token]);
    const publicKeySpki = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const connector = (action, body = {}) => telegramConnectorOperation(workerPool, token, action, body);
    await connector('heartbeat', { publicKeySpki });
    await telegramConnectionAction(pool, owner, ORG_B, { action: 'connect', workerId: worker.id });
    let lease = await connector('claim');
    const connected = accountUserId => connector('update', { connectionId: lease.id, generation: lease.generation, leaseToken: lease.leaseToken, status: 'connected', profile: { telegramUserId: accountUserId, username: 'recruiter_user', displayName: 'Synthetic Recruiter' } });
    await connected('10001');
    let proof = { connectionId: lease.id, generation: lease.generation, connectionLeaseToken: lease.leaseToken, accountUserId: '10001' };
    const call = (action, body = {}) => telegramHistoryWorkerOperation(workerPool, token, action, { ...proof, ...body });
    const action = (body, who = owner) => telegramHistoryAction(pool, who, ORG_B, body);
    const status = (filters = {}, who = owner) => telegramHistoryStatus(pool, who, ORG_B, filters);
    const claim = async () => (await call('claim')).job;
    const page = (job, records, nextCursor) => ({ jobId: job.id, jobLeaseToken: job.leaseToken, pageId: randomUUID(), fromCursor: job.cursor, nextCursor: nextCursor ?? job.cursor, done: records.length === 0, records });
    const historyPage = (job, records) => page(job, records, records.length ? { beforeMessageId: String(Math.min(...records.map(r => Number(r.messageId)))), upperMessageId: job.cursor.upperMessageId ?? String(Math.max(...records.map(r => Number(r.messageId)))) } : job.cursor);
    let chats; let firstPage; let firstJob;
    await t.test('runtime role lacks table access; discovery pages and private cursor list exceed one page', async () => {
        const c = await workerPool.connect();
        try { await c.query('set role app_telegram_worker'); await assert.rejects(c.query('select * from app.telegram_history_messages'), { code: '42501' }); await assert.rejects(c.query('select app.telegram_history_action_v1($1)', ['{"action":"discover"}']), { code: '42501' }); } finally { c.release(); }
        await action({ action: 'discover' });
        const records = Array.from({ length: 55 }, (_, i) => ({ peer: { kind: i % 2 ? 'user' : 'channel', id: String(1000 + i) }, title: `Synthetic chat ${i}`, username: null, lastMessageAt: null }));
        let inserted = false;
        for (let n = 0; n < 4; n++) {
            const job = await claim(); if (!job) break;
            if (!inserted && job.cursor.folder === 0) {
                firstJob = job; firstPage = page(job, records, { ...job.cursor, offsetDate: 1, offsetId: '1', offsetPeer: records.at(-1).peer, excludePinned: true });
                assert.equal((await call('complete', firstPage)).status, 'queued'); inserted = true;
            } else await call('complete', page(job, []));
        }
        const first = await status(); assert.equal(first.chats.length, 50); assert.ok(first.nextCursor); assert.equal(first.totals.chats, 55); assert.equal(first.discovery.status, 'completed');
        const second = await status({ after: first.nextCursor }); assert.equal(second.chats.length, 5); assert.equal(second.nextCursor, null);
        chats = [...first.chats, ...second.chats];
        assert.equal((await status({}, other)).chats.length, 0);
    });
    await t.test('lost acknowledgement replays original page across renewed connection lease without duplicate rows', async () => {
        assert.equal((await call('complete', firstPage)).replayed, true);
        psql(container, `update app.telegram_connections set lease_expires_at=now()-interval '1 second' where id='${lease.id}'`);
        lease = await connector('claim'); proof.connectionLeaseToken = lease.leaseToken;
        assert.equal((await call('complete', firstPage)).replayed, true);
        await assert.rejects(call('complete', { ...firstPage, records: [{ ...firstPage.records[0], title: 'Different' }] }), { code: '40001' });
        assert.equal((await status()).totals.chats, 55);
        assert.equal(firstJob.generation, proof.generation);
    });
    await t.test('atomic bounded selection rejects stale rows and one-page scheduling is fair', async () => {
        await assert.rejects(action({ action: 'selectMany', selected: true, chats: [{ chatId: chats[0].id, expectedVersion: 1 }, { chatId: chats[1].id, expectedVersion: 999 }] }), { code: '40001' });
        assert.equal((await status()).totals.selected, 0);
        await action({ action: 'selectMany', selected: true, chats: chats.slice(0, 2).map(c => ({ chatId: c.id, expectedVersion: c.version })) });
        const a = await claim(); assert.equal((await claim()).leaseToken, a.leaseToken);
        await call('complete', historyPage(a, [makeMessage(100), makeMessage(90, { text: '', attachments: [{ id: '9988', kind: 'document', filename: 'CV.pdf', mimeType: 'application/pdf', sizeBytes: 1000 }] }), makeMessage(80, { kind: 'service', text: '', sender: null })]));
        const b = await claim(); assert.notEqual(a.id, b.id);
        await call('complete', historyPage(b, [makeMessage(100)]));
        assert.equal((await status()).totals.messages, 4, 'same message ID in different chats stays distinct');
        assert.equal((await claim()).id, a.id);
    });
    await t.test('pause and cancel fence in-flight leases while resume preserves the cursor', async () => {
        const job = await claim(); const snapshot = await status(); const ch = snapshot.chats.find(c => c.import?.jobId === job.id);
        await action({ action: 'pause', chatId: ch.id, expectedVersion: ch.version });
        await assert.rejects(call('complete', historyPage(job, [makeMessage(70)])), { code: '40001' });
        let updated = (await status()).chats.find(c => c.id === ch.id);
        await action({ action: 'resume', chatId: ch.id, expectedVersion: updated.version });
        const otherJob = await claim(); await call('complete', page(otherJob, []));
        const resumed = await claim(); assert.equal(resumed.id, job.id); assert.deepEqual(resumed.cursor, job.cursor);
        updated = (await status()).chats.find(c => c.id === ch.id);
        await action({ action: 'cancel', chatId: ch.id, expectedVersion: updated.version });
        assert.equal((await status()).totals.messages, 4);
        updated = (await status()).chats.find(c => c.id === ch.id);
        await action({ action: 'resume', chatId: ch.id, expectedVersion: updated.version });
    });
    await t.test('quota pauses whole pages without cursor advancement, operator changes permit resume', async () => {
        const job = await claim(); const batch = historyPage(job, [makeMessage(70), makeMessage(60, { kind: 'unavailable', sentAt: null, sender: null, text: '' })]);
        psql(container, `update app.telegram_history_limits set max_messages=5 where organization_id='${ORG_B}'`);
        assert.equal((await call('complete', batch)).status, 'capacity_paused'); assert.equal((await call('complete', batch)).replayed, true);
        assert.equal((await status()).totals.messages, 4);
        psql(container, `update app.telegram_history_limits set max_messages=200000 where organization_id='${ORG_B}'`);
        const ch = (await status()).chats.find(c => c.import?.jobId === job.id);
        await action({ action: 'resume', chatId: ch.id, expectedVersion: ch.version });
        const resumed = await claim(); assert.deepEqual(resumed.cursor, job.cursor);
        await call('complete', historyPage(resumed, batch.records)); assert.equal((await status()).totals.messages, 6);
    });
    await t.test('flood wait blocks all account claims; malformed and forged raw SQL pages cannot advance', async () => {
        const job = await claim();
        await call('defer', { jobId: job.id, jobLeaseToken: job.leaseToken, code: 'FLOOD_WAIT', retryAfterSeconds: 60 });
        assert.equal(await claim(), null);
        psql(container, `update app.telegram_history_accounts set cooldown_until=now()-interval '1 second'; update app.telegram_history_jobs set retry_at=now()-interval '1 second' where status='waiting'`);
        const retry = await claim(); const malformed = historyPage(retry, [makeMessage(50)]); malformed.nextCursor.beforeMessageId = '40';
        await assert.rejects(call('complete', malformed), { code: '22023' });
        const raw = await workerPool.connect();
        try {
            await raw.query('begin; set local role app_telegram_worker');
            const payload = { pageId: randomUUID(), fromCursor: retry.cursor, nextCursor: { beforeMessageId: '50', upperMessageId: retry.cursor.upperMessageId }, done: false, records: [makeMessage(50, { text: 'x'.repeat(32769) })] };
            await assert.rejects(raw.query('select app.telegram_history_complete_v1($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [token, proof.connectionId, proof.generation, proof.connectionLeaseToken, proof.accountUserId, retry.id, retry.leaseToken, JSON.stringify(payload)]), { code: '22023' });
            await raw.query('rollback');
        } finally { raw.release(); }
        assert.equal((await claim()).leaseToken, retry.leaseToken);
        await call('complete', page(retry, []));
        assert.equal((await status()).totals.messages, 6);
    });
    await t.test('discovery restart prunes obsolete receipts and wire-sized pages survive SQL whitespace expansion', async () => {
        await action({ action: 'discover' });
        await assert.rejects(call('complete', firstPage), { code: '40001' });
        for (let i = 0; i < 2; i++) { const discovery = await claim(); await call('complete', page(discovery, [])); }
        const ch = (await status()).chats.find(c => c.id === chats[2].id);
        await action({ action: 'select', chatId: ch.id, selected: true, expectedVersion: ch.version });
        const job = await claim();
        const records = Array.from({ length: 100 }, (_, i) => makeMessage(1000 - i, { text: 'x'.repeat(2200) }));
        const batch = historyPage(job, records);
        assert.ok(Buffer.byteLength(JSON.stringify({ ...proof, ...batch })) <= 262144);
        await call('complete', batch);
        assert.equal((await status()).totals.messages, 106);
    });
    await t.test('unprocessed ingestion survives draft evidence cleanup and account changes cannot mix history', async () => {
        await staff('select app.telegram_create_draft_v1($1,$2::jsonb,$3) as result', [randomUUID(), '{}', 'Synthetic unrelated draft']).then(d => staff('select app.telegram_decide_draft_v1($1,$2,$3,$4) as result', [d.id, d.version, 'discard', randomUUID()]));
        assert.equal((await status()).totals.messages, 106);
        const oldProof = { ...proof };
        await telegramConnectionAction(pool, owner, ORG_B, { action: 'disconnect', connectionId: lease.id, generation: lease.generation });
        await assert.rejects(call('claim'), { code: '40001' });
        assert.equal((await status()).canImport, false);
        lease = await connector('claim');
        await connector('update', { connectionId: lease.id, generation: lease.generation, leaseToken: lease.leaseToken, status: 'disconnected' });
        await telegramConnectionAction(pool, owner, ORG_B, { action: 'connect', workerId: worker.id }); lease = await connector('claim'); await connected('20002');
        proof = { connectionId: lease.id, generation: lease.generation, connectionLeaseToken: lease.leaseToken, accountUserId: '20002' };
        assert.equal((await status()).account, null); assert.equal((await status()).totals.chats, 0); assert.equal((await status()).totals.messages, 106);
        await assert.rejects(call('claim', oldProof), { code: '40001' });
        await action({ action: 'discover' });
        assert.equal((await status()).account.accountUserId, '20002');
        await assert.rejects(action({ action: 'resume', chatId: chats[0].id, expectedVersion: 1 }), { code: '40001' });
    });
});

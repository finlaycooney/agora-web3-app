import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { POSTGRES_17_IMAGE, assertLocalTestEnvironment, psql, startPostgresContainer, stopAndRemoveContainer } from '../support/foundation-docker.js';
import { AUTHZ_ID, installStaffFixture, staffPoolOptions } from '../support/staff-authorization.js';
import { CJ_SUBJECTS, clientJobFixtureSql } from '../support/client-job-workflows.js';
import { withStaffTransaction } from '../../src/lib/staff-authorization.js';
import { telegramConnectionAction, telegramConnectorOperation } from '../../src/lib/telegram-connection-operations.js';
import { telegramHistoryAction, telegramHistoryStatus, telegramHistoryWorkerOperation } from '../../src/lib/telegram-history-operations.js';
import { createVault } from '../../services/telegram-connector/vault.mjs';
import { createHistoryWorker } from '../../services/telegram-connector/history-worker.mjs';

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const migration = '20261002150000_telegram_history.sql';
const owner = { provider: 'google', issuer: 'https://accounts.google.com', subject: CJ_SUBJECTS.ADMIN };
const org = AUTHZ_ID.ORG_B;
const peer = { kind: 'user', id: '456789012345' };
const sentAt = '2026-09-29T12:00:00.000Z';
const message = (messageId, text, attachments = []) => ({
    messageId, kind: 'message', sentAt, editedAt: null,
    sender: { peer, username: 'synthetic_candidate', displayName: 'Synthetic Candidate' },
    replyToMessageId: null, forwardedFrom: null, text, attachments,
});

test('real history runner and hosted database preserve pages through lost acknowledgements and restart', { timeout: 120000 }, async t => {
    assertLocalTestEnvironment();
    const db = await startPostgresContainer('pgtelegramhistoryruntime', POSTGRES_17_IMAGE, { publish: true });
    const vaultRoot = mkdtempSync(join(tmpdir(), 'agora-history-runtime-'));
    let pool; let workerPool;
    t.after(async () => {
        await Promise.all([pool?.end(), workerPool?.end()]);
        stopAndRemoveContainer(db);
        rmSync(vaultRoot, { recursive: true, force: true });
    });
    for (const name of readdirSync(migrationsDir).filter(name => name >= '20260922090000_foundation_roles.sql' && name <= migration && name.endsWith('.sql')).sort()) {
        psql(db, readFileSync(join(migrationsDir, name), 'utf8'));
    }
    const password = installStaffFixture(db); psql(db, clientJobFixtureSql);
    pool = new pg.Pool(staffPoolOptions(db, password, 3));
    const workerPassword = randomUUID();
    psql(db, `create role telegram_history_runtime_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${workerPassword}'; grant app_telegram_worker to telegram_history_runtime_test;`);
    workerPool = new pg.Pool({ ...staffPoolOptions(db, workerPassword, 3), user: 'telegram_history_runtime_test' });
    const token = randomBytes(48).toString('base64url');
    const registered = await withStaffTransaction(pool, owner, org, ['candidates.read', 'candidates.write'], async ({ client }) =>
        (await client.query('select app.telegram_register_worker_v1($1,$2) as result', ['Synthetic history Mac', token])).rows[0].result);
    const vaultConfig = { root: vaultRoot, server: 'https://synthetic.invalid', workerId: registered.id };
    let vault = createVault(vaultConfig);
    const connector = (action, body = {}) => telegramConnectorOperation(workerPool, token, action, body);
    await connector('heartbeat', { publicKeySpki: vault.publicKeySpki });
    await telegramConnectionAction(pool, owner, org, { action: 'connect', workerId: registered.id });
    const lease = await connector('claim');
    const accountUserId = '123456789012345';
    await connector('update', { connectionId: lease.id, generation: lease.generation, leaseToken: lease.leaseToken,
        status: 'connected', profile: { telegramUserId: accountUserId, username: 'synthetic_owner', displayName: 'Synthetic Owner' } });
    const action = body => telegramHistoryAction(pool, owner, org, body);
    const status = () => telegramHistoryStatus(pool, owner, org, { q: 'Synthetic candidate' });
    let loseHistoryAck = false; let historyReads = 0; const completions = [];
    let clock = Date.now();
    const now = () => clock;
    const host = async (action, body) => {
        const result = await telegramHistoryWorkerOperation(workerPool, token, action, body).catch(error => {
            error.status = { '40001': 409, '42501': 403, P0002: 404 }[error.code];
            throw error;
        });
        if (action === 'complete') {
            completions.push({ body: structuredClone(body), result });
            if (loseHistoryAck && body.records.some(row => row.messageId)) {
                loseHistoryAck = false;
                throw new Error('SYNTHETIC_ACK_LOST');
            }
        }
        return result;
    };
    const telegram = {
        async dialogs({ cursor }) {
            const offset = cursor.offsetId === '0' ? 0 : 1001 - Number(cursor.offsetId);
            if (cursor.folder === 1 || offset >= 301) return { records: [], nextCursor: cursor, done: true };
            const records = Array.from({ length: Math.min(100, 301 - offset) }, (_, index) => {
                const number = offset + index;
                return { peer: number === 0 ? peer : { kind: 'user', id: String(100000 + number) },
                    title: number === 0 ? 'Synthetic candidate' : `Volume chat ${number}`,
                    username: number === 0 ? 'synthetic_candidate' : `volume_${number}`, lastMessageAt: sentAt };
            });
            return { records, nextCursor: { ...cursor, offsetDate: Date.parse(sentAt) / 1000,
                offsetId: String(1001 - offset - records.length), offsetPeer: records.at(-1).peer, excludePinned: true }, done: false };
        },
        async history({ cursor }) {
            historyReads++;
            if (cursor.beforeMessageId === null) return {
                records: [message('103', 'Looking for a remote engineering role.'), message('102', '', [{ id: '12345', kind: 'document', filename: 'synthetic-cv.pdf', mimeType: 'application/pdf', sizeBytes: 512 }])],
                nextCursor: { beforeMessageId: '102', upperMessageId: '103' }, done: false,
            };
            if (cursor.beforeMessageId === '102') return {
                records: [{ ...message('101', ''), kind: 'unavailable', sentAt: null, sender: null }, message('100', 'Based in Madrid.')],
                nextCursor: { beforeMessageId: '100', upperMessageId: '103' }, done: false,
            };
            return { records: [], nextCursor: cursor, done: true };
        },
    };
    const context = { connectionId: lease.id, generation: lease.generation, connectionLeaseToken: lease.leaseToken,
        connectionLeaseExpiresAt: lease.leaseExpiresAt, accountUserId, telegram, signal: new AbortController().signal, isActive: () => true };
    let runtime = createHistoryWorker({ host, vault, now });
    await action({ action: 'discover' });
    for (let i = 0; i < 6 && (await status()).discovery.status !== 'completed'; i++) await runtime.tick(context);
    assert.equal((await status()).discovery.status, 'completed');
    assert.equal((await status()).totals.chats, 301, 'Hundreds of dialogs are committed across bounded pages');
    const page = await telegramHistoryStatus(pool, owner, org);
    assert.equal(page.chats.length, 50);
    assert.ok(page.nextCursor, 'Volume remains paginated at the hosted API');
    let chat = (await status()).chats[0];
    assert.equal(chat.username, 'synthetic_candidate');
    await action({ action: 'select', chatId: chat.id, expectedVersion: chat.version, selected: true });

    await t.test('lost page acknowledgement survives encrypted-vault restart without another Telegram read', async () => {
        loseHistoryAck = true;
        await runtime.tick(context).catch(error => assert.match(error.message, /SYNTHETIC_ACK_LOST|HOST_UNAVAILABLE/));
        assert.equal((await status()).totals.messages, 2);
        assert.equal(historyReads, 1);
        psql(db, `update app.telegram_connections set lease_expires_at=now()-interval '1 second' where id='${lease.id}'`);
        const renewed = await connector('claim');
        assert.notEqual(renewed.leaseToken, context.connectionLeaseToken);
        context.connectionLeaseToken = renewed.leaseToken;
        context.connectionLeaseExpiresAt = renewed.leaseExpiresAt;
        vault = createVault(vaultConfig);
        runtime = createHistoryWorker({ host, vault, now });
        await runtime.tick(context);
        assert.equal(historyReads, 1, 'Restart must replay the pending page before requesting another');
        assert.equal((await status()).totals.messages, 2);
        const historyCompletions = completions.filter(row => row.body.records.some(record => record.messageId));
        assert.equal(historyCompletions.length, 2);
        const { connectionLeaseToken: previousProof, ...originalPage } = historyCompletions[0].body;
        const { connectionLeaseToken: renewedProof, ...retriedPage } = historyCompletions[1].body;
        assert.notEqual(previousProof, renewedProof, 'Retry uses the freshly claimed connection proof');
        assert.deepEqual(originalPage, retriedPage);
        assert.equal(historyCompletions[1].result.replayed, true);
    });

    await t.test('pause halts reads and resume completes text and attachment-only history exactly once', async () => {
        chat = (await status()).chats[0];
        await action({ action: 'pause', chatId: chat.id, expectedVersion: chat.version });
        await runtime.tick(context);
        assert.equal(historyReads, 1);
        chat = (await status()).chats[0];
        assert.equal(chat.import.status, 'paused');
        await action({ action: 'resume', chatId: chat.id, expectedVersion: chat.version });
        clock += 5001;
        await runtime.tick(context);
        assert.equal((await status()).totals.messages, 4);
        await runtime.tick(context);
        const final = await status();
        assert.equal(final.chats[0].import.status, 'completed');
        assert.equal(final.totals.messages, 4);
        assert.equal(historyReads, 3, 'Two data pages and one genuinely empty page');
        const attachmentPage = completions.find(row => row.body.records.some(record => record.messageId === '102'));
        assert.equal(attachmentPage.body.records.find(record => record.messageId === '102').attachments[0].filename, 'synthetic-cv.pdf');
    });

    await t.test('disconnect prevents stale runtime from making additional Telegram reads', async () => {
        await telegramConnectionAction(pool, owner, org, { action: 'disconnect', connectionId: lease.id, generation: lease.generation });
        await runtime.tick(context).catch(error => assert.ok(error.code === '40001' || /HOST_UNAVAILABLE|STALE/.test(error.message)));
        assert.equal(historyReads, 3);
        assert.equal((await status()).totals.messages, 4, 'Disconnect retains private imported history');
    });
});

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
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
import { telegramExtractionAction, telegramExtractionStatus, telegramExtractionWorkerOperation } from '../../src/lib/telegram-extraction-operations.js';
import { getTelegramDraft, decideTelegramDraft } from '../../src/lib/telegram-intake-operations.js';
import { telegramCvAction, telegramCvWorkerOperation, uploadTelegramCv } from '../../src/lib/telegram-cv-operations.js';
import { createSyntheticPdf } from '../support/cv-fixtures.js';
import { createProvider } from '../../services/telegram-extraction-worker/provider.mjs';
import { createExtractionWorker } from '../../services/telegram-extraction-worker/worker.mjs';
import { createPendingStore } from '../../services/telegram-extraction-worker/store.mjs';

const owner = { provider: 'google', issuer: 'https://accounts.google.com', subject: CJ_SUBJECTS.ADMIN };
const org = AUTHZ_ID.ORG_B;
const peer = { kind: 'user', id: '456789012345' };
const message = id => ({ messageId: String(id), kind: 'message', sentAt: '2026-09-29T12:00:00.000Z', editedAt: null,
  sender: { peer, username: 'synthetic_candidate', displayName: 'Synthetic Candidate' }, replyToMessageId: null, forwardedFrom: null,
  text: `I am Synthetic Candidate. My email is synthetic@example.test. Recruiting history ${id}.`, attachments: [] });

// This uses the real provider HTTP adapter, durable encrypted worker queue and
// restricted hosted database operations. The provider is deliberately synthetic;
// this tests delivery/validation, not the quality of a live model's interpretation.
import { handleTelegramMaintenance } from '../../src/lib/telegram-maintenance.js';
test('full history catch-up and reviewed cleanup preserve encrypted completion replay across restart', { timeout: 120000 }, async t => {
  assertLocalTestEnvironment();
  const db = await startPostgresContainer('pgtelegramextractionruntime', POSTGRES_17_IMAGE, { publish: true });
  const root = mkdtempSync(join(tmpdir(), 'agora-extraction-runtime-'));
  let pool; let workerPool; let maintenancePool; let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await Promise.all([pool?.end(), workerPool?.end(), maintenancePool?.end()]); stopAndRemoveContainer(db); rmSync(root, { recursive: true, force: true });
  });
  const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
  for (const name of readdirSync(dir).filter(name => name >= '20260922090000_foundation_roles.sql' && name <= '20261002190000_telegram_retention.sql' && name.endsWith('.sql')).sort()) psql(db, readFileSync(join(dir, name), 'utf8'));
  const password = installStaffFixture(db); psql(db, clientJobFixtureSql);
  pool = new pg.Pool(staffPoolOptions(db, password, 3));
  const workerPassword = randomUUID();
  psql(db, `create role extraction_runtime_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${workerPassword}'; grant app_telegram_worker to extraction_runtime_test;`);
  workerPool = new pg.Pool({ ...staffPoolOptions(db, workerPassword, 3), user: 'extraction_runtime_test' });
  const staff = (sql, args = []) => withStaffTransaction(pool, owner, org, ['candidates.read', 'candidates.write'], async ({ client }) => (await client.query(sql, args)).rows[0]?.result);
  const token = randomBytes(48).toString('base64url');
  const registered = await staff('select app.telegram_register_worker_v1($1,$2) as result', ['Synthetic extraction Mac', token]);
  const connector = (action, body = {}) => telegramConnectorOperation(workerPool, token, action, body);
  const publicKeySpki = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  await connector('heartbeat', { publicKeySpki });
  await telegramConnectionAction(pool, owner, org, { action: 'connect', workerId: registered.id });
  const lease = await connector('claim');
  await connector('update', { connectionId: lease.id, generation: lease.generation, leaseToken: lease.leaseToken,
    status: 'connected', profile: { telegramUserId: '123456789012345', username: 'synthetic_owner', displayName: 'Synthetic Owner' } });
  const proof = { connectionId: lease.id, generation: lease.generation, connectionLeaseToken: lease.leaseToken, accountUserId: '123456789012345' };
  const history = (action, body = {}) => telegramHistoryWorkerOperation(workerPool, token, action, { ...proof, ...body });
  await telegramHistoryAction(pool, owner, org, { action: 'discover' });
  let inserted = false;
  for (let i = 0; i < 4; i++) {
    const job = (await history('claim')).job; if (!job) break;
    const records = inserted ? [] : [{ peer, title: 'Synthetic candidate history', username: 'synthetic_candidate', lastMessageAt: null }];
    inserted = true;
    await history('complete', { jobId: job.id, jobLeaseToken: job.leaseToken, pageId: randomUUID(), fromCursor: job.cursor,
      nextCursor: records.length ? { ...job.cursor, offsetDate: 1, offsetId: '1', offsetPeer: peer, excludePinned: true } : job.cursor, done: !records.length, records });
  }
  const chat = (await telegramHistoryStatus(pool, owner, org)).chats[0];
  await telegramHistoryAction(pool, owner, org, { action: 'select', chatId: chat.id, expectedVersion: chat.version, selected: true });
  const importJob = (await history('claim')).job;
  const largeMessage = message(3);
  const cvBytes = createSyntheticPdf();
  largeMessage.text = 'I am Synthetic Candidate. My email is synthetic@example.test. ' + '\u0001'.repeat(32000) + ' résumé 中文 🚀';
  largeMessage.attachments = Array.from({ length: 16 }, (_, i) => ({ id: String(i + 1), kind: 'document', filename: `${'履'.repeat(190)}-${i}.pdf`, mimeType: 'application/pdf', sizeBytes: 100 }));
  largeMessage.attachments[0] = { ...largeMessage.attachments[0], filename: 'Synthetic CV.pdf', sizeBytes: cvBytes.length };
  const firstPage = { jobId: importJob.id, jobLeaseToken: importJob.leaseToken, pageId: randomUUID(), fromCursor: importJob.cursor,
    nextCursor: { beforeMessageId: '3', upperMessageId: '3' }, done: false, records: [largeMessage] };
  await history('complete', firstPage);
  assert.equal((await telegramExtractionAction(pool, owner, org, { action: 'enqueue', chatIds: [chat.id] })).queued, 1);
  const maintenancePassword = randomUUID();
  psql(db, `create role maintenance_runtime_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${maintenancePassword}'; grant app_telegram_maintenance to maintenance_runtime_test;`);
  maintenancePool = new pg.Pool({ ...staffPoolOptions(db, maintenancePassword, 1), user: 'maintenance_runtime_test' });
  await assert.rejects(maintenancePool.query('select * from app.telegram_history_messages'), error => error.code === '42501');
  const maintenanceSecret = randomBytes(32).toString('base64url');
  const maintenance = async () => {
    const response = await handleTelegramMaintenance(new Request('https://synthetic.invalid/api/telegram-maintenance', { headers: { authorization: `Bearer ${maintenanceSecret}` } }), {
      secret: maintenanceSecret, getPool: () => maintenancePool,
    });
    assert.equal(response.status, 200); return response.json();
  };
  const providerToken = randomBytes(32).toString('base64url');
  const providerTokenFile = join(root, 'provider-token'); writeFileSync(providerTokenFile, providerToken, { mode: 0o600 });
  let providerCalls = 0; const sourceMessageIds = [];
  server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, `Bearer ${providerToken}`);
      let raw = ''; for await (const chunk of request) raw += chunk;
      const source = JSON.parse(JSON.parse(raw).messages[1].content).source;
      assert.equal(source.messages.length, 1); sourceMessageIds.push(source.messages[0].messageId); providerCalls++;
      if (providerCalls === 1) assert.deepEqual(source.messages[0], largeMessage, 'No legal source bytes or attachment metadata may be truncated');
      const first = source.messages[0]; const quote = 'I am Synthetic Candidate. My email is synthetic@example.test.';
      const fact = (field, value) => ({ field, value, evidence: [{ messageId: first.messageId, quote }] });
      const result = { subjects: providerCalls === 1 ? [{ key: 'candidate', identity: { kind: 'telegram_sender', messageId: first.messageId, quote },
        facts: [fact('firstName', 'Synthetic'), fact('lastName', 'Candidate'), fact('primaryEmail', 'synthetic@example.test')], attachments: [{ messageId: first.messageId, attachmentIndex: 0 }] }] : [] };
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }));
    } catch { response.writeHead(500); response.end('Synthetic provider assertion failed'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const provider = createProvider({ providerBaseUrl: `http://127.0.0.1:${server.address().port}/v1`, providerModel: 'synthetic-model', providerTokenFile });
  let loseAck = true; let committed; let committedBody;
  const host = async (action, body) => {
    const result = await telegramExtractionWorkerOperation(workerPool, token, action, body).catch(error => {
      error.status = { '40001': 409, '22023': 400, '42501': 403, P0002: 404 }[error.code]; throw error;
    });
    if (action === 'complete' && loseAck) {
      loseAck = false; committed = result; committedBody = structuredClone(body); throw new Error('SYNTHETIC_ACK_LOST');
    }
    return result;
  };
  const storeConfig = { root: join(root, 'encrypted-state'), server: 'https://synthetic.invalid', workerToken: token };
  let pendingStore = createPendingStore(storeConfig);
  let runtime = createExtractionWorker({ host, provider, pendingStore });
  await assert.rejects(runtime.tick(), /SYNTHETIC_ACK_LOST/);
  assert.equal(providerCalls, 1); assert.ok(await pendingStore.load());
  const jobId = committedBody.jobId;
  let batch = await telegramExtractionStatus(pool, owner, org, { jobId });
  assert.equal(batch.sourceRetention.state, 'kept');
  assert.equal((await maintenance()).batchesPurged, 0, 'Source context is retained without a release decision');
  await telegramExtractionAction(pool, owner, org, { action: 'sourceRetention', jobId, expectedSourceVersion: batch.sourceRetention.version, mode: 'release_after_review' });
  assert.equal((await maintenance()).batchesPurged, 0, 'An unresolved draft holds released sources');
  let draft = await getTelegramDraft(pool, owner, org, committed.draftIds[0]);
  assert.equal(draft.fields.secondaryEmails, undefined, 'This profile reaches approval without a human edit that normalizes optional fields');
  await telegramCvAction(pool, owner, org, { action: 'retrieve', draftId: draft.id, expectedDocumentRevision: draft.documentRevision, extractionJobId: jobId, messageId: '3', attachmentIndex: 0 });
  const cvJob = (await telegramCvWorkerOperation(workerPool, token, 'claim', proof)).job;
  const uploadProof = { ...proof, jobId: cvJob.id, jobLeaseToken: cvJob.leaseToken, sourceDigest: cvJob.sourceDigest, sha256: createHash('sha256').update(cvBytes).digest('hex'), sizeBytes: cvBytes.length };
  let uploads = 0; const objects = new Map();
  const storage = { storage: { from: () => ({ upload: async (key, bytes) => { uploads++; objects.set(key, Buffer.from(bytes)); return { data: { path: key } }; } }) } };
  const cvReceipt = await uploadTelegramCv(workerPool, token, uploadProof, async () => cvBytes, storage);
  draft = await getTelegramDraft(pool, owner, org, draft.id);
  const approved = await decideTelegramDraft(pool, owner, org, draft.id, { action: 'approve', expectedVersion: draft.version, operationId: randomUUID() });
  assert.equal(approved.status, 'approved');
  const purged = await maintenance(); assert.equal(purged.batchesPurged, 1); assert.equal(purged.messagesPurged, 1); assert.ok(purged.bytesFreed > 49152);
  batch = await telegramExtractionStatus(pool, owner, org, { jobId });
  assert.equal(batch.source, null); assert.equal(batch.sourceRetention.state, 'purged');
  assert.equal((await maintenance()).bytesFreed, 0, 'Repeated cleanup cannot free quota twice');
  const closed = await getTelegramDraft(pool, owner, org, draft.id);
  assert.equal(closed.status, 'approved'); assert.deepEqual(closed.fields, {});
  assert.equal(psql(db, `select contact_email from app.candidates where id='${approved.candidateId}'`).trim(), 'synthetic@example.test');
  assert.equal(objects.size, 1, 'Approved CV bytes survive raw conversation cleanup');
  assert.deepEqual(await uploadTelegramCv(workerPool, token, uploadProof, async () => { throw new Error('Completed CV replay must not reread bytes after purge'); }, storage), cvReceipt);
  assert.equal(uploads, 1);

  // The Mac restarts after host cleanup, still carrying the encrypted completion
  // whose acknowledgement was lost. It must replay without re-reading the model.
  pendingStore = createPendingStore(storeConfig); runtime = createExtractionWorker({ host, provider, pendingStore });
  assert.equal(await runtime.tick(), 'completed'); assert.equal(providerCalls, 1); assert.equal(await pendingStore.load(), null);
  await assert.rejects(host('complete', { ...committedBody, metadata: { ...committedBody.metadata, model: 'changed-model' } }), error => error.status === 409);
  assert.equal(await runtime.tick(), 'idle', 'Initial extraction queue is empty while full import is still running');
  await history('complete', firstPage); // Exact original page receipt remains valid.
  assert.equal(Number(psql(db, 'select count(*) from app.telegram_history_messages').trim()), 0);
  const later = (await history('claim')).job;
  await history('complete', { jobId: later.id, jobLeaseToken: later.leaseToken, pageId: randomUUID(), fromCursor: later.cursor,
    nextCursor: { beforeMessageId: '2', upperMessageId: '3' }, done: false, records: [message(2)] });
  assert.equal(await runtime.tick(), 'completed', 'Late imported page automatically starts extraction without another recruiter action');
  assert.deepEqual(sourceMessageIds, ['3', '2']); assert.equal(providerCalls, 2);
  const finalPage = (await history('claim')).job;
  await history('complete', { jobId: finalPage.id, jobLeaseToken: finalPage.leaseToken, pageId: randomUUID(), fromCursor: finalPage.cursor, nextCursor: finalPage.cursor, done: true, records: [] });
  assert.equal(await runtime.tick(), 'idle');
  assert.equal((await telegramHistoryStatus(pool, owner, org)).chats[0].extractionEnabled, true);
});

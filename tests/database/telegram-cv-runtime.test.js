import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
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
import { telegramExtractionAction, telegramExtractionWorkerOperation } from '../../src/lib/telegram-extraction-operations.js';
import { getTelegramDraft, updateTelegramDraft } from '../../src/lib/telegram-intake-operations.js';
import { createSyntheticPdf } from '../support/cv-fixtures.js';
import { createVault } from '../../services/telegram-connector/vault.mjs';
import { createCvWorker } from '../../services/telegram-connector/cv-worker.mjs';
import { telegramCvStatus, telegramCvAction, telegramCvWorkerOperation, uploadTelegramCv } from '../../src/lib/telegram-cv-operations.js';

const owner = { provider: 'google', issuer: 'https://accounts.google.com', subject: CJ_SUBJECTS.ADMIN };
const org = AUTHZ_ID.ORG_B;
const peer = { kind: 'user', id: '456789012345' };
const pdf = createSyntheticPdf({ paddingBytes: 1024 * 1024 });
const message = id => ({ messageId: String(id), kind: 'message', sentAt: '2026-09-29T12:00:00.000Z', editedAt: null,
  sender: { peer, username: 'synthetic_candidate', displayName: 'Synthetic Candidate' }, replyToMessageId: null, forwardedFrom: null,
  text: `I am Synthetic Candidate. My email is synthetic@example.test. Recruiting history ${id}.`, attachments: [{ id: '99887766', kind: 'document', filename: 'Synthetic-CV.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length }] });

async function fixture(t) {
  assertLocalTestEnvironment();
  const db = await startPostgresContainer('pgtelegramcvruntime', POSTGRES_17_IMAGE, { publish: true });
  const root = mkdtempSync(join(tmpdir(), 'agora-cv-runtime-'));
  let pool; let workerPool;
  t.after(async () => {
    await Promise.all([pool?.end(), workerPool?.end()]); stopAndRemoveContainer(db); rmSync(root, { recursive: true, force: true });
  });
  const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
  for (const name of readdirSync(dir).filter(name => name >= '20260922090000_foundation_roles.sql' && name <= '20261002170000_telegram_cv.sql' && name.endsWith('.sql')).sort()) psql(db, readFileSync(join(dir, name), 'utf8'));
  const password = installStaffFixture(db); psql(db, clientJobFixtureSql);
  pool = new pg.Pool(staffPoolOptions(db, password, 3));
  const workerPassword = randomUUID();
  psql(db, `create role cv_runtime_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${workerPassword}'; grant app_telegram_worker to cv_runtime_test;`);
  workerPool = new pg.Pool({ ...staffPoolOptions(db, workerPassword, 3), user: 'cv_runtime_test' });
  const staff = (sql, args = []) => withStaffTransaction(pool, owner, org, ['candidates.read', 'candidates.write'], async ({ client }) => (await client.query(sql, args)).rows[0]?.result);
  const token = randomBytes(48).toString('base64url');
  const registered = await staff('select app.telegram_register_worker_v1($1,$2) as result', ['Synthetic CV Mac', token]);
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
  let importJob = (await history('claim')).job;
  await history('complete', { jobId: importJob.id, jobLeaseToken: importJob.leaseToken, pageId: randomUUID(), fromCursor: importJob.cursor,
    nextCursor: { beforeMessageId: '1', upperMessageId: '1' }, done: false, records: [message(1)] });
  importJob = (await history('claim')).job;
  await history('complete', { jobId: importJob.id, jobLeaseToken: importJob.leaseToken, pageId: randomUUID(), fromCursor: importJob.cursor, nextCursor: importJob.cursor, done: true, records: [] });
  assert.equal((await telegramExtractionAction(pool, owner, org, { action: 'enqueue', chatIds: [chat.id] })).queued, 1);

  const extraction = (await telegramExtractionWorkerOperation(workerPool, token, 'claim', {})).job;
  const source = extraction.source.messages[0];
  const fact = (field, value) => ({ field, value, evidence: [{ messageId: source.messageId, quote: source.text }] });
  const completed = await telegramExtractionWorkerOperation(workerPool, token, 'complete', {
    jobId: extraction.id, leaseToken: extraction.leaseToken, sourceDigest: extraction.sourceDigest,
    metadata: { model: 'synthetic', promptVersion: 'candidate-extraction-prompt-v1', reportedModel: null },
    result: { subjects: [{ key: 'candidate', identity: { kind: 'telegram_sender', messageId: source.messageId, quote: source.text },
      facts: [fact('firstName', 'Synthetic'), fact('lastName', 'Candidate'), fact('primaryEmail', 'synthetic@example.test')],
      attachments: [{ messageId: source.messageId, attachmentIndex: 0 }] }] },
  });
  const draftId = completed.draftIds[0];
  const draft = () => getTelegramDraft(pool, owner, org, draftId);
  const action = body => telegramCvAction(pool, owner, org, body);
  const status = () => telegramCvStatus(pool, owner, org, draftId);
  const detail = await status(); const reference = detail.attachments[0];
  assert.equal(reference.eligible, true);
  await action({ action: 'retrieve', draftId, expectedDocumentRevision: detail.documentRevision,
    extractionJobId: reference.extractionJobId, messageId: reference.messageId, attachmentIndex: reference.attachmentIndex });
  const context = { ...proof, connectionLeaseExpiresAt: lease.leaseExpiresAt, signal: new AbortController().signal, isActive: () => true };
  return { db, root, pool, workerPool, token, registered, connector, context, draft, draftId, action, status };
}

// Actual encrypted connector runner and restricted hosted database operations.
// Only Telegram RPC results and private storage are synthetic; no live account,
// production database, storage service or provider is accessed by this test.
test('CV retrieval resumes encrypted chunks and reconciles a committed upload without replacing profile edits', { timeout: 120000 }, async t => {
  const f = await fixture(t);
  const files = new Map(); let storageWrites = 0; let storageDownloads = 0; let loseStorageAck = true; let bodyReads = 0; let uploadCalls = 0; let inspections = 0; let chunkReads = 0;
  const offsets = [];
  const storage = { storage: { from(bucket) {
    assert.equal(bucket, 'cv-submissions');
    return {
      async upload(key, bytes, options) {
        assert.equal(options.upsert, false); assert.equal(options.contentType, 'application/pdf');
        if (files.has(key)) return { data: null, error: { status: 400, statusCode: '400', error: 'Duplicate', message: 'The resource already exists' } };
        storageWrites++; files.set(key, Buffer.from(bytes));
        if (loseStorageAck) { loseStorageAck = false; throw new Error('SYNTHETIC_STORAGE_ACK_LOST'); }
        return { data: { path: key }, error: null };
      },
      async download(key) { storageDownloads++; return files.has(key) ? { data: new Blob([files.get(key)]), error: null } : { data: null, error: { status: 404, message: 'Not found' } }; },
    };
  } } };
  const mapError = error => { error.status ??= { '40001': 409, '22023': 400, '42501': 403, P0002: 404 }[error.code]; throw error; };
  const host = (action, body) => telegramCvWorkerOperation(f.workerPool, f.token, action, body).catch(mapError);
  let loseAck = true;
  const upload = async (proof, bytes) => {
    uploadCalls++;
    const result = await uploadTelegramCv(f.workerPool, f.token, proof, async () => { bodyReads++; return Buffer.from(bytes); }, storage).catch(mapError);
    if (loseAck) { loseAck = false; throw new Error('SYNTHETIC_UPLOAD_ACK_LOST'); }
    return result;
  };
  f.context.telegram = { cv: {
    async inspect({ peer: requestedPeer, messageId, attachment }) {
      inspections++; assert.deepEqual(requestedPeer, peer); assert.equal(messageId, '1'); assert.equal(attachment.id, '99887766');
      return { id: attachment.id, accessHash: '111222333', fileReference: Buffer.from('synthetic-private-reference').toString('base64'), dcId: 2, sizeBytes: pdf.length };
    },
    async chunk({ location, offset }) {
      assert.equal(location.id, '99887766'); chunkReads++; offsets.push(offset);
      return Buffer.from(pdf.subarray(offset, Math.min(offset + 512 * 1024, pdf.length)));
    },
  } };
  const vaultConfig = { root: join(f.root, 'vault'), server: 'https://synthetic.invalid', workerId: f.registered.id };
  let vault = createVault(vaultConfig);
  let runtime = createCvWorker({ host, upload, vault });
  await runtime.tick(f.context); // Inspect original source before accepting bytes.
  await runtime.tick(f.context); // First bounded chunk.
  assert.equal(chunkReads, 1); assert.equal(storageWrites, 0);
  let before = await f.draft();
  const edited = await updateTelegramDraft(f.pool, owner, org, f.draftId, { expectedVersion: before.version, fields: { location: 'Recruiter-reviewed location' } });
  assert.equal(edited.documentRevision, before.documentRevision, 'Ordinary field edits do not invalidate a document retrieval');

  vault = createVault(vaultConfig); runtime = createCvWorker({ host, upload, vault });
  let lost = false;
  for (let i = 0; i < 12 && !lost; i++) {
    try { await runtime.tick(f.context); }
    catch (error) { assert.match(error.message, /SYNTHETIC_STORAGE_ACK_LOST/); lost = true; }
  }
  assert.equal(lost, true); assert.equal(storageWrites, 1); assert.equal(bodyReads, 1);
  assert.equal((await f.draft()).cv, null, 'Uncertain storage response does not prematurely attach the document');
  await assert.rejects(runtime.tick(f.context), /SYNTHETIC_UPLOAD_ACK_LOST/);
  assert.equal(storageWrites, 1); assert.equal(storageDownloads, 1); assert.equal(bodyReads, 2);
  assert.deepEqual(offsets, [0, 512 * 1024, 1024 * 1024], 'Restart resumes after verified encrypted bytes rather than downloading the first chunk twice');
  assert.equal(inspections, 2, 'Restart rechecks exact source identity before resuming');
  assert.deepEqual([...files.values()][0], pdf);
  const readsBeforeReplay = chunkReads; const inspectionsBeforeReplay = inspections;
  psql(f.db, `update app.telegram_connections set lease_expires_at=now()-interval '1 second' where id='${f.context.connectionId}'`);
  const renewed = await f.connector('claim');
  assert.notEqual(renewed.leaseToken, f.context.connectionLeaseToken);
  f.context.connectionLeaseToken = renewed.leaseToken; f.context.connectionLeaseExpiresAt = renewed.leaseExpiresAt;
  vault = createVault(vaultConfig); runtime = createCvWorker({ host, upload, vault });
  await runtime.tick(f.context);
  assert.equal(uploadCalls, 3); assert.equal(bodyReads, 2, 'Committed receipt replay is authenticated before any upload body read');
  assert.equal(storageWrites, 1); assert.equal(chunkReads, readsBeforeReplay); assert.equal(inspections, inspectionsBeforeReplay);
  const final = await f.draft();
  assert.equal(final.fields.location, 'Recruiter-reviewed location'); assert.equal(final.cv.filename, 'Synthetic-CV.pdf');
  assert.equal(final.documentRevision, before.documentRevision + 1); assert.ok(final.version > edited.version);
  assert.ok(!final.missingFields.includes('cv')); assert.equal((await f.status()).jobs[0].status, 'completed');
  assert.equal(await runtime.tick(f.context).then(result => result.status), 'idle');
});

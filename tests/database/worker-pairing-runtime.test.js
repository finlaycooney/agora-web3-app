import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { POSTGRES_17_IMAGE, assertLocalTestEnvironment, psql, startPostgresContainer, stopAndRemoveContainer } from '../support/foundation-docker.js';
import { AUTHZ_ID, installStaffFixture, staffPoolOptions } from '../support/staff-authorization.js';
import { CJ_SUBJECTS, clientJobFixtureSql } from '../support/client-job-workflows.js';
import { workerDeviceAction, workerDeviceStatus, workerPairingOperation } from '../../src/lib/worker-pairing-operations.js';
import { telegramConnectorOperation, telegramConnectionStatus } from '../../src/lib/telegram-connection-operations.js';
import { revokeTelegramWorker } from '../../src/lib/telegram-intake-operations.js';
import { createPairingClient } from '../../services/worker-pairing/client.mjs';
import { createPairingStore } from '../../services/worker-pairing/vault.mjs';

const owner = { provider: 'google', issuer: 'https://accounts.google.com', subject: CJ_SUBJECTS.ADMIN };
const org = AUTHZ_ID.ORG_B;
const hash = value => createHash('sha256').update(value).digest('hex');

test('Mac pairing survives lost acknowledgements and its credential enters the existing connector workflow', { timeout: 120000 }, async t => {
  assertLocalTestEnvironment();
  const db = await startPostgresContainer('workerpairingruntime', POSTGRES_17_IMAGE, { publish: true });
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agora-pairing-runtime-')));
  let pool, workerPool, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await Promise.all([pool?.end(), workerPool?.end()]);
    stopAndRemoveContainer(db); rmSync(root, { recursive: true, force: true });
  });
  const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
  for (const file of readdirSync(dir).filter(name => name >= '20260922090000_foundation_roles.sql' && name <= '20261002220000_worker_pairing.sql' && name.endsWith('.sql')).sort()) psql(db, readFileSync(join(dir, file), 'utf8'));
  const password = installStaffFixture(db); psql(db, clientJobFixtureSql);
  pool = new pg.Pool(staffPoolOptions(db, password, 3));
  const workerPassword = randomUUID();
  // Production's existing worker-group membership must also admit the narrow
  // pairing role; no new login or credential is provisioned for enrollment.
  psql(db, `create role pairing_runtime_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${workerPassword}'; grant app_telegram_worker to pairing_runtime_test;`);
  workerPool = new pg.Pool({ ...staffPoolOptions(db, workerPassword, 3), user: 'pairing_runtime_test' });

  const invitationSecret = randomBytes(32).toString('base64url');
  const invited = await workerDeviceAction(pool, owner, org, { action: 'invite', operationId: randomUUID(), invitationSha256: hash(invitationSecret), name: 'Synthetic recruiter Mac' });
  let claimCommitted = false, recoveredClaim = false, droppedApproval = false;
  const responseBodies = [];
  // Real HTTP transport and database operations, with deliberate socket loss
  // after COMMIT. This adapter tests the Mac protocol, not Next's staff gate.
  server = createServer(async (request, response) => {
    try {
      const action = request.url?.split('/').at(-1);
      const authorization = request.headers.authorization ?? '';
      assert.match(authorization, action === 'claim' ? /^PairingInvite [A-Za-z0-9_-]{43}$/ : /^PairingPoll [A-Za-z0-9_-]{43}$/);
      const bytes = []; let length = 0;
      for await (const part of request) { length += part.length; assert.ok(length <= 2048); bytes.push(part); }
      const result = await workerPairingOperation(workerPool, action, authorization.split(' ')[1], JSON.parse(Buffer.concat(bytes).toString()));
      const body = JSON.stringify(result); responseBodies.push(body);
      if (action === 'claim' && !claimCommitted) { claimCommitted = true; response.destroy(); return; }
      if (action === 'poll' && result.status === 'claimed') recoveredClaim = true;
      if (action === 'poll' && result.status === 'approved' && !droppedApproval) { droppedApproval = true; response.destroy(); return; }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'private, no-store' }); response.end(body);
    } catch (error) {
      response.writeHead(error.status ?? 500, { 'content-type': 'application/json', ...(error.retryAfterSeconds ? { 'retry-after': String(error.retryAfterSeconds) } : {}) });
      response.end(JSON.stringify({ error: 'Synthetic test response.', code: error.code ?? 'TEST_ERROR', ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) }));
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const serverOrigin = `http://127.0.0.1:${server.address().port}`;
  const directory = join(root, 'device');
  let store = createPairingStore({ directory });
  let client = createPairingClient({ store });
  const started = client.initialize({ serverOrigin, invitation: `${invited.pairingId}.${invitationSecret}`, deviceName: 'Synthetic test computer' });
  const pending = store.loadPending();
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.equal((await client.tick()).status, 'retry'); assert.equal(claimCommitted, true);
  assert.equal(store.loadCredential(), null);
  await assert.rejects(telegramConnectorOperation(workerPool, pending.workerToken, 'claim', {}), { code: '42501' });

  async function advanceUntil(done) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = await client.tick();
      if (done(result)) return result;
      assert.ok(['claimed', 'waiting', 'retry'].includes(result.status), `Unexpected pairing status: ${result.status}`);
      await setTimeout(Math.max(1, result.retryAfterSeconds ?? 5) * 1000);
    }
    assert.fail('Pairing did not reconcile within its bounded retry window');
  }
  store = createPairingStore({ directory }); client = createPairingClient({ store });
  await advanceUntil(() => recoveredClaim);
  const claimed = await workerDeviceStatus(pool, owner, org, { pairingId: invited.pairingId });
  assert.equal(claimed.status, 'claimed'); assert.equal(claimed.deviceFingerprint, started.fingerprint);
  const approve = { action: 'approve', operationId: randomUUID(), pairingId: invited.pairingId, deviceFingerprint: claimed.deviceFingerprint };
  const approved = await workerDeviceAction(pool, owner, org, approve);
  assert.deepEqual(await workerDeviceAction(pool, owner, org, approve), approved, 'An uncertain browser approval replays the same worker');
  await advanceUntil(() => droppedApproval);
  assert.equal(store.loadCredential(), null);
  store = createPairingStore({ directory }); client = createPairingClient({ store });
  await advanceUntil(result => result.status === 'approved');
  const credential = store.loadCredential();
  assert.equal(credential.workerId, approved.worker.id); assert.equal(credential.token, pending.workerToken);
  assert.equal(credential.server, serverOrigin); assert.equal(credential.organization.id, org);
  assert.equal(statSync(store.credentialPath).mode & 0o777, 0o600);
  assert.equal(store.loadPending(), null);
  for (const body of responseBodies) for (const secret of [pending.workerToken, pending.pollVerifier, invitationSecret]) assert.ok(!body.includes(secret), 'Host responses must never disclose credentials or enrollment proofs');

  const publicKeySpki = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  await telegramConnectorOperation(workerPool, credential.token, 'heartbeat', { publicKeySpki });
  const connection = await telegramConnectionStatus(pool, owner, org);
  assert.equal(connection.workers.filter(worker => worker.id === credential.workerId).length, 1);
  const devices = await workerDeviceStatus(pool, owner, org, {});
  assert.equal(devices.devices.filter(worker => worker.id === credential.workerId).length, 1);
  await revokeTelegramWorker(pool, owner, org, credential.workerId);
  await assert.rejects(telegramConnectorOperation(workerPool, credential.token, 'heartbeat', { publicKeySpki }), { code: '42501' });
  assert.equal(store.loadCredential().token, credential.token, 'Revoking hosted access does not claim to wipe this Mac');
});

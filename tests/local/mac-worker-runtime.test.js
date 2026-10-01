import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as portServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { INDEX_VERSION, CHUNKER_VERSION, PROJECTION_VERSION } from '../../services/semantic-worker/constants.mjs';

const enabled = process.env.MAC_WORKER_PYTHON && process.env.MAC_WORKER_MODEL_DIRECTORY;
test('actual foreground launcher starts the pinned model and four paired workers, then restarts without moving state', { skip: !enabled, timeout: 240000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mac-worker-runtime-')));
  const token = randomBytes(48).toString('base64url'), calls = new Set();
  let child, server, failure, issued = false, completed = 0;
  t.after(async () => { if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } rmSync(root, { recursive: true, force: true }); });
  const query = 'Engineer with Ethereum protocol experience';
  server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()); calls.add(request.url);
      let result = { job: null, ok: true };
      if (request.url === '/api/profile-search/worker/claim' && !issued) {
        issued = true; result = { job: { id: randomUUID(), leaseToken: randomUUID(), kind: 'query', leaseExpiresAt: new Date(Date.now() + 120000).toISOString(), query, querySha256: createHash('sha256').update(query).digest('hex'), indexVersion: INDEX_VERSION, chunkerVersion: CHUNKER_VERSION, projectionVersion: PROJECTION_VERSION } };
      } else if (request.url === '/api/profile-search/worker/complete') {
        assert.equal(body.indexVersion, INDEX_VERSION); assert.equal(body.result.embedding.length, 384); completed++;
      } else assert.ok(['/api/telegram-connection/worker/heartbeat', '/api/telegram-connection/worker/claim', '/api/telegram-extraction/worker/claim', '/api/cv-analysis/worker/claim', '/api/profile-search/worker/claim'].includes(request.url), 'Unexpected network request');
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result));
    } catch (error) { failure = error; response.writeHead(500); response.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const host = `http://127.0.0.1:${server.address().port}`;
  const reservation = portServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const modelPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const write = (name, value) => writeFileSync(join(root, name), typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
  write('credential.json', { version: 1, server: host, workerId: randomUUID(), token, name: 'Synthetic Mac', expiresAt: new Date(Date.now() + 86400000).toISOString(), organization: { id: randomUUID(), name: 'Synthetic workspace' } });
  write('provider.token', randomBytes(32).toString('base64url')); write('embedding.token', randomBytes(32).toString('base64url'));
  write('mac.json', { version: 1, credentialFile: './credential.json', runtimeDirectory: './launcher', stateDirectories: { connector: './connector', extraction: './extraction', cvAnalysis: './cv', semantic: './semantic' }, telegram: { apiId: 12345, apiHash: 'a'.repeat(32) }, provider: { baseUrl: `${host}/unexpected-provider`, model: 'synthetic-provider-never-called', tokenFile: './provider.token' }, embedding: { python: process.env.MAC_WORKER_PYTHON, modelDirectory: process.env.MAC_WORKER_MODEL_DIRECTORY, tokenFile: './embedding.token', port: modelPort } });
  let previousIdentity;
  for (let run = 0; run < 2; run++) {
    issued = false; calls.clear(); let output = '';
    child = spawn(process.execPath, ['services/mac-worker/cli.mjs', 'start', '--config', join(root, 'mac.json')], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const deadline = Date.now() + 100000;
    while (completed < run + 1 || !['/api/telegram-connection/worker/heartbeat', '/api/telegram-extraction/worker/claim', '/api/cv-analysis/worker/claim'].every(path => calls.has(path))) {
      if (failure) throw failure;
      assert.equal(child.exitCode, null, `Launcher exited: ${output}`);
      assert.ok(Date.now() < deadline, `Launcher timed out: ${output}`); await delay(100);
    }
    child.kill('SIGTERM'); const [code] = await once(child, 'exit'); assert.equal(code, 0, output);
    assert.match(output, /EMBEDDING_VERIFIED/); assert.match(output, /LAUNCHER_STOPPED_STATE_PRESERVED/);
    for (const secret of [token, 'a'.repeat(32), readFileSync(join(root, 'provider.token'), 'utf8'), readFileSync(join(root, 'embedding.token'), 'utf8'), query]) assert.ok(!output.includes(secret));
    assert.deepEqual(readdirSync(join(root, 'launcher')), []);
    const identities = readdirSync(join(root, 'connector')).filter(entry => /^[a-f0-9]{64}$/.test(entry));
    assert.equal(identities.length, 1);
    const identity = createHash('sha256').update(readFileSync(join(root, 'connector', identities[0], 'identity.json'))).digest('hex');
    if (previousIdentity) assert.equal(identity, previousIdentity); previousIdentity = identity;
  }
});

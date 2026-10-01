import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { loadConfig, childEnvironment, serviceConfigurations } from '../../services/mac-worker/config.mjs';
import { dependencies, assertPortFree, cleanupParsers } from '../../services/mac-worker/preflight.mjs';
import { supervise } from '../../services/mac-worker/supervisor.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agora-launcher-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paired = { version: 1, server: 'https://example.test', workerId: randomUUID(), token: randomBytes(48).toString('base64url'), name: 'Test Mac', expiresAt: '2027-01-01T00:00:00Z', organization: { id: randomUUID(), name: 'Test workspace' } };
  const write = (name, data) => writeFileSync(join(root, name), typeof data === 'string' ? data : JSON.stringify(data), { mode: 0o600 });
  write('credential.json', paired); write('provider.token', 'p'.repeat(32)); write('embedding.token', 'e'.repeat(32));
  const raw = { version: 1, credentialFile: './credential.json', runtimeDirectory: './launcher', stateDirectories: { connector: './connector', extraction: './extraction', cvAnalysis: './cv', semantic: './semantic' }, telegram: { apiId: 123, apiHash: 'a'.repeat(32) }, provider: { baseUrl: 'http://127.0.0.1:8317/v1', model: 'codex-dev', tokenFile: './provider.token' }, embedding: { python: './python', modelDirectory: './model', tokenFile: './embedding.token', port: 18817 } };
  write('config.json', raw);
  return { root, raw, paired, write, config: () => loadConfig(join(root, 'config.json')) };
}

test('launcher resolves explicit stable state and references secrets without copying tokens', t => {
  const f = fixture(t), config = f.config(), generated = serviceConfigurations(config);
  assert.equal(config.credentialFile, join(f.root, 'credential.json'));
  assert.equal(generated.connector.stateDirectory, join(f.root, 'connector'));
  assert.equal(generated.semantic.credentialFile, config.credentialFile);
  const serialized = JSON.stringify(generated);
  assert.ok(!serialized.includes(f.paired.token)); assert.ok(!serialized.includes('p'.repeat(32)));
  assert.deepEqual(childEnvironment({ PATH: '/bin', HOME: '/home/test', TELEGRAM_CONNECTOR_TOKEN: 'secret', SEMANTIC_SERVER_URL: 'https://wrong.test', NODE_OPTIONS: '--inspect', DATABASE_URL: 'secret', HF_TOKEN: 'secret' }), { PATH: '/bin', HOME: '/home/test' });
  assert.ok(!existsSync(config.runtimeDirectory), 'configuration check must not create state');
});

test('launcher rejects unsafe config, overlapping state, and secret symlinks', t => {
  const f = fixture(t);
  chmodSync(join(f.root, 'config.json'), 0o644); assert.throws(f.config, { code: 'UNSAFE_LOCAL_FILE' }); chmodSync(join(f.root, 'config.json'), 0o600);
  f.write('config.json', { ...f.raw, stateDirectories: { ...f.raw.stateDirectories, semantic: './connector/child' } }); assert.throws(f.config, { code: 'INVALID_CONFIG' });
  f.write('config.json', { ...f.raw, arbitraryCommand: 'do not execute' }); assert.throws(f.config, { code: 'INVALID_CONFIG' });
  f.write('config.json', f.raw); rmSync(join(f.root, 'provider.token')); symlinkSync(join(f.root, 'embedding.token'), join(f.root, 'provider.token')); assert.throws(f.config, { code: 'UNSAFE_LOCAL_FILE' });
});

test('dependency check refuses remote Docker before inspecting or running a parser', async t => {
  const f = fixture(t), calls = [];
  await assert.rejects(dependencies(f.config(), f.root, { execute: async (command, args) => {
    calls.push([command, args]); return { stdout: args[0] === 'context' ? JSON.stringify([{ Endpoints: { docker: { Host: 'ssh://remote.test' } } }]) : '' };
  } }), { code: 'LOCAL_DOCKER_REQUIRED' });
  assert.equal(calls.length, 2);
});

test('occupied model port is refused without touching its listener', async () => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await assert.rejects(assertPortFree(server.address().port), { code: 'EMBEDDING_PORT_IN_USE' }); assert.equal(server.listening, true); }
  finally { await new Promise(resolve => server.close(resolve)); }
});

async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) assert.fail('Owned fixture child did not reach expected state'); await delay(20); }
}
function childPlans(root) {
  const code = `import{writeFileSync}from'node:fs';writeFileSync(process.argv[1],String(process.pid));process.once('SIGTERM',()=>{writeFileSync(process.argv[1]+'.stopped','yes');process.exit(0)});setInterval(()=>{},1000);`;
  return ['embedding', 'connector', 'extraction', 'cvAnalysis', 'semantic'].map(name => ({ name, command: process.execPath, args: ['--input-type=module', '-e', code, join(root, `${name}.pid`)], env: childEnvironment() }));
}

test('foreground group stops only its children and preserves state across restarts', { timeout: 20000 }, async t => {
  const f = fixture(t), config = f.config(); const children = [], events = [];
  // An unrelated process is alive throughout both lifecycle runs.
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(() => { unrelated.kill(); for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  mkdirSync(config.stateDirectories.connector, { mode: 0o700 });
  writeFileSync(join(config.stateDirectories.connector, 'pending-receipt'), 'keep', { mode: 0o600 });
  for (let run = 0; run < 2; run++) {
    const controller = new AbortController();
    const promise = supervise(config, f.root, { signal: controller.signal, report: event => events.push(event), portCheck: async () => {}, cleanup: async () => {}, verify: async () => {}, plans: () => childPlans(f.root), spawnImpl: (...args) => { const child = spawn(...args); children.push(child); return child; } });
    await waitFor(() => children.length === (run + 1) * 5 && children.slice(run * 5).every(child => child.pid && existsSync(join(f.root, `${['embedding', 'connector', 'extraction', 'cvAnalysis', 'semantic'][children.indexOf(child) % 5]}.pid`))));
    // A second supervisor must never attach to the first one's processes.
    await assert.rejects(supervise(config, f.root, { portCheck: async () => {} }), { code: 'PAIRING_ALREADY_RUNNING' });
    controller.abort(); await promise;
    assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null));
    assert.equal(readFileSync(join(config.stateDirectories.connector, 'pending-receipt'), 'utf8'), 'keep');
    assert.deepEqual(readdirSync(config.runtimeDirectory), []);
    assert.equal(unrelated.exitCode, null);
    for (const name of ['embedding', 'connector', 'extraction', 'cvAnalysis', 'semantic']) { assert.equal(readFileSync(join(f.root, `${name}.pid.stopped`), 'utf8'), 'yes'); rmSync(join(f.root, `${name}.pid`)); rmSync(join(f.root, `${name}.pid.stopped`)); }
  }
  assert.equal(events.filter(event => event === 'EMBEDDING_VERIFIED').length, 2);
  assert.ok(events.includes('HOSTED_AND_ACCOUNT_READINESS_NOT_VERIFIED'));
});

test('child crash stops siblings without a restart loop', { timeout: 10000 }, async t => {
  const f = fixture(t), children = [], events = [];
  const config = f.config();
  await assert.rejects(supervise(config, f.root, { report: event => events.push(event), verify: async () => {}, portCheck: async () => {}, cleanup: async () => {}, plans: () => [childPlans(f.root)[0], { name: 'connector', command: process.execPath, args: ['-e', 'process.exit(3)'], env: childEnvironment() }], spawnImpl: (...args) => { const child = spawn(...args); children.push(child); return child; } }), { code: 'CHILD_STOPPED' });
  assert.equal(children.length, 2); assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null));
  assert.ok(events.includes('CONNECTOR_STOPPED')); assert.deepEqual(readdirSync(config.runtimeDirectory), []);
});

test('crashed worker descendants are reaped with their exclusively owned process group', { timeout: 10000 }, async t => {
  const f = fixture(t), childPid = join(f.root, 'descendant.pid');
  const childCode = `require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)`;
  const parentCode = `const{spawn}=require('node:child_process');const{existsSync}=require('node:fs');spawn(process.execPath,['-e',${JSON.stringify(childCode)},${JSON.stringify(childPid)}],{stdio:'ignore'});setInterval(()=>{if(existsSync(${JSON.stringify(childPid)}))process.exit(3)},20)`;
  await assert.rejects(supervise(f.config(), f.root, { verify: async () => {}, portCheck: async () => {}, cleanup: async () => {}, plans: () => [childPlans(f.root)[0], { name: 'connector', command: process.execPath, args: ['-e', parentCode], env: childEnvironment() }] }), error => { assert.equal(error.code, 'CHILD_STOPPED', error.cause?.code); return true; });
  const pid = Number(readFileSync(childPid, 'utf8'));
  let state = '';
  try { state = execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim(); } catch { /* Already reaped. */ }
  assert.ok(!state || state.startsWith('Z'), 'No descendant may remain running after supervisor shutdown');
});

test('parser cleanup is limited to this launch label and refuses remote engines', async () => {
  const launch = randomUUID(), calls = [];
  await cleanupParsers(launch, { env: {}, execute: async (command, args) => {
    calls.push(args);
    return { stdout: args[0] === 'context' ? JSON.stringify([{ Endpoints: { docker: { Host: 'unix:///private/docker.sock' } } }]) : args[0] === 'ps' ? '123456abcdef\n' : '' };
  } });
  assert.deepEqual(calls[1], ['ps', '-aq', '--filter', `label=agora.mac-launch=${launch}`]);
  assert.deepEqual(calls[2], ['rm', '-f', '123456abcdef']);
  let requests = 0;
  await assert.rejects(cleanupParsers(launch, { env: {}, execute: async () => { requests++; return { stdout: JSON.stringify([{ Endpoints: { docker: { Host: 'tcp://remote.test:2375' } } }]) }; } }), { code: 'PARSER_CLEANUP_FAILED' });
  assert.equal(requests, 1);
});

test('dependency cancellation reaches the currently running subprocess', async t => {
  const f = fixture(t), controller = new AbortController(); let seen;
  const pending = dependencies(f.config(), f.root, { signal: controller.signal, execute: async (_command, _args, options) => {
    seen = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
  } });
  controller.abort(); await assert.rejects(pending, { code: 'TELEGRAM_RUNTIME_UNAVAILABLE' }); assert.equal(seen, controller.signal);
});

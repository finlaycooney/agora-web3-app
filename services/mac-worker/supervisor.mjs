import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPairingStore } from '../worker-pairing/vault.mjs';
import { LauncherError, privateDirectory, childEnvironment, serviceConfigurations } from './config.mjs';
import { assertPortFree, verifyEmbedding, cleanupParsers } from './preflight.mjs';

export function servicePlans(config, root, directory) {
  const env = childEnvironment();
  const configs = serviceConfigurations(config);
  for (const [name, value] of Object.entries(configs)) writeFileSync(join(directory, `${name}.json`), JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  const node = (name, entry) => ({ name, command: process.execPath, args: [join(root, entry), '--config', join(directory, `${name}.json`)], env });
  return [
    { name: 'embedding', command: config.embedding.python, args: [join(root, 'services/local-embeddings/service.py')], env: { ...env, LOCAL_EMBEDDINGS_PORT: String(config.embedding.port), LOCAL_EMBEDDINGS_MODEL_DIRECTORY: config.embedding.modelDirectory, LOCAL_EMBEDDINGS_TOKEN_FILE: config.embedding.tokenFile } },
    { name: 'connector', command: process.execPath, args: [join(root, 'services/telegram-connector/run.mjs')], env: { ...env, TELEGRAM_CONNECTOR_CONFIG: join(directory, 'connector.json') } },
    node('extraction', 'services/telegram-extraction-worker/cli.mjs'),
    node('cvAnalysis', 'services/cv-analysis-worker/cli.mjs'),
    node('semantic', 'services/semantic-worker/cli.mjs'),
  ];
}

// Only ChildProcess handles created here are signalled; PID files never authorize
// terminating another process. A crashed parent leaves service locks for review.
export async function supervise(config, root, { signal, report = () => {}, spawnImpl = spawn, plans = servicePlans, verify = verifyEmbedding, portCheck = assertPortFree, cleanup = cleanupParsers, readyTimeoutMs = 90000, stopTimeoutMs = 15000 } = {}) {
  privateDirectory(config.runtimeDirectory, true);
  const lock = createPairingStore({ directory: config.runtimeDirectory }).lock();
  const shutdown = new AbortController();
  const abort = () => shutdown.abort(); signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const children = []; let directory; let failure;
  const launchId = randomUUID();
  function start(plan) {
    if (shutdown.signal.aborted) throw new LauncherError('STOPPED');
    const env = plan.name === 'cvAnalysis' ? { ...plan.env, AGORA_MAC_LAUNCH_ID: launchId } : plan.env;
    const child = spawnImpl(plan.command, plan.args, { cwd: root, env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
    const record = { child, name: plan.name, exited: false };
    children.push(record);
    record.done = new Promise(resolve => {
      const finished = () => {
        if (record.exited) return; record.exited = true;
        if (!shutdown.signal.aborted) { failure = new LauncherError('CHILD_STOPPED'); report(`${plan.name.toUpperCase()}_STOPPED`); shutdown.abort(); }
        resolve();
      };
      child.once('error', finished); child.once('exit', finished);
    });
    child.once('spawn', () => report(`${plan.name.toUpperCase()}_PROCESS_RUNNING`));
  }
  try {
    await portCheck(config.embedding.port);
    for (const directory of Object.values(config.stateDirectories)) privateDirectory(directory, true);
    directory = mkdtempSync(join(config.runtimeDirectory, 'launch-'));
    const [embedding, ...workers] = plans(config, root, directory);
    start(embedding);
    const deadline = Date.now() + readyTimeoutMs;
    while (!shutdown.signal.aborted) {
      try { await verify(config, { signal: shutdown.signal }); break; }
      catch (error) {
        if (error.code === 'EMBEDDING_IDENTITY_MISMATCH') throw error;
        if (Date.now() >= deadline) throw new LauncherError('EMBEDDING_NOT_READY');
        await delay(500, undefined, { signal: shutdown.signal }).catch(() => {});
      }
    }
    if (shutdown.signal.aborted) { if (failure) throw failure; return; }
    report('EMBEDDING_VERIFIED');
    for (const worker of workers) start(worker);
    report('HOSTED_AND_ACCOUNT_READINESS_NOT_VERIFIED');
    await new Promise(resolve => { if (shutdown.signal.aborted) resolve(); else shutdown.signal.addEventListener('abort', resolve, { once: true }); });
    if (failure) throw failure;
  } finally {
    shutdown.abort(); signal?.removeEventListener('abort', abort);
    async function stop(records) {
      const groupRunning = record => {
        if (!record.child.pid) return false;
        try {
          const rows = execFileSync('ps', ['-axo', 'pgid=,stat='], { encoding: 'utf8', timeout: 2000, maxBuffer: 1048576 }).trim().split('\n');
          return rows.some(row => { const [group, state] = row.trim().split(/\s+/u); return Number(group) === record.child.pid && !state?.startsWith('Z'); });
        } catch { throw new LauncherError('PROCESS_CLEANUP_FAILED'); }
      };
      const groupSignal = (record, signal) => {
        if (!record.child.pid) return;
        try { process.kill(-record.child.pid, signal); } catch (error) {
          // macOS can return EPERM for an orphan group containing only zombies.
          // Confirm no runnable member remains rather than hiding a live failure.
          if (error.code !== 'ESRCH' && !(error.code === 'EPERM' && !groupRunning(record))) throw new LauncherError('PROCESS_CLEANUP_FAILED');
        }
      };
      // Detached children have exclusive process groups. Signal even a group
      // whose leader exited, so a crashed worker cannot leave a subprocess.
      for (const record of records) groupSignal(record, 'SIGTERM');
      const deadline = Date.now() + stopTimeoutMs;
      while (records.some(record => !record.exited || groupRunning(record)) && Date.now() < deadline) await delay(25);
      for (const record of records) if (groupRunning(record)) groupSignal(record, 'SIGKILL');
      await Promise.all(records.map(record => record.done));
    }
    try {
      const errors = [];
      try { await stop(children.filter(child => child.name !== 'embedding')); } catch (error) { errors.push(error); }
      try { await stop(children.filter(child => child.name === 'embedding')); } catch (error) { errors.push(error); }
      try { if (children.some(child => child.name === 'cvAnalysis')) await cleanup(launchId); } catch (error) { errors.push(error); }
      if (errors.length) throw errors[0];
    } finally {
      if (directory) rmSync(directory, { recursive: true, force: true });
      lock();
    }
    report('LAUNCHER_STOPPED_STATE_PRESERVED');
  }
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { LauncherError, childEnvironment, readToken } from './config.mjs';
import { MODEL, INDEX_VERSION, CHUNKER_VERSION, CV_CHUNKER_VERSION, DIMENSIONS } from '../semantic-worker/constants.mjs';
import { requestJson } from '../semantic-worker/transport.mjs';

const exec = promisify(execFile);
export async function dependencies(config, root, { execute = exec, report = () => {}, signal } = {}) {
  if (process.versions.node.split('.')[0] !== '22') throw new LauncherError('NODE_22_REQUIRED');
  const env = childEnvironment();
  async function run(name, binary, args, cwd = root) {
    try { const result = await execute(binary, args, { cwd, env, signal, timeout: 15000, maxBuffer: 65536 }); report(`${name}_CHECKED`); return result.stdout; }
    catch { throw new LauncherError(`${name}_UNAVAILABLE`); }
  }
  await run('TELEGRAM_RUNTIME', process.execPath, ['services/telegram-connector/check-runtime.mjs']);
  const docker = await run('DOCKER_CONTEXT', 'docker', ['context', 'inspect']);
  try {
    const hosts = [JSON.parse(docker)?.[0]?.Endpoints?.docker?.Host, ...(env.DOCKER_HOST ? [env.DOCKER_HOST] : [])];
    if (hosts.some(host => typeof host !== 'string' || (!host.startsWith('unix://') && !host.startsWith('npipe://')))) throw new Error();
  } catch { throw new LauncherError('LOCAL_DOCKER_REQUIRED'); }
  await run('CV_PARSER', 'docker', ['image', 'inspect', 'agora-cv-parser:v1']);
  await run('MODEL_RUNTIME', config.embedding.python, ['-c', 'import sys; assert sys.version_info[:2] == (3,12); import fastapi,uvicorn,torch,sentence_transformers; from model_config import verify_model_assets; verify_model_assets(sys.argv[1])', config.embedding.modelDirectory], join(root, 'services/local-embeddings'));
}
export async function cleanupParsers(launchId, { execute = exec, env = childEnvironment() } = {}) {
  if (!/^[0-9a-f-]{36}$/u.test(launchId)) throw new LauncherError('PARSER_CLEANUP_FAILED');
  try {
    const options = { env, timeout: 5000, maxBuffer: 65536 };
    const context = JSON.parse((await execute('docker', ['context', 'inspect'], options)).stdout);
    const hosts = [context?.[0]?.Endpoints?.docker?.Host, ...(env.DOCKER_HOST ? [env.DOCKER_HOST] : [])];
    if (hosts.some(host => typeof host !== 'string' || (!host.startsWith('unix://') && !host.startsWith('npipe://')))) throw new Error();
    const result = await execute('docker', ['ps', '-aq', '--filter', `label=agora.mac-launch=${launchId}`], options);
    const ids = result.stdout.trim().split('\n').filter(Boolean);
    if (ids.length > 16 || ids.some(id => !/^[a-f0-9]{12,64}$/u.test(id))) throw new Error();
    if (ids.length) await execute('docker', ['rm', '-f', ...ids], options);
  } catch { throw new LauncherError('PARSER_CLEANUP_FAILED'); }
}
export async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new LauncherError('EMBEDDING_PORT_IN_USE')));
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(new LauncherError('EMBEDDING_PORT_IN_USE')) : resolve()));
  });
}
export async function verifyEmbedding(config, { signal, fetchImpl = fetch } = {}) {
  const url = `http://127.0.0.1:${config.embedding.port}`;
  const response = await fetchImpl(`${url}/health`, { redirect: 'error', signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(2000)]) });
  // Bound even the unauthenticated local health response.
  const reader = response.body?.getReader(); let size = 0; const bytes = [];
  if (!response.ok || !reader) throw new LauncherError('EMBEDDING_NOT_READY');
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 8192) throw new LauncherError('EMBEDDING_NOT_READY'); bytes.push(item.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const health = JSON.parse(Buffer.concat(bytes).toString('utf8'));
  if (health.status !== 'ready' || health.model !== MODEL || health.index_version !== INDEX_VERSION || health.dimensions !== DIMENSIONS || health.chunker_version !== CHUNKER_VERSION || health.cv_chunker_version !== CV_CHUNKER_VERSION) throw new LauncherError('EMBEDDING_IDENTITY_MISMATCH');
  const result = await requestJson(`${url}/v1/embeddings`, readToken(config.embedding.tokenFile), { model: MODEL, input: ['local startup check'], input_type: 'query', encoding_format: 'float' }, { signal, fetchImpl, timeoutMs: 10000, maxResponseBytes: 65536 });
  const vector = result.data?.[0]?.embedding;
  if (result.model !== MODEL || result.index_version !== INDEX_VERSION || result.data?.length !== 1 || !Array.isArray(vector) || vector.length !== DIMENSIONS || vector.some(value => !Number.isFinite(value)) || Math.abs(vector.reduce((sum, value) => sum + value * value, 0) - 1) > 0.01) throw new LauncherError('EMBEDDING_IDENTITY_MISMATCH');
}

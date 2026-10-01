import { constants, openSync, closeSync, fstatSync, readFileSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, resolve, parse, join, isAbsolute } from 'node:path';
import { readCredentialFile } from '../worker-pairing/vault.mjs';
import { validateConfig as extractionConfig } from '../telegram-extraction-worker/config.mjs';

export class LauncherError extends Error { constructor(code) { super(code); this.code = code; } }
export function privateDirectory(path, create = false) {
  let current = parse(path).root;
  for (const segment of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, segment); let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (error.code !== 'ENOENT') throw new LauncherError('UNSAFE_LOCAL_PATH');
      if (!create) continue;
      mkdirSync(current, { mode: 0o700 }); stat = lstatSync(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new LauncherError('UNSAFE_LOCAL_PATH');
    if (current === path && (stat.uid !== process.getuid() || (stat.mode & 0o077))) throw new LauncherError('UNSAFE_LOCAL_PATH');
  }
}
export function readPrivate(path, maxBytes = 65536) {
  privateDirectory(dirname(path)); let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.nlink !== 1 || stat.size < 1 || stat.size > maxBytes) throw new Error();
    return readFileSync(fd, 'utf8');
  } catch { throw new LauncherError('UNSAFE_LOCAL_FILE'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
export function readToken(path, minimum = 32) {
  const value = readPrivate(path, 4098).trim();
  if (value.length < minimum || value.length > 4096 || /\s|[\u0000-\u001f\u007f]/u.test(value)) throw new LauncherError('INVALID_TOKEN_FILE');
  return value;
}
const object = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
export function loadConfig(path) {
  const absolute = resolve(path), base = dirname(absolute);
  let raw;
  try { raw = JSON.parse(readPrivate(absolute)); } catch (error) { if (error instanceof LauncherError) throw error; throw new LauncherError('INVALID_CONFIG'); }
  const fail = () => { throw new LauncherError('INVALID_CONFIG'); };
  const file = value => typeof value === 'string' && value && value.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value) ? resolve(base, value) : fail();
  if (!object(raw, ['version', 'credentialFile', 'runtimeDirectory', 'stateDirectories', 'telegram', 'provider', 'embedding']) || raw.version !== 1
      || !object(raw.stateDirectories, ['connector', 'extraction', 'cvAnalysis', 'semantic'])
      || !object(raw.telegram, ['apiId', 'apiHash']) || !object(raw.provider, ['baseUrl', 'model', 'tokenFile'])
      || !object(raw.embedding, ['python', 'modelDirectory', 'tokenFile', 'port'])) fail();
  if (!Number.isSafeInteger(raw.telegram.apiId) || raw.telegram.apiId < 1 || !/^[a-f0-9]{32}$/iu.test(raw.telegram.apiHash ?? '')) fail();
  if (!Number.isInteger(raw.embedding.port) || raw.embedding.port < 1024 || raw.embedding.port > 65535) fail();
  const credentialFile = file(raw.credentialFile), credential = readCredentialFile(credentialFile);
  const runtimeDirectory = file(raw.runtimeDirectory);
  const stateDirectories = Object.fromEntries(['connector', 'extraction', 'cvAnalysis', 'semantic'].map(key => [key, file(raw.stateDirectories[key])]));
  const roots = [runtimeDirectory, ...Object.values(stateDirectories)];
  if (roots.some((root, i) => roots.some((other, j) => i !== j && (root === other || root.startsWith(`${other}/`))))) fail();
  for (const root of roots) privateDirectory(root);
  const provider = { ...raw.provider, tokenFile: file(raw.provider.tokenFile) };
  // Reuse the provider URL/model validation without writing a raw worker token.
  extractionConfig({ serverUrl: credential.server, workerTokenFile: credentialFile, providerBaseUrl: provider.baseUrl, providerModel: provider.model, providerTokenFile: provider.tokenFile, stateDirectory: stateDirectories.extraction });
  const embedding = { ...raw.embedding, python: file(raw.embedding.python), modelDirectory: file(raw.embedding.modelDirectory), tokenFile: file(raw.embedding.tokenFile) };
  if (!isAbsolute(embedding.python)) fail();
  readToken(provider.tokenFile, 16); readToken(embedding.tokenFile);
  return { credentialFile, runtimeDirectory, stateDirectories, telegram: raw.telegram, provider, embedding };
}

// Child processes must not inherit legacy identity overrides or unrelated secrets.
export function childEnvironment(env = process.env) {
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG'].filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
}
export function serviceConfigurations(config) {
  const common = { credentialFile: config.credentialFile };
  const provider = { providerBaseUrl: config.provider.baseUrl, providerModel: config.provider.model, providerTokenFile: config.provider.tokenFile };
  return {
    connector: { ...common, ...config.telegram, stateDirectory: config.stateDirectories.connector },
    extraction: { ...common, ...provider, stateDirectory: config.stateDirectories.extraction },
    cvAnalysis: { ...common, ...provider, stateDirectory: config.stateDirectories.cvAnalysis },
    semantic: { ...common, embeddingUrl: `http://127.0.0.1:${config.embedding.port}`, embeddingTokenFile: config.embedding.tokenFile, stateDirectory: config.stateDirectories.semantic },
  };
}

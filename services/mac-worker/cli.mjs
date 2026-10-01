#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, LauncherError } from './config.mjs';
import { dependencies } from './preflight.mjs';
import { supervise } from './supervisor.mjs';

const SAFE = new Set(['INVALID_CONFIG', 'NODE_22_REQUIRED', 'UNSAFE_LOCAL_PATH', 'UNSAFE_LOCAL_FILE', 'INVALID_TOKEN_FILE', 'TELEGRAM_RUNTIME_UNAVAILABLE', 'DOCKER_CONTEXT_UNAVAILABLE', 'LOCAL_DOCKER_REQUIRED', 'CV_PARSER_UNAVAILABLE', 'MODEL_RUNTIME_UNAVAILABLE', 'EMBEDDING_PORT_IN_USE', 'EMBEDDING_NOT_READY', 'EMBEDDING_IDENTITY_MISMATCH', 'CHILD_STOPPED', 'PAIRING_ALREADY_RUNNING', 'PROCESS_CLEANUP_FAILED', 'PARSER_CLEANUP_FAILED']);
export const safeError = error => SAFE.has(error?.code) ? error.code : 'LAUNCHER_FAILED';
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node services/mac-worker/cli.mjs check|start --config /private/mac.json\nStart stays in the foreground. Ctrl-C stops owned processes and preserves pending work.\n'); return;
  }
  if (args.length !== 3 || !['check', 'start'].includes(args[0]) || args[1] !== '--config' || !args[2]) throw new LauncherError('INVALID_CONFIG');
  const config = loadConfig(args[2]);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const report = code => process.stdout.write(`${code}\n`);
  const shutdown = new AbortController(), stop = () => shutdown.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    await dependencies(config, root, { report, signal: shutdown.signal });
    report('LOCAL_DEPENDENCIES_CHECKED');
    if (args[0] === 'check') { report('HOSTED_AND_ACCOUNT_READINESS_NOT_VERIFIED'); return; }
    await supervise(config, root, { signal: shutdown.signal, report });
  }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { process.stderr.write(`${safeError(error)}\n`); process.exitCode = 1; });

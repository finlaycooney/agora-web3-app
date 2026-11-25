import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

export const RUN_ID = randomUUID().replaceAll('-', '').slice(0, 12);
export const RUN_LABEL = 'agora.foundation.test-run';
export const SUPABASE_PROJECT_LABEL = 'com.supabase.cli.project';
export const POSTGRES_17_IMAGE = 'postgres:17.6';
export const POSTGRES_16_IMAGE = 'postgres:16.10';

export const FORBIDDEN_ENVIRONMENT_KEYS = [
    'DATABASE_URL',
    'DIRECT_URL',
    'POSTGRES_URL',
    'POSTGRESQL_URL',
    'PGHOST',
    'PGPORT',
    'PGUSER',
    'PGPASSWORD',
    'PGDATABASE',
    'PGSSLMODE',
    'PGCONNECT_TIMEOUT',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGPASSFILE',
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'SUPABASE_URL',
    'SUPABASE_DB_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_PROJECT_ID',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

export function assertSafeFoundationEnvironment(environment) {
    const found = FORBIDDEN_ENVIRONMENT_KEYS.filter((key) => environment[key]);
    if (found.length > 0) {
        throw new Error(
            'Foundation tests refuse external database or Supabase settings: '
            + found.join(', '),
        );
    }
}

export function isLocalDockerEndpoint(host) {
    return typeof host === 'string'
        && (host.startsWith('unix://') || host.startsWith('npipe://'));
}

export function assertLocalDockerContext(context) {
    if (!isLocalDockerEndpoint(context?.Endpoints?.docker?.Host)) {
        throw new Error('Active Docker context does not resolve to a local unix/npipe endpoint.');
    }
}

export function containerIsOwned(inspectEntry, runId) {
    return inspectEntry?.Config?.Labels?.[RUN_LABEL] === runId;
}

export function hasProjectLabel(inspectEntry, projectId) {
    const labels = inspectEntry?.Config?.Labels ?? inspectEntry?.Labels;
    return labels?.[SUPABASE_PROJECT_LABEL] === projectId;
}

export function runDockerCommand(args, options = {}) {
    return execFileSync('docker', args, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options,
    });
}

export function tryDockerCommand(args) {
    try {
        runDockerCommand(args);
        return true;
    } catch {
        return false;
    }
}

export function inspectDockerResource(kind, name) {
    const args = kind === 'container' ? ['inspect', name] : [kind, 'inspect', name];
    const parsed = JSON.parse(runDockerCommand(args));
    return Array.isArray(parsed) ? parsed[0] : parsed;
}

export function listDockerResourceNames(kind) {
    const args = kind === 'container'
        ? ['ps', '--all', '--format', '{{.Names}}']
        : [kind, 'ls', '--format', '{{.Name}}'];
    const output = runDockerCommand(args).trim();
    return output ? output.split('\n') : [];
}

export function listContainersWithLabel(label, value) {
    const output = runDockerCommand([
        'ps', '--all', '--filter', `label=${label}=${value}`, '--format', '{{.ID}}',
    ]).trim();
    return output ? output.split('\n') : [];
}

export function assertLocalTestEnvironment(environment = process.env, runner = runDockerCommand) {
    assertSafeFoundationEnvironment(environment);

    if (environment.DOCKER_HOST && !isLocalDockerEndpoint(environment.DOCKER_HOST)) {
        throw new Error('DOCKER_HOST must use a local unix/npipe endpoint; remote Docker is rejected.');
    }

    const inspectArgs = ['context', 'inspect', '--format', '{{json .}}'];
    if (environment.DOCKER_CONTEXT) {
        inspectArgs.push(environment.DOCKER_CONTEXT);
    }

    let rawContexts;
    try {
        rawContexts = runner(inspectArgs);
    } catch (error) {
        throw new Error(`Docker CLI is unavailable: ${error.message}`);
    }

    let contexts;
    try {
        contexts = JSON.parse(rawContexts);
    } catch {
        throw new Error('Docker context inspection returned unreadable output.');
    }
    assertLocalDockerContext(Array.isArray(contexts) ? contexts[0] : contexts);

    try {
        runner(['version', '--format', '{{.Server.Version}}']);
    } catch {
        throw new Error(
            'Docker daemon is not running; foundation database tests are blocked. '
            + 'Start Docker and rerun npm run test:db:foundation.',
        );
    }
}

export function containerName(purpose) {
    return `agora-fnd-${RUN_ID}-${purpose}`;
}

export function assertOwnedContainer(name) {
    if (!containerIsOwned(inspectDockerResource('container', name), RUN_ID)) {
        throw new Error(`Refusing to operate on container ${name}: not created by this test run.`);
    }
}

const dockerLogs = (name) => {
    const result = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
    return `${result.stdout ?? ''}${result.stderr ?? ''}`;
};

export async function startPostgresContainer(
    purpose,
    image,
    { publish = false, password = randomUUID() } = {},
) {
    const name = containerName(purpose);
    const args = [
        'run', '--detach', '--name', name,
        '--label', `${RUN_LABEL}=${RUN_ID}`,
        '--env', `POSTGRES_PASSWORD=${password}`,
    ];
    if (publish) {
        args.push('--publish', '127.0.0.1::5432');
    }
    args.push(image);
    runDockerCommand(args);
    try {
        assertOwnedContainer(name);
        const deadline = Date.now() + 60_000;
        for (;;) {
            const readyMarkers = dockerLogs(name).match(/ready to accept connections/g) ?? [];
            if (readyMarkers.length >= 2
                && tryDockerCommand(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'postgres'])) {
                return name;
            }
            if (Date.now() > deadline) {
                throw new Error(`PostgreSQL container ${name} did not become ready.`);
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    } catch (error) {
        stopAndRemoveContainer(name);
        throw error;
    }
}

export function publishedPort(name, containerPort) {
    assertOwnedContainer(name);
    const entry = inspectDockerResource('container', name);
    const bindings = entry?.NetworkSettings?.Ports?.[`${containerPort}/tcp`];
    const binding = bindings?.find(
        ({ HostIp, HostPort }) => HostIp === '127.0.0.1' && Number(HostPort) > 0,
    );
    if (!binding) {
        throw new Error(`Container ${name} has no localhost binding for port ${containerPort}.`);
    }
    return Number(binding.HostPort);
}

export function stopAndRemoveContainer(name) {
    let owned = false;
    try {
        owned = containerIsOwned(inspectDockerResource('container', name), RUN_ID);
    } catch {
        owned = false;
    }
    if (owned && !tryDockerCommand(['rm', '--force', '--volumes', name])) {
        console.warn(`Cleanup could not remove test-owned container ${name}.`);
    }
}

const psqlArgs = (database) => [
    'psql', '-U', 'postgres', '-d', database,
    '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
];

export function dockerExecInput(name, commandArgs, sql) {
    return execFileSync('docker', ['exec', '--interactive', name, ...commandArgs], {
        input: sql,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

export function psql(name, sql, { database = 'postgres' } = {}) {
    assertOwnedContainer(name);
    return dockerExecInput(name, psqlArgs(database), sql);
}

export function psqlExpectError(name, sql, { database = 'postgres' } = {}) {
    assertOwnedContainer(name);
    try {
        dockerExecInput(name, psqlArgs(database), sql);
    } catch (error) {
        return String(error.stderr ?? '');
    }
    throw new Error('Expected SQL to fail but it succeeded.');
}

export function assertSqlstate(name, sql, sqlstate, options = {}) {
    const stderr = psqlExpectError(name, sql, options);
    if (!new RegExp(`ERROR:\\s+${sqlstate}:`).test(stderr)) {
        throw new Error(`Expected SQLSTATE ${sqlstate}, received: ${stderr}`);
    }
    return stderr;
}

export function holdExclusiveLock(name, tableName, seconds = 30) {
    assertOwnedContainer(name);
    const applicationName = `agora_fnd_locker_${RUN_ID}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const child = execFile('docker', [
        'exec', '--interactive', '--env', `PGAPPNAME=${applicationName}`,
        name, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    ], () => {});
    child.on('error', () => {});
    if (child.stdin.writable) {
        child.stdin.write(`begin;\nlock table ${tableName} in access exclusive mode;\nselect pg_sleep(${seconds});\ncommit;\n`);
        child.stdin.end();
    }
    return { child, applicationName };
}

export function awaitProcessExit(child, timeoutMs = 15_000) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            child.kill();
            resolve(false);
        }, timeoutMs);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}

export function isPortFree(port) {
    const probe = (host) => new Promise((resolve) => {
        const socket = net.connect({ host, port });
        socket.once('connect', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => resolve(true));
        socket.setTimeout(2000, () => {
            socket.destroy();
            resolve(false);
        });
    });
    return Promise.all([probe('127.0.0.1'), probe('::1')]).then(([v4, v6]) => v4 && v6);
}

export function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    RUN_LABEL,
    SUPABASE_PROJECT_LABEL,
    assertLocalDockerContext,
    assertLocalTestEnvironment,
    assertSafeFoundationEnvironment,
    containerIsOwned,
    hasProjectLabel,
    isLocalDockerEndpoint,
} from '../support/foundation-docker.js';

const localContext = [{ Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } } }];
const fakeRunner = (contexts = localContext) => (args) => {
    if (args[0] === 'context') {
        return JSON.stringify(contexts);
    }
    return '27.0.0';
};

test('rejects external database and Supabase settings without echoing values', () => {
    const forbidden = [
        'DATABASE_URL',
        'DIRECT_URL',
        'PGHOST',
        'PGPORT',
        'PGUSER',
        'PGPASSWORD',
        'PGDATABASE',
        'PGSSLMODE',
        'PGSERVICE',
        'POSTGRES_HOST',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'SUPABASE_URL',
        'SUPABASE_DB_URL',
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_ACCESS_TOKEN',
        'SUPABASE_PROJECT_ID',
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ];
    for (const key of forbidden) {
        const environment = { [key]: 'sensitive-marker-value' };
        assert.throws(() => assertSafeFoundationEnvironment(environment), new RegExp(key));
        assert.throws(() => assertSafeFoundationEnvironment(environment), (error) => (
            !error.message.includes('sensitive-marker-value')
        ));
    }
    assert.doesNotThrow(() => assertSafeFoundationEnvironment({ PATH: '/usr/bin' }));
});

test('rejects remote Docker endpoints and accepts local sockets', () => {
    for (const remote of [
        'tcp://192.0.2.10:2375',
        'tcp://docker.example.internal:2376',
        'ssh://builder.example.internal',
        'fd://something',
        'npipe+unix://mixed',
    ]) {
        assert.equal(isLocalDockerEndpoint(remote), false);
        assert.throws(
            () => assertLocalTestEnvironment({ DOCKER_HOST: remote }, fakeRunner()),
            /DOCKER_HOST/,
        );
    }
    for (const local of ['unix:///var/run/docker.sock', 'npipe:////./pipe/docker_engine']) {
        assert.equal(isLocalDockerEndpoint(local), true);
        assert.doesNotThrow(
            () => assertLocalTestEnvironment({ DOCKER_HOST: local }, fakeRunner()),
        );
    }
});

test('rejects remote, missing or malformed Docker context endpoints', () => {
    const remote = [{ Endpoints: { docker: { Host: 'tcp://198.51.100.7:2375' } } }];
    assert.throws(() => assertLocalTestEnvironment({}, fakeRunner(remote)), /Docker context/);
    assert.throws(() => assertLocalDockerContext(remote[0]), /Docker context/);

    const missingEndpoint = [{ Endpoints: {} }];
    assert.throws(() => assertLocalTestEnvironment({}, fakeRunner(missingEndpoint)), /Docker context/);
    const missingHost = [{ Endpoints: { docker: {} } }];
    assert.throws(() => assertLocalTestEnvironment({}, fakeRunner(missingHost)), /Docker context/);
    assert.throws(() => assertLocalTestEnvironment({}, fakeRunner([{}])), /Docker context/);

    assert.doesNotThrow(() => assertLocalTestEnvironment({}, fakeRunner()));
});

test('fails closed when Docker CLI or context inspection fails', () => {
    assert.throws(
        () => assertLocalTestEnvironment({}, () => { throw new Error('spawn docker ENOENT'); }),
        /Docker CLI is unavailable/,
    );
    assert.throws(
        () => assertLocalTestEnvironment({}, () => 'not-json'),
        /unreadable/,
    );
});

test('container ownership requires the run label match', () => {
    const runId = 'abc123';
    const owned = { Config: { Labels: { [RUN_LABEL]: runId } } };
    const wrongLabel = { Config: { Labels: { [RUN_LABEL]: 'other-run' } } };
    const noLabels = { Config: { Labels: {} } };
    const noConfig = {};

    assert.equal(containerIsOwned(owned, runId), true);
    assert.equal(containerIsOwned(wrongLabel, runId), false);
    assert.equal(containerIsOwned(noLabels, runId), false);
    assert.equal(containerIsOwned(noConfig, runId), false);
    assert.equal(containerIsOwned(null, runId), false);
});

test('supabase project identity requires the exact project label', () => {
    const projectId = 'agorafnd0123456789ab';
    const member = { Config: { Labels: { [SUPABASE_PROJECT_LABEL]: projectId } } };
    const other = { Config: { Labels: { [SUPABASE_PROJECT_LABEL]: 'other-project' } } };
    const nameOnly = { Name: `/supabase_db_${projectId}`, Config: { Labels: {} } };

    assert.equal(hasProjectLabel(member, projectId), true);
    assert.equal(hasProjectLabel(other, projectId), false);
    assert.equal(hasProjectLabel(nameOnly, projectId), false);
    assert.equal(hasProjectLabel(null, projectId), false);
});

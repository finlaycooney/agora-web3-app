import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const sourceJobId = randomUUID();
const input = {
    sourceRevisionId: randomUUID(), expectedSourceVersion: '2', clientId: randomUUID(),
    jobId: randomUUID(), revisionId: randomUUID(), operationId: randomUUID(),
};

function route({ status = 'ok', source, writeError } = {}) {
    const calls = [];
    const handledErrors = [];
    const exports = {};
    const context = { status, pool: {}, identity: {}, organizationId: randomUUID() };
    const imports = {
        '@/lib/client-job-operations': {
            getJobWorkspace: async (...args) => {
                calls.push(['read', ...args]);
                return source ?? { draft: { id: input.sourceRevisionId, version: '9' } };
            },
            duplicateJobUnlisted: async (...args) => {
                calls.push(['write', ...args]);
                if (writeError) throw writeError;
                return { jobId: args[3].jobId, status: 'draft' };
            },
        },
        '@/lib/staff-api.server': {
            staffApiContext: async () => context,
            staffGateResponse: ({ status }) => status === 'ok' ? null
                : Response.json({}, { status: status === 'mfa-required' ? 428 : 401 }),
            staffErrorResponse: (error) => {
                handledErrors.push(error);
                return Response.json(
                    { error: 'operation rejected' },
                    { status: error.code === '40001' ? 409 : 403 },
                );
            },
        },
    };
    runInNewContext(ts.transpileModule(readFileSync(new URL(
        '../../src/app/api/staff/jobs/[jobId]/duplicate/route.ts', import.meta.url,
    ), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText, {
        exports, Response,
        require: (name) => {
            assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
            return imports[name];
        },
    });
    return { calls, context, handledErrors, post: (body = input) => exports.POST(
        new Request(`http://localhost/api/staff/jobs/${sourceJobId}/duplicate`, {
            method: 'POST', body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ jobId: sourceJobId }) },
    ) };
}

test('duplicate route reads source path A but creates new body ID B with submitted version', async () => {
    const { calls, context, post } = route();
    const response = await post();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { ok: true, result: { jobId: input.jobId, status: 'draft' } });
    assert.notEqual(input.jobId, sourceJobId);
    assert.equal(calls[0][4].jobId, sourceJobId);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1][4])), input);
    assert.equal(calls[1][4].expectedSourceVersion, '2');
    assert.equal(calls[1][1], context.pool);
    assert.equal(calls[1][2], context.identity);
    assert.equal(calls[1][3], context.organizationId);
});

test('published source revisions are also accepted', async () => {
    const { post } = route({ source: { draft: null, published: { id: input.sourceRevisionId } } });
    assert.equal((await post()).status, 200);
});

test('a revision belonging to another job returns 404 without a write', async () => {
    const { calls, post } = route({ source: { draft: { id: randomUUID() }, published: null } });
    const response = await post();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(calls.length, 1);
});

test('stale submitted versions reach the operation and become a conflict', async () => {
    const { calls, post } = route({ writeError: { code: '40001' } });
    assert.equal((await post()).status, 409);
    assert.equal(calls[1][4].expectedSourceVersion, input.expectedSourceVersion);
});

test('a missing duplicate_job_v2 during rollout returns a private retryable response', async () => {
    const { post, handledErrors } = route({ writeError: {
        code: '42883',
        message: 'function app.duplicate_job_v2(uuid, bigint, uuid, uuid, uuid, uuid, uuid) does not exist',
    } });
    const response = await post();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), {
        error: 'Job duplication is temporarily unavailable. Please try again shortly.',
    });
    assert.equal(handledErrors.length, 0);
});

test('unrelated undefined functions and other SQL errors still use staffErrorResponse', async () => {
    for (const writeError of [
        { code: '42883', message: 'function app.get_job_workspace_v1(uuid) does not exist' },
        { code: '42883', message: 'function app.duplicate_job_v20(uuid) does not exist' },
        { code: '42883' },
        { code: '42501', message: 'permission denied for function app.duplicate_job_v2' },
    ]) {
        const { post, handledErrors } = route({ writeError });
        assert.equal((await post()).status, 403);
        assert.deepEqual(handledErrors, [writeError]);
    }
});

for (const [status, code] of [['unauthorized', 401], ['mfa-required', 428]]) {
    test(`${status} is denied before any backend operation`, async () => {
        const { calls, post } = route({ status });
        assert.equal((await post()).status, code);
        assert.equal(calls.length, 0);
    });
}

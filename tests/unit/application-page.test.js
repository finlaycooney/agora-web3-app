import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

class StaffAuthorizationError extends Error {
    constructor(code) { super(code); this.code = code; }
}
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const pageCode = compile('../../src/app/staff/applications/page.tsx');
const paramExports = {};
runInNewContext(compile('../../src/app/staff/filter-params.ts'), { exports: paramExports });
const id = '97000000-0000-4000-8000-000000000001';

function page({ applications = [], jobs = [], client = { client: { name: 'Empty client' } }, error } = {}) {
    const exports = {};
    const calls = [];
    const imports = {
        'react/jsx-runtime': jsxRuntime,
        '@/lib/pipeline-operations': { listApplications: async () => ({ applications }) },
        '@/lib/client-job-operations': {
            listJobs: async () => jobs,
            getClient: async (...args) => { calls.push(args.at(-1)); if (error) throw error; return client; },
        },
        '@/lib/staff-authorization': { StaffAuthorizationError },
        '@/lib/staff-gate.server': { requireStaffVerified: async () => ({ pool: {}, identity: {}, organizationId: 'org' }) },
        '@/components/staff-preview/shared': { PageHeader: 'header' },
        '@/components/staff-ui/card': { Card: 'article', CardContent: 'div' },
        './applications-browser': { ApplicationsBrowser: 'browser' },
        '../filter-params': paramExports,
    };
    runInNewContext(pageCode, { exports, require: name => {
        assert.ok(name in imports, `Unexpected dependency: ${name}`);
        return imports[name];
    } });
    return { render: async (clientId) => (await exports.default({ searchParams: Promise.resolve({ client: clientId }) })).props.children.props, calls };
}

test('empty selected clients get their label from an authorized lookup', async () => {
    const { render, calls } = page();
    const props = await render(id);
    assert.equal(props.clientOptions[0].id, id);
    assert.equal(props.clientOptions[0].name, 'Empty client');
    assert.equal(calls.length, 1);
});

test('known labels and malformed client filters do not add database reads', async () => {
    const known = page({ jobs: [{ id: 'job', title: 'Role', clientId: id, clientName: 'Known client' }] });
    assert.equal((await known.render(id)).clientOptions[0].name, 'Known client');
    assert.equal(known.calls.length, 0);
    const invalid = page();
    await invalid.render('not-a-uuid');
    assert.equal(invalid.calls.length, 0);
});

test('missing or forbidden clients never leak their label or discard the filter', async () => {
    for (const error of [Object.assign(new Error('missing'), { code: 'P0002' }), new StaffAuthorizationError('FORBIDDEN')]) {
        const { render, calls } = page({ error });
        assert.equal((await render(id)).clientOptions.length, 0);
        assert.equal(calls[0].clientId, id);
    }
});

test('unexpected database failures remain visible to the error boundary', async () => {
    const { render } = page({ error: new Error('database unavailable') });
    await assert.rejects(render(id), /database unavailable/);
});

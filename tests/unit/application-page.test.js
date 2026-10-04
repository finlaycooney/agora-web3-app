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
const id = '97000000-0000-4000-8000-000000000001';

function page({ rows = [], jobs = [], clients = [], total = 0, scopeTotal = 0,
    stages = [], page: pageNumber = 1, error } = {}) {
    const exports = {};
    const calls = [];
    const imports = {
        'react/jsx-runtime': jsxRuntime,
        '@/lib/pipeline-operations': { listApplicationDirectory: async (...args) => {
            calls.push(args.at(-1));
            if (error) throw error;
            return { rows, jobs, clients, total, scopeTotal, stages, page: pageNumber, pageSize: 50 };
        } },
        '@/lib/staff-authorization': { StaffAuthorizationError },
        '@/lib/staff-gate.server': { requireStaffVerified: async () => ({ pool: {}, identity: {}, organizationId: 'org' }) },
        '@/components/staff-preview/shared': { PageHeader: 'header' },
        '@/components/staff-ui/card': { Card: 'article', CardContent: 'div' },
        './applications-browser': { ApplicationsBrowser: 'browser' },
    };
    runInNewContext(pageCode, { exports, require: name => {
        assert.ok(name in imports, `Unexpected dependency: ${name}`);
        return imports[name];
    } });
    return { render: async (params = {}) =>
        (await exports.default({ searchParams: Promise.resolve(params) })).props.children, calls };
}

test('empty selected client labels arrive with the single authorized directory read', async () => {
    const { render, calls } = page({ clients: [{ id, name: 'Empty client' }] });
    const result = await render({ client: id });
    assert.equal(result.props.clientOptions[0].name, 'Empty client');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].client, id);
});

test('server totals, facets and pagination are preserved instead of recounting the current page', async () => {
    const stages = [{ key: 'review', count: 620 }];
    const { render, calls } = page({ rows: [{ applicationId: 'row' }], total: 620,
        scopeTotal: 700, stages, page: 2 });
    const result = await render({ client: id, q: 'Person', page: '2', review: '1' });
    assert.equal(result.props.total, 620);
    assert.equal(result.props.scopeTotal, 700);
    assert.equal(result.props.page, 2);
    assert.equal(result.props.pageSize, 50);
    assert.equal(result.props.stages, stages);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].review, '1');
});

test('forbidden directory reads show the permission message', async () => {
    const { render } = page({ error: new StaffAuthorizationError('FORBIDDEN') });
    const result = await render({ client: id });
    assert.match(JSON.stringify(result), /applications.read/);
    assert.doesNotMatch(JSON.stringify(result), /clientOptions/);
});

test('unexpected database failures remain visible to the error boundary', async () => {
    const { render } = page({ error: new Error('database unavailable') });
    await assert.rejects(render({ client: id }), /database unavailable/);
});

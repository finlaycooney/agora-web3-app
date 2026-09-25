import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/app/staff/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function homePage(requireStaffVerified) {
    const exports = {};
    const imports = {
        'react/jsx-runtime': jsxRuntime,
        'next/link': { default: ({ children, ...props }) => createElement('a', props, children) },
        '@/lib/staff-gate.server': { requireStaffVerified },
        './staff-auth-buttons': { StaffSignOutButton: () => createElement('button', null, 'Sign out') },
    };
    runInNewContext(compiled, {
        exports,
        require: (name) => {
            assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
            return imports[name];
        },
    });
    return exports.default;
}

test('staff home displays the account without exposing principal database IDs', async () => {
    const principal = {
        role_id: 'f0000000-0000-4000-8000-000000000001',
        user_id: 'f0000000-0000-4000-8000-000000000002',
        membership_id: 'f0000000-0000-4000-8000-000000000003',
    };
    const Page = homePage(async () => ({
        session: { user: { email: 'staff@example.test' } },
        principal,
    }));
    const html = renderToStaticMarkup(await Page());
    assert.match(html, /staff@example\.test/);
    assert.match(html, /href="\/staff\/clients"/);
    assert.match(html, /href="\/staff\/jobs"/);
    for (const id of Object.values(principal)) assert.ok(!html.includes(id));
    assert.doesNotMatch(html, />Role</);
});

test('staff home still requires the full staff and MFA gate before rendering', async () => {
    const denied = new Error('MFA required');
    const Page = homePage(async () => { throw denied; });
    await assert.rejects(Page(), (error) => error === denied);
});

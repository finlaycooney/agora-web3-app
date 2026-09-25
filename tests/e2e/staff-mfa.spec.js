import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compiledForm = ts.transpileModule(
    readFileSync(new URL('../../src/app/staff/mfa/mfa-forms.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } },
).outputText;
const reactScripts = ['react', 'react-dom'].map((name) => readFileSync(
    join(dirname(require.resolve(name)), `umd/${name}.development.js`), 'utf8',
));

// Exercise the real client component with simulated API responses. This
// fixture never authenticates, creates a credential, or contacts a database.
async function mountForm(page, { mode = 'enroll', status = 200, error, networkError = false } = {}) {
    const origin = 'http://127.0.0.1:3000';
    const submissions = [];
    await page.route('**/*', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/api/staff/mfa/')) {
            submissions.push({ path, method: request.method(), body: request.postDataJSON() });
            if (networkError) return route.abort();
            return route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(error ? { error } : { ok: true }),
            });
        }
        return route.fulfill({
            contentType: 'text/html',
            body: path === '/staff' ? '<h1>Staff destination</h1>' : '<div id="root"></div>',
        });
    });
    await page.goto(`${origin}/__staff-mfa-test`);
    for (const content of reactScripts) await page.addScriptTag({ content });
    await page.addScriptTag({
        content: `const exports = {}; const require = () => React;
            ${compiledForm}
            ReactDOM.createRoot(document.getElementById('root')).render(
                React.createElement(exports.${mode === 'enroll' ? 'MfaEnrollForm' : 'MfaVerifyForm'}, {
                    qrDataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                    secret: 'SYNTHETIC-TEST-ONLY',
                })
            );`,
    });
    return { origin, submissions };
}

async function submitCode(page) {
    await page.getByPlaceholder('000000').fill('123456');
    await page.getByRole('button').click();
}

for (const mode of ['enroll', 'verify']) {
    test(`successful MFA ${mode} leaves the form for the staff workspace`, async ({ page }) => {
        const { origin, submissions } = await mountForm(page, { mode });
        await submitCode(page);
        await expect(page).toHaveURL(`${origin}/staff`);
        expect(submissions).toEqual([{
            path: `/api/staff/mfa/${mode}`, method: 'POST', body: { code: '123456' },
        }]);
    });
}

test('already completed enrollment offers recovery instead of an invalid-code error', async ({ page }) => {
    const { origin } = await mountForm(page, { status: 409, error: 'no pending enrollment' });
    await submitCode(page);
    await expect(page.getByRole('alert')).toContainText('already complete');
    await expect(page.getByRole('alert')).not.toContainText('Invalid code');
    await page.getByRole('link', { name: 'Continue to staff' }).click();
    await expect(page).toHaveURL(`${origin}/staff`);
});

for (const scenario of [
    { name: 'invalid code', status: 401, error: 'invalid code', message: 'Invalid code' },
    { name: 'expired session', status: 401, error: 'unauthorized', message: 'session could not be verified' },
    { name: 'unavailable service', status: 503, error: 'staff workspace not configured', message: 'temporarily unavailable' },
    { name: 'network failure', networkError: true, message: 'Could not connect' },
]) {
    test(`MFA ${scenario.name} explains the failure and allows retry`, async ({ page }) => {
        const { origin } = await mountForm(page, scenario);
        await submitCode(page);
        await expect(page.getByRole('alert')).toContainText(scenario.message);
        await expect(page.getByRole('button')).toBeEnabled();
        await expect(page).toHaveURL(`${origin}/__staff-mfa-test`);
    });
}

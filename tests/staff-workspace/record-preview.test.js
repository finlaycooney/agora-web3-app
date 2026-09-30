import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';

import {
    POSTGRES_17_IMAGE, assertLocalTestEnvironment, findFreePort, psql,
    publishedPort, startPostgresContainer, stopAndRemoveContainer,
} from '../support/foundation-docker.js';
import {
    AUTHZ_ID, GOOGLE_MIGRATION, INVITES_MIGRATION, INVITE_DOMAINS_MIGRATION,
    installStaffFixture,
} from '../support/staff-authorization.js';
import { PRIVACY_MIGRATIONS } from '../support/privacy-foundation.js';
import { PRIVACY_OPS_MIGRATION } from '../support/privacy-operations.js';
import { WORKFLOW_MIGRATION, clientJobFixtureSql } from '../support/client-job-workflows.js';
import { STAFF_MFA_COOKIE, createStaffMfaProof } from '../../src/lib/staff-mfa-cookie.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const preload = join(root, 'tests', 'staff-workspace', 'google-token-preload.cjs');
const migrations = [
    '20260922090000_foundation_roles.sql',
    '20260922090100_foundation_schema.sql',
    '20260922090200_foundation_seed.sql',
    '20260922130000_staff_authorization_core.sql',
    GOOGLE_MIGRATION,
    ...PRIVACY_MIGRATIONS,
    PRIVACY_OPS_MIGRATION,
    WORKFLOW_MIGRATION,
    '20260925100000_staff_totp.sql',
    '20260925110000_staff_listing.sql',
    INVITES_MIGRATION,
    INVITE_DOMAINS_MIGRATION,
    '20260925140000_application_pipeline.sql',
    '20260926140000_public_intake.sql',
    '20260928100000_staff_workspace.sql',
    '20260928220000_job_visibility.sql',
    '20260930090000_candidate_profiles.sql',
    '20260930090100_candidate_intake_serialization.sql',
    '20261001090000_public_intake_duplicate_review.sql',
    '20261001100000_candidate_merge.sql',
];

async function waitForServer(url) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const response = await fetch(url).catch(() => null);
        if (response?.ok) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Temporary staff server did not start');
}

test('staff previews records in place and opens CV content', async (t) => {
    assertLocalTestEnvironment();
    const db = await startPostgresContainer('pgrecordpreview', POSTGRES_17_IMAGE, {
        publish: true,
    });
    t.after(() => stopAndRemoveContainer(db));
    for (const name of migrations) {
        psql(db, readFileSync(join(root, 'supabase', 'migrations', name), 'utf8'));
    }
    const runtimePassword = installStaffFixture(db);
    psql(db, clientJobFixtureSql);
    const port = await findFreePort();
    const baseURL = `http://127.0.0.1:${port}`;
    const secret = 'synthetic-record-preview-secret';
    const totpId = 'a5b1a111-0000-4000-8000-00000000d101';
    psql(db, `insert into app.totp_credentials
        (id, organization_id, user_id, secret, status, verified_at)
        values ('${totpId}', '${AUTHZ_ID.ORG_B}', '${AUTHZ_ID.USER_ADMIN2}',
            'JBSWY3DPEHPK3PXP', 'active', now());`);
    const output = [];
    const server = spawn(process.execPath,
        [nextBin, 'dev', '--webpack', '-p', String(port), '-H', '127.0.0.1'], {
            cwd: root,
            env: {
                PATH: process.env.PATH, HOME: process.env.HOME,
                NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
                NODE_OPTIONS: `--require ${preload}`,
                STAFF_DATABASE_URL: `postgresql://agora_authz_test:${runtimePassword}@127.0.0.1:${publishedPort(db, 5432)}/postgres`,
                STAFF_ORGANIZATION_ID: AUTHZ_ID.ORG_B,
                NEXTAUTH_URL: baseURL, NEXTAUTH_SECRET: secret,
                GOOGLE_CLIENT_ID: 'synthetic-workspace-client',
                GOOGLE_CLIENT_SECRET: 'synthetic-workspace-client-secret',
                NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
                GITHUB_ID: '', GITHUB_SECRET: '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    server.stdout.on('data', (chunk) => output.push(String(chunk)));
    server.stderr.on('data', (chunk) => output.push(String(chunk)));
    t.after(async () => {
        server.kill('SIGTERM');
        await new Promise((resolve) => {
            const timer = setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 10_000);
            server.once('exit', () => { clearTimeout(timer); resolve(); });
        });
    });
    await waitForServer(`${baseURL}/dev/duplicate-review`);

    const token = await encode({ token: {
        name: 'Admin Two', email: 'admin-two@synthetic.test',
        sub: '1002', provider: 'google', providerAccountId: '1002',
        googleRefreshToken: 'SYNTHETIC-WORKSPACE-TEST', emailVerified: true,
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    }, secret });
    const proof = createStaffMfaProof(secret, {
        subject: '1002', userId: AUTHZ_ID.USER_ADMIN2, credentialId: totpId,
    });
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const context = await browser.newContext();
    await context.addCookies([
        { name: 'next-auth.session-token', value: token, url: baseURL },
        { name: STAFF_MFA_COOKIE, value: proof, url: baseURL },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    try {
        await page.goto(`${baseURL}/staff/candidates?q=Synthetic`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
        const candidateLink = page.getByRole('main')
            .getByRole('link', { name: 'Synthetic Candidate B' }).first();
        await candidateLink.click();
        const candidatePreview = page.getByRole('dialog', { name: 'Synthetic Candidate B' });
        await expect(candidatePreview).toBeVisible();
        await expect(page).toHaveURL(`${baseURL}/staff/candidates?q=Synthetic`);
        await candidatePreview.getByRole('tab', { name: /Documents/ }).click();
        await expect(candidatePreview.getByText('No documents on file.')).toBeVisible();
        await candidatePreview.getByRole('button', { name: 'Close' }).click();
        await expect(candidatePreview).toHaveCount(0);
        assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
        await expect(candidateLink).toBeFocused();

        await page.route('**/api/staff/candidates/*', async (route) => {
            const response = await route.fetch();
            const payload = await response.json();
            payload.result.documents.push({
                documentId: 'bbbbbbbb-2222-4222-8222-222222222222',
                filename: 'Synthetic.docx', purpose: 'cv', lifecycle: 'active',
                scanState: 'clean', sizeBytes: 256, receivedAt: new Date().toISOString(),
            });
            payload.result.capabilities.downloadDocuments = true;
            await route.fulfill({ response, json: payload });
        });
        await page.route('**/api/staff/documents/*?view=text', async (route) => {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ text: 'Synthetic extracted resume text' }) });
        });
        await candidateLink.click();
        const documentPreview = page.getByRole('dialog', { name: 'Synthetic Candidate B' });
        await documentPreview.getByRole('tab', { name: /Documents/ }).click();
        await documentPreview.getByRole('button', { name: 'Synthetic.docx' }).click();
        await expect(documentPreview.getByText('Synthetic extracted resume text')).toBeVisible();
        await documentPreview.getByRole('button', { name: 'Close' }).click();
        await page.unroute('**/api/staff/candidates/*');
        await page.unroute('**/api/staff/documents/*?view=text');

        await page.goto(`${baseURL}/staff/jobs?q=Legacy`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
        const jobLink = page.getByRole('main')
            .getByRole('link', { name: 'Legacy Synthetic Job' }).first();
        await jobLink.click();
        const jobPreview = page.getByRole('dialog', { name: 'Legacy Synthetic Job' });
        await expect(jobPreview).toBeVisible();
        await expect(page).toHaveURL(`${baseURL}/staff/jobs?q=Legacy`);
        await jobPreview.getByRole('button', { name: 'Close' }).click();
        await expect(jobLink).toBeFocused();
        assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
    } catch (error) {
        t.diagnostic(`Browser errors:\n${pageErrors.join('\n')}\nServer:\n${output.slice(-30).join('')}`);
        throw error;
    }
});

import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const runBackendTest = process.env.E2E_REAL_BACKEND === '1';

test.skip(!runBackendTest, 'Set E2E_REAL_BACKEND=1 to test local Supabase.');

test('persists and cleans up an application in local Supabase', async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const hostname = new URL(supabaseUrl).hostname;

    expect(['127.0.0.1', 'localhost']).toContain(hostname);
    expect(serviceRoleKey).not.toBe('');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    let applicant;
    let refId;

    try {
        await page.route('**/api/auth/session', (route) => route.fulfill({ json: {} }));
        await page.goto('/jobs');
        await page.getByRole('button', { name: '[ APPLY ]', exact: true }).first().click();
        await page.getByLabel('Full name').fill('Local Integration Test');
        await page.getByLabel('Email address').fill('integration@example.invalid');
        await page.getByLabel('Professional URL').fill('https://example.invalid/profile');
        await page.getByLabel('Technical achievement').fill('Local integration test record.');
        await page.getByLabel('Upload CV as PDF or DOCX, maximum 4 MB').setInputFiles({
            name: 'integration-test.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.7\nlocal integration test'),
        });

        const responsePromise = page.waitForResponse((response) => (
            response.url().endsWith('/api/submit-signal') && response.request().method() === 'POST'
        ));
        await page.getByRole('button', { name: 'SUBMIT_SIGNAL' }).click();
        const response = await responsePromise;
        const result = await response.json();
        refId = result.refId;

        expect(response.ok()).toBe(true);
        await expect(page.getByText('SIGNAL_VERIFIED')).toBeVisible();

        const queryResult = await supabase
            .from('applicants')
            .select('*')
            .eq('ref_id', refId)
            .single();
        applicant = queryResult.data;

        expect(queryResult.error).toBeNull();
        expect(applicant.job_id).toBe('gondor-founding-engineer');
        expect(applicant.job_title).toBe('Founding Engineer');
        expect(applicant.professional_url).toBe('https://example.invalid/profile');
    } finally {
        if (applicant?.cv_url) {
            await supabase.storage.from('cv-submissions').remove([applicant.cv_url]);
        }
        if (refId) {
            await supabase.from('applicants').delete().eq('ref_id', refId);
        }
    }
});

test('does not persist a honeypot submission or return a reference', async ({ request }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = 'honeypot-test@example.invalid';

    const response = await request.post('/api/submit-signal', {
        multipart: {
            website: 'https://filled-by-automation.invalid',
            jobId: 'gondor-founding-engineer',
            fullName: 'Honeypot Test',
            email,
        },
    });
    const result = await response.json();

    expect(response.status()).toBe(202);
    expect(result.success).toBe(true);
    expect(result.refId).toBeUndefined();

    const queryResult = await supabase
        .from('applicants')
        .select('id')
        .eq('email', email);

    expect(queryResult.error).toBeNull();
    expect(queryResult.data).toEqual([]);
});

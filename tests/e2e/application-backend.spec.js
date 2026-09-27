import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { DOCX_MIME_TYPE } from '../../src/lib/application.js';
import { createSyntheticDocx, createSyntheticPdf } from '../support/cv-fixtures.js';
import { assertLocalSupabaseTarget } from '../support/nonproduction.js';

const runBackendTest = process.env.E2E_REAL_BACKEND === '1';

test.skip(!runBackendTest, 'Set E2E_REAL_BACKEND=1 to test local Supabase.');

// The dev server must also run with INTAKE_DATABASE_URL and
// STAFF_ORGANIZATION_ID pointing at the local stack so the public board and
// intake writes land in app.*.
const ORGANIZATION_ID = process.env.STAFF_ORGANIZATION_ID
    || '9c4edd11-2571-490b-a87c-ef30b9e0a001';
const DATABASE_URL = process.env.E2E_DATABASE_URL
    || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const E2E_SLUG = 'e2e-synthetic-engineer';
const E2E_CLIENT = 'e2e00000-0000-4000-8000-000000000001';
const E2E_JOB = 'e2e00000-0000-4000-8000-000000000002';
const E2E_REVISION = 'e2e00000-0000-4000-8000-000000000003';
const E2E_USER = 'e2e00000-0000-4000-8000-000000000004';
const E2E_MEMBERSHIP = 'e2e00000-0000-4000-8000-000000000005';
const E2E_ROLE = '9c4edd11-2571-490b-a87c-ef30b9e0a011';

const SEED_SQL = `
insert into app.users (id, display_name, status)
values ('${E2E_USER}', 'E2E Publisher', 'active')
on conflict (id) do nothing;

insert into app.organization_memberships (
    id, organization_id, user_id, role_id, status, activated_at
) values (
    '${E2E_MEMBERSHIP}', '${ORGANIZATION_ID}', '${E2E_USER}', '${E2E_ROLE}',
    'active', now()
) on conflict (id) do nothing;

insert into app.clients (
    id, organization_id, name, status, is_stealth, public_profile_version
) values (
    '${E2E_CLIENT}', '${ORGANIZATION_ID}', 'E2E Synthetic Agency', 'active', false, 1
) on conflict (id) do nothing;

insert into app.jobs (
    id, organization_id, client_id, pipeline_id, slug, title, description,
    location_display, employment_type, publication_state, application_state,
    publicly_listed,
    publication_reviewed_by, publication_reviewed_at, published_at
) values (
    '${E2E_JOB}', '${ORGANIZATION_ID}', '${E2E_CLIENT}',
    (select id from app.pipelines
        where organization_id = '${ORGANIZATION_ID}'
            and key = 'default' and status = 'active'),
    '${E2E_SLUG}', 'E2E Synthetic Engineer', 'Build e2e systems.',
    'Remote', 'full_time', 'published', 'open', true,
    '${E2E_MEMBERSHIP}', now(), now()
) on conflict (id) do nothing;

insert into app.job_revisions (
    id, organization_id, job_id, revision_number, title,
    employment_type, workplace_mode, description_document, description_text,
    status, published_at, published_by_membership_id,
    published_client_profile_version, published_company_name,
    published_company_description, published_is_stealth
)
select
    '${E2E_REVISION}', '${ORGANIZATION_ID}', '${E2E_JOB}', 1,
    'E2E Synthetic Engineer', 'full_time', 'remote',
    doc.doc,
    app.job_document_text_v1(doc.doc),
    'published', now(), '${E2E_MEMBERSHIP}',
    1, 'E2E Synthetic Agency', null, false
from (values (
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Build e2e systems."}]}]}'::jsonb
)) as doc(doc)
on conflict (id) do nothing;

update app.jobs set published_revision_id = '${E2E_REVISION}'
    where id = '${E2E_JOB}';
`;

const CLEANUP_SQL = `
create temp table e2e_candidates as
    select distinct i.candidate_id as id
    from app.candidate_identifiers i
    where i.organization_id = '${ORGANIZATION_ID}'
        and i.normalized_value like '%@e2e-intake.invalid';

delete from app.blob_locations
    where object_key like 'cvs/${E2E_SLUG}/%';
delete from app.application_stage_history sh
    using app.applications a
    where a.id = sh.application_id
        and a.candidate_id in (select id from e2e_candidates);
delete from app.application_documents ad
    using app.applications a
    where a.id = ad.application_id
        and a.candidate_id in (select id from e2e_candidates);
delete from app.documents
    where candidate_id in (select id from e2e_candidates);
delete from app.file_blobs b
    where b.candidate_id in (select id from e2e_candidates)
        and not exists (
            select 1 from app.blob_locations bl where bl.blob_id = b.id);
delete from app.applications
    where candidate_id in (select id from e2e_candidates);
delete from app.candidate_identifiers
    where candidate_id in (select id from e2e_candidates);
delete from app.candidate_sources
    where candidate_id in (select id from e2e_candidates);
delete from app.candidates
    where id in (select id from e2e_candidates);
delete from app.job_revisions where id = '${E2E_REVISION}';
delete from app.jobs where id = '${E2E_JOB}';
delete from app.clients where id = '${E2E_CLIENT}';
delete from app.organization_memberships where id = '${E2E_MEMBERSHIP}';
delete from app.users where id = '${E2E_USER}';
`;

const query = async (sql) => {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
        const result = await client.query(sql);
        return result.rows;
    } finally {
        await client.end();
    }
};

test.beforeEach(async () => {
    assertLocalSupabaseTarget(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    await query(SEED_SQL);
});

test.afterEach(async () => {
    await query(CLEANUP_SQL).catch(() => {});
});

for (const fixture of [
    { extension: 'pdf', mimeType: 'application/pdf', bytes: createSyntheticPdf() },
    { extension: 'docx', mimeType: DOCX_MIME_TYPE, bytes: createSyntheticDocx() },
]) {
    test(`lands a ${fixture.extension.toUpperCase()} application in the app pipeline`, async ({ page }) => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        let refId;

        try {
            await page.route('**/api/auth/session', (route) => route.fulfill({ json: {} }));
            await page.goto('/jobs');
            const applyButton = page.getByRole('button', { name: '[ APPLY ]', exact: true }).first();
            await expect(applyButton).toBeVisible();
            await applyButton.click();
            await page.getByLabel('Full name').fill('Local Integration Test');
            await page.getByLabel('Email address').fill(`candidate-${fixture.extension}@e2e-intake.invalid`);
            await page.getByLabel('Professional URL').fill('https://example.invalid/profile');
            await page.getByLabel('Technical achievement').fill('Local integration test record.');
            await page.getByLabel('Upload CV as PDF or DOCX, maximum 4 MB').setInputFiles({
                name: `integration-test.${fixture.extension}`,
                mimeType: fixture.mimeType,
                buffer: fixture.bytes,
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
            expect(refId).toMatch(/^AG-[0-9A-F]{12}$/);

            const applications = await query(`
                select a.job_id::text, j.slug, lower(a.submitted_email) as email,
                       ps.label as stage
                from app.applications a
                join app.jobs j on j.id = a.job_id
                join app.pipeline_stages ps on ps.id = a.stage_id
                where a.public_reference = '${refId}'`);
            expect(applications).toHaveLength(1);
            expect(applications[0].slug).toBe(E2E_SLUG);
            expect(applications[0].email)
                .toBe(`candidate-${fixture.extension}@e2e-intake.invalid`);
            expect(applications[0].stage).toBe('Review');

            const documents = await query(`
                select bl.bucket, bl.object_key, bl.state
                from app.applications a
                join app.application_documents ad on ad.application_id = a.id
                join app.documents d on d.id = ad.document_id
                join app.blob_locations bl on bl.blob_id = d.blob_id
                where a.public_reference = '${refId}'`);
            expect(documents).toHaveLength(1);
            expect(documents[0].bucket).toBe('cv-submissions');
            expect(documents[0].state).toBe('available');

            const download = await supabase.storage
                .from('cv-submissions')
                .download(documents[0].object_key);
            expect(download.error).toBeNull();
            expect(Buffer.from(await download.data.arrayBuffer()))
                .toEqual(fixture.bytes);
        } finally {
            if (refId) {
                const keys = await query(`
                    select bl.object_key
                    from app.applications a
                    join app.application_documents ad on ad.application_id = a.id
                    join app.documents d on d.id = ad.document_id
                    join app.blob_locations bl on bl.blob_id = d.blob_id
                    where a.public_reference = '${refId}'`);
                for (const row of keys) {
                    await supabase.storage
                        .from('cv-submissions')
                        .remove([row.object_key]);
                }
            }
        }
    });
}

test('does not persist a honeypot submission or return a reference', async ({ request }) => {
    const email = 'honeypot-e2e@e2e-intake.invalid';

    const response = await request.post('/api/submit-signal', {
        multipart: {
            website: 'https://filled-by-automation.invalid',
            jobId: E2E_SLUG,
            fullName: 'Honeypot Test',
            email,
        },
    });
    const result = await response.json();

    expect(response.status()).toBe(202);
    expect(result.success).toBe(true);
    expect(result.refId).toBeUndefined();

    const applications = await query(`
        select a.id from app.applications a
        where lower(a.submitted_email) = '${email}'`);
    expect(applications).toHaveLength(0);
});

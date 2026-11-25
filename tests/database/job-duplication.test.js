import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import pg from 'pg';
import {
    POSTGRES_17_IMAGE, assertLocalTestEnvironment, assertSqlstate,
    psql, startPostgresContainer, stopAndRemoveContainer,
} from '../support/foundation-docker.js';
import {
    AUTHZ_ID, GOOGLE_ISSUER, GOOGLE_MIGRATION, INVITES_MIGRATION,
    INVITE_DOMAINS_MIGRATION, installStaffFixture, staffPoolOptions,
} from '../support/staff-authorization.js';
import { PRIVACY_MIGRATIONS } from '../support/privacy-foundation.js';
import { PRIVACY_OPS_MIGRATION } from '../support/privacy-operations.js';
import {
    CJ_ID, CJ_SUBJECTS, WORKFLOW_MIGRATION, clientJobFixtureSql,
} from '../support/client-job-workflows.js';
import {
    createJobDraft, duplicateJob, duplicateJobUnlisted, getJobWorkspace,
    previewJobPublic, publishJobRevision, saveClient, setJobPublicListing,
} from '../../src/lib/client-job-operations.js';

const MIGRATIONS = [
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
    '20260930100000_job_duplication.sql',
];

const JOB_FIELDS = {
    title: 'Synthetic duplicate source', employmentType: 'full_time',
    workplaceMode: 'remote', locations: [], remoteRegions: ['Worldwide'],
    compensationMin: '120000.00', compensationMax: '180000.50',
    currency: 'USD', payPeriod: 'year',
    bonuses: [{ type: 'equity', details: 'Synthetic equity grant' }],
    descriptionDocument: {
        type: 'doc', content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Mission' }] },
            { type: 'paragraph', content: [
                { type: 'text', text: 'Build ' },
                { type: 'text', text: 'synthetic products', marks: [
                    { type: 'bold' },
                    { type: 'link', attrs: { href: 'https://example.com/jd' } },
                ] },
            ] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'First duty' }] },
            ] }] },
        ],
    },
};
const identity = (subject) => ({ provider: 'google', issuer: GOOGLE_ISSUER, subject });

test('unlisted job duplication on isolated PostgreSQL 17', async (t) => {
    assertLocalTestEnvironment();
    const container = await startPostgresContainer('pgjobduplication', POSTGRES_17_IMAGE, {
        publish: true,
    });
    let pool;
    t.after(async () => {
        await pool?.end();
        await stopAndRemoveContainer(container);
    });
    for (const name of MIGRATIONS) {
        psql(container, readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const password = installStaffFixture(container);
    psql(container, clientJobFixtureSql);
    psql(container, `
        insert into app.role_permissions (organization_id, role_id, permission_key)
        values ('${AUTHZ_ID.ORG_B}', '${CJ_ID.ROLE_B_VIEWER}', 'jobs.read'),
               ('${AUTHZ_ID.ORG_B}', '${CJ_ID.ROLE_B_VIEWER}', 'clients.read');
    `);
    pool = new pg.Pool(staffPoolOptions(container, password, 2));
    const call = (operation, input) => operation(
        pool, identity(CJ_SUBJECTS.RECRUITER), AUTHZ_ID.ORG_B, input,
    );
    const clientId = randomUUID();
    await call(saveClient, {
        clientId, expectedVersion: null, operationId: randomUUID(),
        fields: {
            name: 'Synthetic Client', contactName: 'Dana Example',
            contactEmail: 'dana@example.com', telegramUsername: null,
            website: 'https://example.com', socialLinks: [], isStealth: false,
            anonymousDescription: null,
        },
    });
    const sourceId = randomUUID();
    const sourceRevisionId = randomUUID();
    await call(createJobDraft, {
        jobId: sourceId, revisionId: sourceRevisionId, clientId,
        fields: JOB_FIELDS, publiclyListed: true, operationId: randomUUID(),
    });
    const preview = await call(previewJobPublic, { revisionId: sourceRevisionId });
    await call(publishJobRevision, {
        revisionId: sourceRevisionId, expectedVersion: '1',
        expectedClientVersion: preview.clientVersion, reviewHash: preview.reviewHash,
        operationId: randomUUID(),
    });
    const source = await call(getJobWorkspace, { jobId: sourceId });
    const input = {
        sourceRevisionId, expectedSourceVersion: source.published.version,
        clientId, jobId: randomUUID(), revisionId: randomUUID(), operationId: randomUUID(),
    };
    const publicBoard = () => JSON.parse(psql(container, `
        set role app_intake;
        select set_config('app.organization_id', '${AUTHZ_ID.ORG_B}', false);
        select app.list_public_jobs_v1();
    `).trim().split('\n').pop());

    await t.test('copies rich fields into an unlisted draft without changing the listed source', async () => {
        const result = await call(duplicateJobUnlisted, input);
        assert.equal(result.jobId, input.jobId);
        assert.equal(result.status, 'draft');
        const copy = await call(getJobWorkspace, { jobId: input.jobId });
        assert.equal(copy.job.publicationState, 'draft');
        assert.equal(copy.job.publiclyListed, false);
        assert.equal(copy.published, null);
        for (const key of Object.keys(JOB_FIELDS)) {
            assert.deepEqual(copy.draft[key], source.published[key], key);
        }
        assert.deepEqual(await call(getJobWorkspace, { jobId: sourceId }), source);
        const board = JSON.stringify(publicBoard());
        assert.ok(board.includes(sourceId));
        assert.ok(!board.includes(input.jobId));
    });

    await t.test('receipt replay does not duplicate or reset subsequently changed listing', async () => {
        assert.equal((await call(duplicateJobUnlisted, input)).replayed, true);
        const draft = await call(getJobWorkspace, { jobId: input.jobId });
        await call(setJobPublicListing, {
            jobId: input.jobId, listed: true, expectedVersion: draft.job.version,
            operationId: randomUUID(),
        });
        assert.equal((await call(duplicateJobUnlisted, input)).replayed, true);
        assert.equal((await call(getJobWorkspace, { jobId: input.jobId })).job.publiclyListed, true);
        assert.equal(psql(container, `select count(*) from app.jobs where id = '${input.jobId}'`).trim(), '1');
        assert.equal(psql(container, `select count(*) from app.job_revisions where job_id = '${input.jobId}'`).trim(), '1');
        assert.equal(psql(container, `select count(*) from app.recruitment_operation_receipts where operation_id = '${input.operationId}'`).trim(), '1');
        assert.equal(psql(container, `select count(*) from app.audit_events where id = '${input.operationId}'`).trim(), '1');
    });

    await t.test('stale source revisions roll back without creating a job', async () => {
        const stale = { ...input, expectedSourceVersion: '999', jobId: randomUUID(), revisionId: randomUUID(), operationId: randomUUID() };
        await assert.rejects(call(duplicateJobUnlisted, stale), { code: '40001' });
        assert.equal(psql(container, `select count(*) from app.jobs where id = '${stale.jobId}'`).trim(), '0');
    });

    await t.test('cross-organization source is unavailable and read-only staff cannot duplicate', async () => {
        await assert.rejects(duplicateJobUnlisted(
            pool, identity(CJ_SUBJECTS.ADMIN), AUTHZ_ID.ORG_A,
            { ...input, jobId: randomUUID(), revisionId: randomUUID(), operationId: randomUUID() },
        ), { code: 'P0002' });
        await assert.rejects(duplicateJobUnlisted(
            pool, identity(CJ_SUBJECTS.VIEWER), AUTHZ_ID.ORG_B, input,
        ), { code: 'FORBIDDEN' });
        const sql = `select app.duplicate_job_v2('${sourceRevisionId}', ${input.expectedSourceVersion},
            '${clientId}', '${randomUUID()}', '${randomUUID()}', '${randomUUID()}', '${randomUUID()}')`;
        assertSqlstate(container, `set role app_staff;
            select set_config('app.actor_id', '${CJ_ID.USER_B_VIEW}', false),
                set_config('app.organization_id', '${AUTHZ_ID.ORG_B}', false);
            ${sql};`, '42501');
        for (const role of ['app_intake', 'app_worker']) {
            assertSqlstate(container, `set role ${role}; ${sql};`, '42501');
        }
        assertSqlstate(container, 'set role app_staff; select * from app.jobs;', '42501');
        assertSqlstate(container, 'set role app_staff; update app.jobs set publicly_listed = true;', '42501');
        const runtime = await pool.query('select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
        assert.deepEqual(runtime.rows, [{ rolsuper: false, rolbypassrls: false }]);
        const fn = JSON.parse(psql(container, `select json_build_object(
            'owner', pg_get_userbyid(proowner), 'definer', prosecdef, 'config', proconfig)
            from pg_proc where oid = 'app.duplicate_job_v2(uuid,bigint,uuid,uuid,uuid,uuid,uuid)'::regprocedure`).trim());
        assert.equal(fn.owner, 'app_executor');
        assert.equal(fn.definer, true);
        assert.deepEqual(fn.config, ['search_path=pg_catalog, app, pg_temp']);
    });

    await t.test('v1 duplication remains available unchanged', async () => {
        const legacy = { ...input, jobId: randomUUID(), revisionId: randomUUID(), operationId: randomUUID() };
        assert.equal((await call(duplicateJob, legacy)).status, 'draft');
        const copy = await call(getJobWorkspace, { jobId: legacy.jobId });
        assert.equal(copy.job.publiclyListed, true);
        assert.deepEqual(copy.draft.descriptionDocument, JOB_FIELDS.descriptionDocument);
    });
});

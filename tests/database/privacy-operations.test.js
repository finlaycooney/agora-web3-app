import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import {
    POSTGRES_16_IMAGE,
    POSTGRES_17_IMAGE,
    assertLocalTestEnvironment,
    assertSqlstate,
    psql,
    psqlExpectError,
    publishedPort,
    startPostgresContainer,
    stopAndRemoveContainer,
} from '../support/foundation-docker.js';
import {
    AUTHZ_ID,
    GITHUB_ISSUER,
    SUBJECTS,
    installStaffFixture,
    staffPoolOptions,
} from '../support/staff-authorization.js';
import {
    AUTH_ROUTINE_SNAPSHOT_SQL,
    HASH,
    PRIVACY_ID,
    PRIVACY_MIGRATIONS,
    privacyFixtureSql,
} from '../support/privacy-foundation.js';
import {
    PRIVACY_FUNCTIONS,
    PRIVACY_HELPER_FUNCTIONS,
    PRIVACY_OPS_MIGRATION,
    privacyOpsFixtureSql,
} from '../support/privacy-operations.js';
import {
    correctPrivacyCandidate,
    createPrivacyRequest,
    restrictPrivacySubject,
    reviewPrivacySubject,
    verifyPrivacyRequest,
} from '../../src/lib/privacy-operations.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const PREFIX_MIGRATIONS = [
    '20260922090000_foundation_roles.sql',
    '20260922090100_foundation_schema.sql',
    '20260922090200_foundation_seed.sql',
    '20260922130000_staff_authorization_core.sql',
    ...PRIVACY_MIGRATIONS,
];
const readMigration = (name) => readFileSync(join(migrationsDir, name), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const identity = (subject) => ({ provider: 'github', issuer: GITHUB_ISSUER, subject });
const H6 = Buffer.from(HASH.H6, 'hex');

const {
    ORG_A,
    ORG_B,
    ROLE_A_ADMIN,
    USER_ADMIN1,
    USER_RECRUITER,
    USER_SHARED,
    MEMBER_ADMIN1,
} = AUTHZ_ID;
const {
    CAND_1,
    CAND_2,
    CAND_B,
    BLOB_1,
    DOC_1,
    DOC_2,
    DOC_3,
    CPP_1,
    DS_A,
    LR_1,
    LR_2,
    LR_B,
    PURPOSE_ACTIVE,
    REQ_ACCESS,
    REQ_ERASURE,
    REQ_RECEIVED,
    SUBJ_1,
    DISC_HIST,
    DISC_PLANNED,
    DISC_LEGACY,
    RECIP_1,
    MEMBER_OFFICER_A,
} = PRIVACY_ID;

const scalar = (container, sql) => psql(container, sql).trim();

const staffPreamble = (actor, org) => `
    set role app_staff;
    select pg_catalog.set_config('app.actor_id', '${actor ?? ''}', false),
           pg_catalog.set_config('app.organization_id', '${org ?? ''}', false);
`;
const staffBad = (container, actor, org, sql, code) => assertSqlstate(
    container,
    `${staffPreamble(actor, org)} ${sql}`,
    code,
);

const rejectCode = async (promise, code, label) => {
    await assert.rejects(
        promise,
        (error) => error.code === code,
        label ?? `expected ${code}`,
    );
};

async function waitFor(check, description, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) {
            return;
        }
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${description}.`);
        }
        await sleep(100);
    }
}

const createCorrectionRequest = (pool, requestId = randomUUID()) => createPrivacyRequest(
    pool,
    identity(SUBJECTS.ADMIN1),
    ORG_A,
    {
        requestId,
        kind: 'correction',
        receivedAt: new Date(Date.now() - 86400_000).toISOString(),
    },
);

const reviewCandidateSubject = (pool, requestId, requestVersion, subjectId, candidateId, version) =>
    reviewPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
        requestId,
        expectedRequestVersion: String(requestVersion),
        subjectId,
        candidateId,
        expectedTargetVersion: String(version),
    });

const verifyRequest = (pool, requestId, requestVersion) => verifyPrivacyRequest(
    pool,
    identity(SUBJECTS.ADMIN1),
    ORG_A,
    {
        requestId,
        expectedRequestVersion: String(requestVersion),
        verificationMethod: 'synthetic-staff-review',
    },
);

test('privacy operations core on PostgreSQL 17', async (t) => {
    assertLocalTestEnvironment();
    const adminPassword = randomUUID();
    const pg17 = await startPostgresContainer('pgprivacyops', POSTGRES_17_IMAGE, {
        publish: true,
        password: adminPassword,
    });
    let pool;
    let pool1;
    let admin;
    t.after(async () => {
        await pool?.end().catch(() => {});
        await pool1?.end().catch(() => {});
        await admin?.end().catch(() => {});
        await stopAndRemoveContainer(pg17);
    });
    const pg16 = await startPostgresContainer('pgprivacyops16', POSTGRES_16_IMAGE);
    t.after(() => stopAndRemoveContainer(pg16));
    const pgOperator = await startPostgresContainer('pgprivacyopsop', POSTGRES_17_IMAGE);
    t.after(() => stopAndRemoveContainer(pgOperator));

    const timings = {};
    for (const fileName of PREFIX_MIGRATIONS) {
        const startedAt = performance.now();
        psql(pg17, readMigration(fileName));
        timings[fileName] = Math.round(performance.now() - startedAt);
    }

    const runtimePassword = installStaffFixture(pg17);
    psql(pg17, privacyFixtureSql);
    psql(pg17, privacyOpsFixtureSql);

    const snapshotBefore = scalar(pg17, `
        select jsonb_agg(row_to_json(x) order by x.ord, x.id)::text
        from (
            select 1 ord, id::text, to_jsonb(c) row_to_json from app.candidates c
            union all select 2, id::text, to_jsonb(r) from app.privacy_requests r
            union all select 3, id::text, to_jsonb(s) from app.privacy_request_subjects s
            union all select 4, id::text, to_jsonb(l) from app.legacy_records l
            union all select 5, id::text, to_jsonb(d) from app.document_disclosures d
        ) x
    `);
    const authRoutinesBefore = psql(pg17, AUTH_ROUTINE_SNAPSHOT_SQL);

    const opsStarted = performance.now();
    psql(pg17, readMigration(PRIVACY_OPS_MIGRATION));
    timings[PRIVACY_OPS_MIGRATION] = Math.round(performance.now() - opsStarted);
    t.diagnostic(`migration timings ms: ${JSON.stringify(timings)}`);

    const port = publishedPort(pg17, 5432);
    pool = new pg.Pool(staffPoolOptions(pg17, runtimePassword, 4));
    pool1 = new pg.Pool(staffPoolOptions(pg17, runtimePassword, 1));
    admin = new pg.Client({
        host: '127.0.0.1',
        port,
        user: 'postgres',
        password: adminPassword,
        database: 'postgres',
    });
    await admin.connect();

    await t.test('migration preserves foundation data and extends the catalog', () => {
        const snapshotAfter = scalar(pg17, `
            select jsonb_agg(row_to_json(x) order by x.ord, x.id)::text
            from (
                select 1 ord, id::text, to_jsonb(c) row_to_json from app.candidates c
                union all select 2, id::text, to_jsonb(r) from app.privacy_requests r
                union all select 3, id::text,
                    to_jsonb(s) - 'legacy_version' from app.privacy_request_subjects s
                union all select 4, id::text,
                    to_jsonb(l) - 'processing_restricted' - 'lifecycle_generation'
                    from app.legacy_records l
                union all select 5, id::text, to_jsonb(d) from app.document_disclosures d
            ) x
        `);
        assert.deepEqual(JSON.parse(snapshotAfter), JSON.parse(snapshotBefore));

        assert.equal(scalar(pg17, `
            select count(*) from app.legacy_records
            where processing_restricted or lifecycle_generation <> 1`), '0');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_request_subjects
            where legacy_version is not null`), '0');

        assert.equal(scalar(pg17, `
            select count(*) from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relname = 'audit_events'
                and con.conname = 'audit_events_action_check'
                and pg_get_constraintdef(con.oid) like '%privacy.subject.restricted%'`), '1');
        assert.equal(scalar(pg17, `
            select count(*) from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relname = 'audit_events' and con.contype = 'c'
                and pg_get_constraintdef(con.oid) like '%staff.membership.changed%'
                and con.conname <> 'audit_events_action_check'`), '0');

        const routinesAfter = psql(pg17, AUTH_ROUTINE_SNAPSHOT_SQL);
        assert.equal(routinesAfter, authRoutinesBefore,
            'the five authorization routines must be unchanged');

        assert.equal(scalar(pg17, `
            select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            join pg_roles r on r.oid = p.proowner
            where n.nspname = 'app'
                and p.proname in ('${PRIVACY_FUNCTIONS.join("','")}')
                and p.prosecdef and r.rolname = 'app_executor'
                and coalesce(p.proconfig::text, '')
                    like '%search_path=pg_catalog, app, pg_temp%'`), '5');
        assert.equal(scalar(pg17, `
            select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            join pg_roles r on r.oid = p.proowner
            where n.nspname = 'app'
                and p.proname in ('${PRIVACY_HELPER_FUNCTIONS.join("','")}')
                and not p.prosecdef and r.rolname = 'app_owner'
                and coalesce(p.proconfig::text, '')
                    like '%search_path=pg_catalog, app, pg_temp%'`), '3');
        assert.equal(scalar(pg17, `
            select coalesce(bool_or(acl.grantee = 0), false)
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            cross join lateral aclexplode(
                coalesce(p.proacl, acldefault('f', p.proowner))) acl
            where n.nspname = 'app'
                and p.proname in (
                    '${[...PRIVACY_FUNCTIONS, ...PRIVACY_HELPER_FUNCTIONS].join("','")}'
                )`), 'f');
        assert.equal(scalar(pg17, `
            select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            cross join lateral aclexplode(p.proacl) acl
            where n.nspname = 'app'
                and p.proname in ('${PRIVACY_FUNCTIONS.join("','")}')
                and acl.grantee <> p.proowner
                and acl.grantee <> 'app_staff'::regrole`), '0');
        assert.equal(scalar(pg17, `
            select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            cross join lateral aclexplode(p.proacl) acl
            where n.nspname = 'app'
                and p.proname in ('${PRIVACY_HELPER_FUNCTIONS.join("','")}')
                and acl.grantee <> p.proowner
                and acl.grantee <> 'app_executor'::regrole`), '0');

        assert.equal(scalar(pg17, `
            select rolbypassrls from pg_roles where rolname = 'app_executor'`), 'f');
        assert.equal(scalar(pg17, `
            select pg_catalog.has_schema_privilege('app_executor', 'app', 'create')`), 'f');
        assert.equal(scalar(pg17, `
            select count(*) from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            cross join lateral aclexplode(c.relacl) acl
            where n.nspname = 'app' and c.relkind = 'r'
                and c.relname in (
                    'privacy_requests', 'privacy_request_subjects', 'privacy_events',
                    'candidates', 'legacy_records', 'legacy_datasets', 'file_blobs',
                    'documents', 'candidate_processing_purposes', 'document_disclosures')
                and acl.grantee = 'app_executor'::regrole
                and acl.privilege_type in ('DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')`), '0');
        assert.equal(scalar(pg17, `
            select count(*) from pg_policy pol
            join pg_class c on c.oid = pol.polrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and 'app_executor'::regrole = any(pol.polroles)
                and c.relname in (
                    'privacy_requests', 'privacy_request_subjects', 'privacy_events',
                    'candidates', 'legacy_records', 'legacy_datasets', 'file_blobs',
                    'documents', 'candidate_processing_purposes', 'document_disclosures')`),
        '21');
        assert.equal(scalar(pg17, `
            select count(*) from pg_policy pol
            join pg_class c on c.oid = pol.polrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and 'app_executor'::regrole = any(pol.polroles)
                and c.relname in (
                    'privacy_requests', 'privacy_request_subjects', 'privacy_events',
                    'candidates', 'legacy_records', 'legacy_datasets', 'file_blobs',
                    'documents', 'candidate_processing_purposes', 'document_disclosures')
                and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
                    || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
                    not like '%privacy.manage%'`), '0');

        const touchedTables = `'privacy_requests', 'privacy_request_subjects',
            'privacy_events', 'candidates', 'legacy_records', 'legacy_datasets',
            'file_blobs', 'documents', 'candidate_processing_purposes',
            'document_disclosures'`;
        assert.equal(scalar(pg17, `
            select count(*) from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_roles r on r.oid = c.relowner
            where n.nspname = 'app' and c.relkind = 'r'
                and c.relname in (${touchedTables})
                and (r.rolname <> 'app_owner' or not c.relrowsecurity
                    or not c.relforcerowsecurity)`), '0',
        'touched tables stay app_owner-owned with forced row-level security');
        assert.equal(scalar(pg17, `
            select count(*) from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            cross join lateral aclexplode(
                coalesce(c.relacl, acldefault('r'::"char", c.relowner))) acl
            where n.nspname = 'app' and c.relkind = 'r'
                and c.relname in (${touchedTables})
                and acl.grantee <> c.relowner
                and acl.grantee <> 'app_executor'::regrole`), '0',
        'no role other than owner/executor may hold grants on touched tables');
        assert.equal(scalar(pg17, `
            select count(*) from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            cross join lateral aclexplode(c.relacl) acl
            where n.nspname = 'app' and c.relkind = 'r'
                and c.relname in (${touchedTables})
                and acl.grantee = 'app_executor'::regrole
                and (acl.privilege_type not in ('SELECT', 'INSERT')
                    or (acl.privilege_type = 'INSERT' and c.relname not in (
                        'privacy_requests', 'privacy_request_subjects',
                        'privacy_events')))`), '0',
        'executor table privileges are limited to SELECT and INSERT on case tables');
        const columnAclRows = psql(pg17, `
            select c.relname || ':' || a.attname || ':' || acl.privilege_type
                    || ':' || acl.grantee::regrole::text
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid
                and a.attnum > 0 and a.attacl is not null
            cross join lateral aclexplode(a.attacl) acl
            where n.nspname = 'app' and c.relkind = 'r'
                and c.relname in (${touchedTables})`)
            .trim().split('\n').filter(Boolean).sort();
        const expectedColumnAcl = [
            ['candidate_processing_purposes', ['status', 'updated_at', 'version']],
            ['candidates', [
                'full_name', 'lifecycle', 'lifecycle_generation',
                'professional_summary', 'profile_version', 'updated_at', 'version',
            ]],
            ['document_disclosures', ['status', 'updated_at', 'version']],
            ['documents', ['lifecycle', 'updated_at', 'version']],
            ['file_blobs', [
                'lifecycle_generation', 'scan_generation', 'updated_at', 'version',
            ]],
            ['legacy_records', [
                'lifecycle_generation', 'processing_restricted', 'updated_at', 'version',
            ]],
            ['privacy_request_subjects', [
                'candidate_version', 'legacy_version', 'reviewed_at',
                'reviewed_by_membership_id', 'source_sha256',
            ]],
            ['privacy_requests', [
                'status', 'updated_at', 'version', 'verification_method',
                'verified_at', 'verified_by_membership_id',
            ]],
        ].flatMap(([table, columns]) =>
            columns.map((column) => `${table}:${column}:UPDATE:app_executor`),
        ).sort();
        assert.deepEqual(columnAclRows, expectedColumnAcl,
            'executor column UPDATE privileges must match the migration exactly');
        assert.equal(scalar(pg17, `
            select count(*) from pg_policy pol
            join pg_class c on c.oid = pol.polrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relname in (${touchedTables})
                and pol.polroles <> array['app_executor'::regrole]::oid[]`), '0',
        'privacy policies must apply only to app_executor');
        assert.equal(scalar(pg17, `
            select count(*) from pg_policy pol
            join pg_class c on c.oid = pol.polrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relname in (${touchedTables})
                and (pg_get_expr(pol.polqual, pol.polrelid) is null
                    and pg_get_expr(pol.polwithcheck, pol.polrelid) is null
                    or exists (
                        select 1 from unnest(array[
                            pg_get_expr(pol.polqual, pol.polrelid),
                            pg_get_expr(pol.polwithcheck, pol.polrelid)]) expr
                        where expr is not null
                            and (expr not like '%context_uuid_v1%'
                                or expr not like '%organization_id%'
                                or expr not like '%has_permission_v1%'
                                or expr not like '%privacy.manage%')))`), '0',
        'every policy expression must bind the context organization and privacy.manage');
    });

    await t.test('raw table access and helper execution stay denied', async () => {
        const functionCalls = {
            create_privacy_request_v1: `app.create_privacy_request_v1(
                '${randomUUID()}', 'access', now(), null,
                '${randomUUID()}', '${randomUUID()}')`,
            review_privacy_subject_v1: `app.review_privacy_subject_v1(
                '${randomUUID()}', 1, '${randomUUID()}', '${randomUUID()}', null, 1, null,
                '${randomUUID()}', '${randomUUID()}')`,
            verify_privacy_request_v1: `app.verify_privacy_request_v1(
                '${randomUUID()}', 1, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`,
            correct_privacy_candidate_v1: `app.correct_privacy_candidate_v1(
                '${randomUUID()}', 1, '${randomUUID()}', 1, '{}'::jsonb,
                '${randomUUID()}', '${randomUUID()}')`,
            restrict_privacy_subject_v1: `app.restrict_privacy_subject_v1(
                '${randomUUID()}', 1, '${randomUUID()}', 1,
                '${randomUUID()}', '${randomUUID()}')`,
            privacy_actor_v1: `app.privacy_actor_v1(
                '${randomUUID()}', '${randomUUID()}')`,
            privacy_lock_request_v1: `app.privacy_lock_request_v1('${randomUUID()}', 1)`,
            privacy_record_event_v1: `app.privacy_record_event_v1(
                '${randomUUID()}', null, null, 'privacy.request.created', null,
                '${randomUUID()}', '${randomUUID()}', '${randomUUID()}', '{}'::jsonb)`,
        };
        for (const role of ['app_staff', 'app_intake', 'app_worker', 'app_authz_reader']) {
            assert.match(
                psqlExpectError(pg17, `
                    set role ${role}; select count(*) from app.privacy_requests`),
                /42501/, `${role} must not read privacy_requests`);
            for (const fn of PRIVACY_FUNCTIONS) {
                assert.match(
                    psqlExpectError(pg17, `
                        set role ${role}; select ${functionCalls[fn]}`),
                    /42501/, `${role} must not execute ${fn}`);
            }
            for (const fn of PRIVACY_HELPER_FUNCTIONS) {
                assert.match(
                    psqlExpectError(pg17, `
                        set role ${role}; select ${functionCalls[fn]}`),
                    /42501/, `${role} must not execute ${fn}`);
            }
        }
        assert.match(
            psqlExpectError(pg17, `
                set role app_staff; update app.candidates set full_name = 'x'`),
            /42501/, 'app_staff must not write candidates');
        assert.match(
            psqlExpectError(pg17, `
                set role app_staff; delete from app.privacy_requests`),
            /42501/, 'app_staff must not delete privacy_requests');
        assert.match(
            psqlExpectError(pg17, `
                set role app_executor; select app.create_privacy_request_v1(
                    '${randomUUID()}', 'access', now(), null,
                    '${randomUUID()}', '${randomUUID()}')`),
            /42501/, 'app_executor without trusted context must fail closed');

        const roleProbe = await pool.connect();
        try {
            await rejectCode(
                roleProbe.query('set role app_executor'),
                '42501',
                'the runtime staff credential must not assume the executor role',
            );
            await rejectCode(
                roleProbe.query('set role app_authz_reader'),
                '42501',
                'the runtime staff credential must not assume the reader role',
            );
        } finally {
            roleProbe.release();
        }
    });

    await t.test('wrapper end-to-end: create, review, verify, correct', async () => {
        const requestId = randomUUID();
        const subjectId = randomUUID();

        const created = await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId,
            kind: 'correction',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
            dueAt: new Date(Date.now() + 86400_000).toISOString(),
        });
        assert.deepEqual(created, {
            request_id: requestId,
            request_version: '1',
            status: 'received',
        });
        assert.equal(scalar(pg17, `
            select status || '|' || version || '|' || coalesce(candidate_id::text, 'null')
            from app.privacy_requests where id = '${requestId}'`), 'received|1|null');

        const reviewed = await reviewCandidateSubject(pool, requestId, 1, subjectId, CAND_1, 1);
        assert.deepEqual(reviewed, {
            request_id: requestId,
            request_version: '2',
            status: 'received',
            subject_id: subjectId,
            target_version: '1',
        });
        assert.equal(scalar(pg17, `
            select candidate_version || '|' || coalesce(legacy_version::text, 'null') || '|'
                || coalesce(source_sha256::text, 'null') || '|' || reviewed_by_membership_id
            from app.privacy_request_subjects where id = '${subjectId}'`),
        `1|null|null|${MEMBER_ADMIN1}`);

        const verified = await verifyRequest(pool, requestId, 2);
        assert.deepEqual(verified, {
            request_id: requestId,
            request_version: '3',
            status: 'verified',
        });
        assert.equal(scalar(pg17, `
            select verified_by_membership_id from app.privacy_requests
            where id = '${requestId}'`), MEMBER_ADMIN1);

        const corrected = await correctPrivacyCandidate(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId,
            expectedRequestVersion: '3',
            subjectId,
            expectedCandidateVersion: '1',
            changes: {
                full_name: 'Sentinel Corrected Name',
                professional_summary: null,
            },
        });
        assert.deepEqual(corrected, {
            request_id: requestId,
            request_version: '4',
            status: 'in_progress',
            subject_id: subjectId,
            target_version: '2',
            scope: 'candidate_profile_only',
        });
        assert.equal(scalar(pg17, `
            select full_name || '|' || coalesce(professional_summary, 'null') || '|'
                || profile_version || '|' || version || '|' || lifecycle
            from app.candidates where id = '${CAND_1}'`),
        'Sentinel Corrected Name|null|2|2|active');

        assert.equal(scalar(pg17, `
            select string_agg(action, ',' order by sequence)
            from app.privacy_events where request_id = '${requestId}'`),
        'privacy.request.created,privacy.subject.reviewed,'
            + 'privacy.request.verified,privacy.candidate.corrected');
        assert.equal(scalar(pg17, `
            select string_agg(action, ',' order by occurred_at, id)
            from app.audit_events where target_id = '${requestId}'`),
        'privacy.request.created,privacy.subject.reviewed,'
            + 'privacy.request.verified,privacy.candidate.corrected');
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events
            where target_id = '${requestId}'
                and details::text like '%Sentinel%'`), '0',
        'audit details must not carry corrected PII values');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_events
            where request_id = '${requestId}'
                and evidence_code = 'operator_recorded'`), '4');

        assert.equal(scalar(pg17, `
            select public_reference || '|' || reference_version || '|' || version
            from app.applications where id = '${PRIVACY_ID.APP_1}'`),
        'AG-8000AAAABBBB|1|1',
        'submitted application facts must be untouched');
        assert.equal(scalar(pg17, `
            select count(*) from app.file_blobs
            where id = '${BLOB_1}' and version = 1 and scan_generation = 1`),
        '1', 'blob metadata must be untouched by correction');

        await rejectCode(
            correctPrivacyCandidate(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: '4',
                subjectId,
                expectedCandidateVersion: '2',
                changes: { professional_summary: 'Second change' },
            }),
            '40001',
            'a follow-up correction without fresh review must fail stale',
        );
        assert.equal(scalar(pg17, `
            select version from app.privacy_requests where id = '${requestId}'`), '4',
        'rejected correction must roll back the request version');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_events where request_id = '${requestId}'`),
        '4', 'rejected correction must not append events');

        const contextProbe = await pool1.connect();
        let probePid;
        try {
            probePid = (await contextProbe.query(
                'select pg_backend_pid() as pid',
            )).rows[0].pid;
        } finally {
            contextProbe.release();
        }
        await createPrivacyRequest(pool1, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId: randomUUID(),
            kind: 'access',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        const contextCheck = await pool1.connect();
        try {
            const settings = await contextCheck.query(
                `select pg_backend_pid() as pid,
                    current_setting('app.actor_id', true) as actor,
                    current_setting('app.organization_id', true) as org`,
            );
            assert.equal(settings.rows[0].pid, probePid,
                'the probe must inspect the same backend that ran the call');
            assert.deepEqual(
                { actor: settings.rows[0].actor, org: settings.rows[0].org },
                { actor: '', org: '' },
                'transaction-local context must be cleared after successful calls');
        } finally {
            contextCheck.release();
        }
    });

    await t.test('wrapper end-to-end: restriction enforces local metadata only', async () => {
        const requestId = randomUUID();
        const subjectId = randomUUID();

        await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId,
            kind: 'restriction',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        await reviewCandidateSubject(pool, requestId, 1, subjectId, CAND_1, 2);
        await verifyRequest(pool, requestId, 2);
        const restricted = await restrictPrivacySubject(
            pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: '3',
                subjectId,
                expectedTargetVersion: '2',
            });
        assert.deepEqual(restricted, {
            request_id: requestId,
            request_version: '4',
            status: 'in_progress',
            subject_id: subjectId,
            target_version: '3',
            lifecycle_generation: '2',
            scope: 'candidate_records_only',
        });

        assert.equal(scalar(pg17, `
            select lifecycle || '|' || lifecycle_generation || '|' || version
            from app.candidates where id = '${CAND_1}'`), 'restricted|2|3');
        assert.equal(scalar(pg17, `
            select count(*) from app.file_blobs
            where organization_id = '${ORG_A}' and candidate_id = '${CAND_1}'
                and lifecycle_generation = 2 and scan_generation = 2 and version = 2`), '3');
        assert.equal(scalar(pg17, `
            select lifecycle || '|' || version from app.documents
            where id = '${DOC_2}'`), 'restricted|2');
        assert.equal(scalar(pg17, `
            select lifecycle || '|' || version from app.documents
            where id = '${DOC_1}'`), 'retired|1',
        'already-retired documents stay untouched');
        assert.equal(scalar(pg17, `
            select status || '|' || version from app.candidate_processing_purposes
            where id = '${CPP_1}'`), 'restricted|2');
        assert.equal(scalar(pg17, `
            select status from app.document_disclosures where id = '${DISC_PLANNED}'`),
        'cancelled');
        assert.equal(scalar(pg17, `
            select status from app.document_disclosures where id = '${DISC_HIST}'`), 'sent',
        'sent disclosure history must be preserved');
        assert.equal(scalar(pg17, `
            select count(*) from app.legacy_records where id = '${LR_1}'
                and not processing_restricted`), '1',
        'linked legacy records are not restricted by the candidate scope');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_requests where id = '${requestId}'
                and ledger_sequence is null and ledger_confirmed_at is null`), '1',
        'restriction must not fabricate ledger confirmation');

        await rejectCode(
            restrictPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: '4',
                subjectId,
                expectedTargetVersion: '3',
            }),
            '23514',
            'a second restriction on the same subject must fail',
        );

        const correctionRequestId = randomUUID();
        const correctionSubjectId = randomUUID();
        await createCorrectionRequest(pool, correctionRequestId);
        await reviewCandidateSubject(
            pool, correctionRequestId, 1, correctionSubjectId, CAND_1, 3,
        );
        await verifyRequest(pool, correctionRequestId, 2);
        const corrected = await correctPrivacyCandidate(
            pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId: correctionRequestId,
                expectedRequestVersion: '3',
                subjectId: correctionSubjectId,
                expectedCandidateVersion: '3',
                changes: { professional_summary: 'Updated summary while restricted' },
            });
        assert.equal(corrected.scope, 'candidate_profile_only');
        assert.equal(scalar(pg17, `
            select lifecycle from app.candidates where id = '${CAND_1}'`), 'restricted',
        'correction must not lift a restricted lifecycle');
    });

    await t.test('wrapper end-to-end: legacy-only restriction keeps metadata scope', async () => {
        const intendedDisclosureId = randomUUID();
        psql(pg17, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                legacy_record_id, purpose_id, actor_membership_id, origin, channel, status,
                source_sha256, approval_reference) values
            ('${intendedDisclosureId}', '${ORG_A}', '${RECIP_1}', '${LR_2}',
                '${PURPOSE_ACTIVE}', '${MEMBER_OFFICER_A}', 'planned', 'email', 'intended',
                decode('${HASH.H6}', 'hex'), 'synthetic-approval-ref')`);

        const requestId = randomUUID();
        const subjectId = randomUUID();
        await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId,
            kind: 'restriction',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        const reviewed = await reviewPrivacySubject(
            pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: '1',
                subjectId,
                legacyRecordId: LR_2,
                expectedTargetVersion: '1',
                sourceSha256: H6,
            });
        assert.equal(reviewed.target_version, '1');
        assert.equal(scalar(pg17, `
            select legacy_version || '|' || coalesce(candidate_version::text, 'null')
            from app.privacy_request_subjects where id = '${subjectId}'`), '1|null');

        await verifyRequest(pool, requestId, 2);
        const restricted = await restrictPrivacySubject(
            pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: '3',
                subjectId,
                expectedTargetVersion: '1',
            });
        assert.deepEqual(restricted, {
            request_id: requestId,
            request_version: '4',
            status: 'in_progress',
            subject_id: subjectId,
            target_version: '2',
            lifecycle_generation: '2',
            scope: 'legacy_metadata_only',
        });
        assert.equal(scalar(pg17, `
            select processing_restricted || '|' || lifecycle_generation || '|' || version
                || '|' || coalesce(candidate_id::text, 'null')
            from app.legacy_records where id = '${LR_2}'`), 'true|2|2|null',
        'legacy restriction must not fabricate a canonical candidate');
        assert.equal(scalar(pg17, `
            select status from app.document_disclosures
            where id = '${intendedDisclosureId}'`), 'cancelled');
        assert.equal(scalar(pg17, `
            select status from app.document_disclosures where id = '${DISC_LEGACY}'`), 'sent');
        assert.equal(scalar(pg17, `
            select candidate_id is null and status = 'in_progress'
            from app.privacy_requests where id = '${requestId}'`), 't');
    });

    await t.test('cross-tenant and staff-permission gates hold for every procedure', async () => {
        const requestId = randomUUID();
        staffBad(pg17, '', '', `
            select app.create_privacy_request_v1(
                '${requestId}', 'access', now(), null,
                '${randomUUID()}', '${randomUUID()}')`, '42501');
        staffBad(pg17, USER_RECRUITER, ORG_A, `
            select app.create_privacy_request_v1(
                '${requestId}', 'access', now(), null,
                '${randomUUID()}', '${randomUUID()}')`, '42501',
        );
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_requests where id = '${requestId}'`), '0');

        const orgBRequest = randomUUID();
        psql(pg17, `${staffPreamble(USER_SHARED, ORG_B)}
            select app.create_privacy_request_v1(
                '${orgBRequest}', 'access', now() - interval '1 day', null,
                '${randomUUID()}', '${randomUUID()}')`);
        assert.equal(scalar(pg17, `
            select organization_id from app.privacy_requests where id = '${orgBRequest}'`),
        ORG_B, 'shared admin may operate in their own tenant');

        staffBad(pg17, USER_SHARED, ORG_B, `
            select app.review_privacy_subject_v1(
                '${REQ_ACCESS}', 1, '${randomUUID()}', '${CAND_1}', null, 1, null,
                '${randomUUID()}', '${randomUUID()}')`, 'P0002');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${orgBRequest}', 1, '${randomUUID()}', '${CAND_1}', null, 1, null,
                '${randomUUID()}', '${randomUUID()}')`, 'P0002');
        staffBad(pg17, USER_RECRUITER, ORG_A, `
            select app.verify_privacy_request_v1(
                '${REQ_ACCESS}', 1, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`, '42501');

        const reqCorrection = randomUUID();
        const subCorrection = randomUUID();
        const reqRestriction = randomUUID();
        const subRestriction = randomUUID();
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${reqCorrection}', 'correction', now(), null,
                '${randomUUID()}', '${randomUUID()}');
            select app.review_privacy_subject_v1(
                '${reqCorrection}', 1, '${subCorrection}', '${CAND_1}', null, 4, null,
                '${randomUUID()}', '${randomUUID()}');
            select app.verify_privacy_request_v1(
                '${reqCorrection}', 2, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}');
            select app.create_privacy_request_v1(
                '${reqRestriction}', 'restriction', now(), null,
                '${randomUUID()}', '${randomUUID()}');
            select app.review_privacy_subject_v1(
                '${reqRestriction}', 1, '${subRestriction}', '${CAND_1}', null, 4, null,
                '${randomUUID()}', '${randomUUID()}');
            select app.verify_privacy_request_v1(
                '${reqRestriction}', 2, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`);

        const evidenceCounts = () => scalar(pg17, `
            select (select count(*) from app.privacy_events)
                || '|' || (select count(*) from app.audit_events)`);
        const beforeMatrix = evidenceCounts();
        const caseCalls = (caseRequestId, caseSubjectId) => [
            `select app.review_privacy_subject_v1(
                '${caseRequestId}', 1, '${randomUUID()}', '${CAND_1}', null, 4, null,
                '${randomUUID()}', '${randomUUID()}')`,
            `select app.verify_privacy_request_v1(
                '${caseRequestId}', 1, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`,
            `select app.correct_privacy_candidate_v1(
                '${caseRequestId}', 1, '${caseSubjectId}', 4, '{"full_name":"x"}'::jsonb,
                '${randomUUID()}', '${randomUUID()}')`,
            `select app.restrict_privacy_subject_v1(
                '${caseRequestId}', 1, '${caseSubjectId}', 4,
                '${randomUUID()}', '${randomUUID()}')`,
        ];
        const createCall = `select app.create_privacy_request_v1(
            '${randomUUID()}', 'access', now(), null,
            '${randomUUID()}', '${randomUUID()}')`;

        for (const sql of [createCall, ...caseCalls(reqCorrection, subCorrection)]) {
            staffBad(pg17, 'not-a-uuid', ORG_A, sql, '42501');
            staffBad(pg17, USER_ADMIN1, 'not-a-uuid', sql, '42501');
            staffBad(pg17, USER_RECRUITER, ORG_A, sql, '42501');
        }
        for (const sql of caseCalls(orgBRequest, subCorrection)) {
            staffBad(pg17, USER_ADMIN1, ORG_A, sql, 'P0002');
        }
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.correct_privacy_candidate_v1(
                '${reqCorrection}', 3, '${subRestriction}', 4,
                '{"full_name":"Scoped"}'::jsonb,
                '${randomUUID()}', '${randomUUID()}')`, 'P0002',
        'a subject from a different request must be invisible to correction');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.restrict_privacy_subject_v1(
                '${reqRestriction}', 3, '${subCorrection}', 4,
                '${randomUUID()}', '${randomUUID()}')`, 'P0002',
        'a subject from a different request must be invisible to restriction');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${REQ_RECEIVED}', 1, '${randomUUID()}', '${CAND_B}', null, 1, null,
                '${randomUUID()}', '${randomUUID()}')`, 'P0002',
        'a review cannot bind a candidate owned by another agency');
        assert.equal(evidenceCounts(), beforeMatrix,
            'rejected calls must not record privacy or audit events');
    });

    await t.test('validation, state and staleness rejections stay atomic', async () => {
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.create_privacy_request_v1(
                '${randomUUID()}', 'not-a-kind', now(), null,
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.create_privacy_request_v1(
                '${randomUUID()}', 'access', now() + interval '1 day', null,
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.create_privacy_request_v1(
                '${randomUUID()}', 'access', 'infinity'::timestamptz, null,
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.create_privacy_request_v1(
                '${randomUUID()}', 'access', now(), now() - interval '1 day',
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.create_privacy_request_v1(
                '${REQ_ACCESS}', 'access', now(), null,
                '${randomUUID()}', '${randomUUID()}')`, '23505');

        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.verify_privacy_request_v1(
                '${REQ_ACCESS}', 99, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`, '40001');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.verify_privacy_request_v1(
                '${REQ_ACCESS}', 1, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`, '23514');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.verify_privacy_request_v1(
                '${REQ_ERASURE}', 1, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`, '23514');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.restrict_privacy_subject_v1(
                '${REQ_ACCESS}', 1, '${SUBJ_1}', 1,
                '${randomUUID()}', '${randomUUID()}')`, '23514');

        const requestId = randomUUID();
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${requestId}', 'access', now(), null,
                '${randomUUID()}', '${randomUUID()}')`);
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.verify_privacy_request_v1(
                '${requestId}', 1, 'INVALID METHOD',
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.verify_privacy_request_v1(
                '${requestId}', 1, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`, '23514');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', '${CAND_1}', '${LR_2}', 1, null,
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', null, null, 1, null,
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', '${CAND_1}', null, 1,
                decode('${HASH.H6}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', null, '${LR_2}', 1,
                decode('${HASH.H6.slice(0, 32)}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, '22023');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', '${randomUUID()}', null, 1, null,
                '${randomUUID()}', '${randomUUID()}')`, 'P0002');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', '${CAND_1}', null, 99, null,
                '${randomUUID()}', '${randomUUID()}')`, '40001');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', null, '${LR_1}', 1,
                decode('${HASH.H5}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, '40001');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', null, '${LR_B}', 1,
                decode('${HASH.H6}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, 'P0002');
        assert.equal(scalar(pg17, `
            select version from app.privacy_requests where id = '${requestId}'`), '1',
        'rejected reviews must not advance the request version');
    });

    await t.test('subject retargeting, unverified legacy and inactive datasets fail', () => {
        const unverifiedRecord = randomUUID();
        const inactiveDataset = randomUUID();
        const inactiveRecord = randomUUID();
        psql(pg17, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id)
            values ('${unverifiedRecord}', '${ORG_A}', '${DS_A}', 9001);
            insert into app.legacy_datasets (id, organization_id, key, connection_key,
                source_kind, status) values
            ('${inactiveDataset}', '${ORG_A}', 'synthetic-inactive', 'synthetic-inactive-conn',
                'legacy_applicants', 'inactive');
            insert into app.legacy_records (id, organization_id, dataset_id, native_id,
                source_sha256, verified_by_membership_id, verified_at) values
            ('${inactiveRecord}', '${ORG_A}', '${inactiveDataset}', 9002,
                decode('${HASH.H6}', 'hex'), '${MEMBER_OFFICER_A}', now())`);

        const requestId = randomUUID();
        const subjectId = randomUUID();
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${requestId}', 'restriction', now(), null,
                '${randomUUID()}', '${randomUUID()}')`);
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', null, '${unverifiedRecord}', 1,
                decode('${HASH.H6}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, '23514',
        'unverified legacy records cannot be reviewed');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${randomUUID()}', null, '${inactiveRecord}', 1,
                decode('${HASH.H6}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, 'P0002',
        'records in inactive datasets cannot be reviewed');

        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${subjectId}', null, '${LR_1}', 1,
                decode('${HASH.H4}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`);
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 2, '${subjectId}', '${CAND_1}', null, 4, null,
                '${randomUUID()}', '${randomUUID()}')`, '23514',
        'a reviewed subject cannot be retargeted');

        const otherRequestId = randomUUID();
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${otherRequestId}', 'restriction', now(), null,
                '${randomUUID()}', '${randomUUID()}')`);
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${otherRequestId}', 1, '${subjectId}', null, '${LR_1}', 1,
                decode('${HASH.H4}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, '23514',
        'a reviewed subject cannot move between cases');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.review_privacy_subject_v1(
                '${requestId}', 2, '${randomUUID()}', null, '${LR_1}', 1,
                decode('${HASH.H4}', 'hex'),
                '${randomUUID()}', '${randomUUID()}')`, '23505',
        'the same target cannot be reviewed twice within a case');
    });

    await t.test('correction validation and state guards stay atomic', () => {
        const candidateId = randomUUID();
        psql(pg17, `
            insert into app.candidates (id, organization_id, full_name,
                identity_state, lifecycle) values
            ('${candidateId}', '${ORG_A}', 'Synthetic Guard Case',
                'established', 'active')`);
        const candidateVersion = () => scalar(pg17, `
            select version from app.candidates where id = '${candidateId}'`);
        const candidateRow = () => scalar(pg17, `
            select to_jsonb(c)::text from app.candidates c where id = '${candidateId}'`);
        const openCorrectionCase = (requestId, subjectId) => psql(
            pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${requestId}', 'correction', now(), null,
                '${randomUUID()}', '${randomUUID()}');
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${subjectId}', '${candidateId}', null,
                ${candidateVersion()}, null, '${randomUUID()}', '${randomUUID()}');
            select app.verify_privacy_request_v1(
                '${requestId}', 2, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`);

        const requestId = randomUUID();
        const subjectId = randomUUID();
        openCorrectionCase(requestId, subjectId);
        const evidenceCounts = () => scalar(pg17, `
            select (select count(*) from app.privacy_events
                    where request_id = '${requestId}')
                || '|' || (select count(*) from app.audit_events
                    where target_id = '${requestId}')`);
        const beforeRow = candidateRow();

        const invalidChanges = [
            'null',
            `'null'::jsonb`,
            `'[]'::jsonb`,
            `'{}'::jsonb`,
            `'{"nickname":"x"}'::jsonb`,
            `'{"full_name":42}'::jsonb`,
            `'{"full_name":""}'::jsonb`,
            `'{"full_name":"   "}'::jsonb`,
            `jsonb_build_object('full_name', repeat('x', 257))`,
            `jsonb_build_object('professional_summary', repeat('x', 10001))`,
            `jsonb_build_object('professional_summary', repeat(chr(1), 10000))`,
            `'{"full_name":"Synthetic Guard Case"}'::jsonb`,
        ];
        for (const changes of invalidChanges) {
            staffBad(pg17, USER_ADMIN1, ORG_A, `
                select app.correct_privacy_candidate_v1(
                    '${requestId}', 3, '${subjectId}', ${candidateVersion()},
                    ${changes}, '${randomUUID()}', '${randomUUID()}')`, '22023');
        }
        assert.equal(candidateRow(), beforeRow,
            'rejected corrections must not mutate the candidate');
        assert.equal(scalar(pg17, `
            select version from app.privacy_requests where id = '${requestId}'`),
        '3', 'rejected corrections must not advance the request version');
        assert.equal(evidenceCounts(), '3|3',
            'rejected corrections must not record privacy or audit events');

        const corrected = (changes) => {
            const request = randomUUID();
            const subject = randomUUID();
            openCorrectionCase(request, subject);
            psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
                select app.correct_privacy_candidate_v1(
                    '${request}', 3, '${subject}', ${candidateVersion()},
                    ${changes}, '${randomUUID()}', '${randomUUID()}')`);
        };
        corrected(`'{"full_name": null}'::jsonb`);
        assert.equal(scalar(pg17, `
            select coalesce(full_name, '<null>') from app.candidates
            where id = '${candidateId}'`), '<null>',
        'a null full_name correction must clear the stored name');
        corrected(`'{"professional_summary": "Bounded synthetic summary"}'::jsonb`);
        corrected(`'{"professional_summary": null}'::jsonb`);
        assert.equal(scalar(pg17, `
            select professional_summary is null from app.candidates
            where id = '${candidateId}'`), 't',
        'a null professional_summary correction must clear the summary');

        const unverified = randomUUID();
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${unverified}', 'correction', now(), null,
                '${randomUUID()}', '${randomUUID()}')`);
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.correct_privacy_candidate_v1(
                '${unverified}', 1, '${randomUUID()}', 1, '{"full_name":"x"}'::jsonb,
                '${randomUUID()}', '${randomUUID()}')`, '23514',
        'a received request cannot carry corrections');
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.correct_privacy_candidate_v1(
                '${REQ_ACCESS}', 1, '${SUBJ_1}', 1, '{"full_name":"x"}'::jsonb,
                '${randomUUID()}', '${randomUUID()}')`, '23514',
        'a non-correction request cannot carry corrections');

        const terminalCandidate = randomUUID();
        const terminalRequest = randomUUID();
        const terminalSubject = randomUUID();
        psql(pg17, `
            insert into app.candidates (id, organization_id, identity_state, lifecycle)
            values ('${terminalCandidate}', '${ORG_A}', 'established', 'active')`);
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${terminalRequest}', 'correction', now(), null,
                '${randomUUID()}', '${randomUUID()}');
            select app.review_privacy_subject_v1(
                '${terminalRequest}', 1, '${terminalSubject}', '${terminalCandidate}',
                null, 1, null, '${randomUUID()}', '${randomUUID()}');
            select app.verify_privacy_request_v1(
                '${terminalRequest}', 2, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`);
        psql(pg17, `
            update app.candidates set lifecycle = 'deleting'
            where id = '${terminalCandidate}'`);
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.correct_privacy_candidate_v1(
                '${terminalRequest}', 3, '${terminalSubject}', 1,
                '{"full_name":"x"}'::jsonb,
                '${randomUUID()}', '${randomUUID()}')`, '23514',
        'a terminal candidate cannot be corrected');

        assertSqlstate(pg17, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                candidate_id, candidate_version, legacy_version,
                reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', '${CAND_1}', 1, 1,
                '${MEMBER_OFFICER_A}', now())`, '23514',
        'a candidate subject cannot carry a legacy version');
    });

    await t.test('duplicate audit identifiers roll back actual mutations', () => {
        const seedAudit = (auditId) => psql(pg17, `
            insert into app.audit_events (id, organization_id, actor_kind,
                actor_user_id, actor_membership_id, action, target_type, target_id,
                correlation_id, occurred_at, details) values
            ('${auditId}', '${ORG_A}', 'staff', '${USER_ADMIN1}', '${MEMBER_ADMIN1}',
                'privacy.request.created', 'privacy_request', '${randomUUID()}',
                '${randomUUID()}', now(), '{"new_version":1}'::jsonb)`);
        const existingAuditId = randomUUID();
        seedAudit(existingAuditId);

        const candidateId = randomUUID();
        const requestId = randomUUID();
        const subjectId = randomUUID();
        psql(pg17, `
            insert into app.candidates (id, organization_id, full_name,
                identity_state, lifecycle) values
            ('${candidateId}', '${ORG_A}', 'Synthetic Rollback',
                'established', 'active')`);
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${requestId}', 'correction', now(), null,
                '${randomUUID()}', '${randomUUID()}');
            select app.review_privacy_subject_v1(
                '${requestId}', 1, '${subjectId}', '${candidateId}', null, 1, null,
                '${randomUUID()}', '${randomUUID()}');
            select app.verify_privacy_request_v1(
                '${requestId}', 2, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`);
        const snapshots = () => scalar(pg17, `
            select
                (select to_jsonb(c)::text from app.candidates c
                    where id = '${candidateId}')
                || '|' || (select to_jsonb(r)::text from app.privacy_requests r
                    where id = '${requestId}')
                || '|' || (select to_jsonb(s)::text from app.privacy_request_subjects s
                    where id = '${subjectId}')
                || '|' || (select count(*) from app.privacy_events
                    where request_id = '${requestId}')
                || '|' || (select count(*) from app.audit_events
                    where target_id = '${requestId}')`);
        const before = snapshots();
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.correct_privacy_candidate_v1(
                '${requestId}', 3, '${subjectId}', 1,
                '{"full_name":"Duplicate Audit"}'::jsonb,
                '${existingAuditId}', '${randomUUID()}')`, '23505');
        assert.equal(snapshots(), before,
            'an audit id collision must roll back the candidate mutation');
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events where id = '${existingAuditId}'`),
        '1', 'the pre-existing audit row must remain exactly one row');

        const legacyId = randomUUID();
        const disclosureId = randomUUID();
        const legacyRequest = randomUUID();
        const legacySubject = randomUUID();
        psql(pg17, `
            insert into app.legacy_records (id, organization_id, dataset_id,
                native_id, source_sha256, verified_by_membership_id, verified_at)
            values ('${legacyId}', '${ORG_A}', '${DS_A}', 9101,
                decode('${HASH.H3}', 'hex'), '${MEMBER_OFFICER_A}', now());
            insert into app.document_disclosures (id, organization_id, recipient_id,
                legacy_record_id, purpose_id, actor_membership_id, origin, channel,
                status, source_sha256, approval_reference) values
            ('${disclosureId}', '${ORG_A}', '${RECIP_1}', '${legacyId}',
                '${PURPOSE_ACTIVE}', '${MEMBER_OFFICER_A}', 'planned', 'email',
                'intended', decode('${HASH.H3}', 'hex'), 'synthetic-approval-ref')`);
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${legacyRequest}', 'restriction', now(), null,
                '${randomUUID()}', '${randomUUID()}');
            select app.review_privacy_subject_v1(
                '${legacyRequest}', 1, '${legacySubject}', null, '${legacyId}', 1,
                decode('${HASH.H3}', 'hex'), '${randomUUID()}', '${randomUUID()}');
            select app.verify_privacy_request_v1(
                '${legacyRequest}', 2, 'synthetic-staff-review',
                '${randomUUID()}', '${randomUUID()}')`);
        const existingAuditId2 = randomUUID();
        seedAudit(existingAuditId2);
        const legacySnapshot = () => scalar(pg17, `
            select
                (select to_jsonb(l)::text from app.legacy_records l
                    where id = '${legacyId}')
                || '|' || (select status || '|' || version
                    from app.document_disclosures where id = '${disclosureId}')
                || '|' || (select count(*) from app.privacy_events
                    where request_id = '${legacyRequest}')
                || '|' || (select count(*) from app.audit_events
                    where target_id = '${legacyRequest}')`);
        const legacyBefore = legacySnapshot();
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.restrict_privacy_subject_v1(
                '${legacyRequest}', 3, '${legacySubject}', 1,
                '${existingAuditId2}', '${randomUUID()}')`, '23505');
        assert.equal(legacySnapshot(), legacyBefore,
            'an audit id collision must roll back the restriction effects');
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events where id = '${existingAuditId2}'`),
        '1', 'the pre-existing audit row must remain exactly one row');
    });

    await t.test('legacy restriction requires the reviewed snapshot', async () => {
        const insertVerifiedLegacy = (nativeId) => {
            const id = randomUUID();
            psql(pg17, `
                insert into app.legacy_records (id, organization_id, dataset_id,
                    native_id, source_sha256, verified_by_membership_id, verified_at)
                values ('${id}', '${ORG_A}', '${DS_A}', ${nativeId},
                    decode('${HASH.H3}', 'hex'), '${MEMBER_OFFICER_A}', now())`);
            return id;
        };
        const openLegacyCase = async (requestId, subjectId, legacyId, version) => {
            await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                kind: 'restriction',
                receivedAt: new Date(Date.now() - 86400_000).toISOString(),
            });
            await reviewPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: '1',
                subjectId,
                legacyRecordId: legacyId,
                expectedTargetVersion: String(version),
                sourceSha256: Buffer.from(HASH.H3, 'hex'),
            });
            await verifyRequest(pool, requestId, 2);
        };
        const restrict = (requestId, requestVersion, subjectId, version) =>
            restrictPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: String(requestVersion),
                subjectId,
                expectedTargetVersion: String(version),
            });
        const restrictedFlag = (id) => scalar(pg17, `
            select processing_restricted || '|' || version from app.legacy_records
            where id = '${id}'`);

        const legacyA = insertVerifiedLegacy(9201);
        const requestA = randomUUID();
        const subjectA = randomUUID();
        await openLegacyCase(requestA, subjectA, legacyA, 1);
        psql(pg17, `
            update app.legacy_records set source_sha256 = decode('${HASH.H5}', 'hex')
            where id = '${legacyA}'`);
        await rejectCode(restrict(requestA, 3, subjectA, 1), '40001',
            'a fingerprint changed without a version bump must fail');
        psql(pg17, `
            update app.legacy_records
            set source_sha256 = decode('${HASH.H3}', 'hex'), version = version + 1
            where id = '${legacyA}'`);
        await rejectCode(restrict(requestA, 3, subjectA, 1), '40001',
            'a version bump after review must fail');
        assert.equal(restrictedFlag(legacyA), 'false|2',
            'failed restrictions must not restrict the record');
        await reviewPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId: requestA,
            expectedRequestVersion: '3',
            subjectId: subjectA,
            legacyRecordId: legacyA,
            expectedTargetVersion: '2',
            sourceSha256: Buffer.from(HASH.H3, 'hex'),
        });
        const restrictedA = await restrict(requestA, 4, subjectA, 2);
        assert.equal(restrictedA.scope, 'legacy_metadata_only');
        assert.equal(restrictedFlag(legacyA), 'true|3');

        const legacyB = insertVerifiedLegacy(9202);
        const requestB = randomUUID();
        const subjectB = randomUUID();
        await openLegacyCase(requestB, subjectB, legacyB, 1);
        psql(pg17, `
            update app.legacy_datasets set status = 'inactive'
            where id = '${DS_A}'`);
        try {
            await rejectCode(restrict(requestB, 3, subjectB, 1), 'P0002',
                'an inactive dataset must hide the legacy target');
        } finally {
            psql(pg17, `
                update app.legacy_datasets set status = 'active'
                where id = '${DS_A}'`);
        }
        assert.equal(restrictedFlag(legacyB), 'false|1');

        const legacyC = insertVerifiedLegacy(9203);
        const requestC = randomUUID();
        const subjectC = randomUUID();
        await openLegacyCase(requestC, subjectC, legacyC, 1);
        psql(pg17, `
            update app.legacy_records
            set verified_at = null, verified_by_membership_id = null
            where id = '${legacyC}'`);
        await rejectCode(restrict(requestC, 3, subjectC, 1), '40001',
            'losing verification after review must fail as a stale snapshot');
        assert.equal(restrictedFlag(legacyC), 'false|1');

        const legacyD = insertVerifiedLegacy(9204);
        const requestD = randomUUID();
        const subjectD = randomUUID();
        await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId: requestD,
            kind: 'restriction',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        psql(pg17, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                legacy_record_id, source_sha256, reviewed_by_membership_id,
                reviewed_at) values
            ('${subjectD}', '${ORG_A}', '${requestD}', '${legacyD}',
                decode('${HASH.H3}', 'hex'), '${MEMBER_OFFICER_A}', now())`);
        await verifyRequest(pool, requestD, 1);
        await rejectCode(restrict(requestD, 2, subjectD, 1), '40001',
            'a subject reviewed before versioning cannot act without re-review');
        await reviewPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId: requestD,
            expectedRequestVersion: '2',
            subjectId: subjectD,
            legacyRecordId: legacyD,
            expectedTargetVersion: '1',
            sourceSha256: Buffer.from(HASH.H3, 'hex'),
        });
        const restrictedD = await restrict(requestD, 3, subjectD, 1);
        assert.equal(restrictedD.scope, 'legacy_metadata_only');
        assert.equal(restrictedFlag(legacyD), 'true|2');
        assert.equal(scalar(pg17, `
            select count(*) from app.legacy_records
            where id in ('${legacyA}', '${legacyB}', '${legacyC}', '${legacyD}')
                and candidate_id is not null`), '0',
        'legacy restriction must not fabricate canonical candidates');
    });

    await t.test('restriction does not wait on terminal child rows', async () => {
        const candidateId = randomUUID();
        const blobId = randomUUID();
        const documentId = randomUUID();
        const sentDisclosureId = randomUUID();
        psql(pg17, `
            insert into app.candidates (id, organization_id, identity_state, lifecycle)
            values ('${candidateId}', '${ORG_A}', 'established', 'active');
            insert into app.file_blobs (id, organization_id, candidate_id, sha256,
                size_bytes, mime_type, extension, lifecycle, scan_state) values
            ('${blobId}', '${ORG_A}', '${candidateId}', decode('${HASH.H1}', 'hex'),
                4096, 'application/pdf', 'pdf', 'live', 'unscanned');
            insert into app.documents (id, organization_id, candidate_id, blob_id,
                purpose, original_filename, received_at, lifecycle) values
            ('${documentId}', '${ORG_A}', '${candidateId}', '${blobId}', 'cv',
                'synthetic.pdf', now(), 'active');
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, origin, channel, status, sent_at) values
            ('${sentDisclosureId}', '${ORG_A}', '${RECIP_1}', '${candidateId}',
                '${documentId}', 'historical', 'email', 'sent', now())`);

        const requestId = randomUUID();
        const subjectId = randomUUID();
        await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId,
            kind: 'restriction',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        await reviewCandidateSubject(pool, requestId, 1, subjectId, candidateId, 1);
        await verifyRequest(pool, requestId, 2);

        await admin.query('begin');
        await admin.query(
            'select id from app.document_disclosures where id = $1 for update',
            [sentDisclosureId],
        );
        try {
            const restricted = await restrictPrivacySubject(
                pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                    requestId,
                    expectedRequestVersion: '3',
                    subjectId,
                    expectedTargetVersion: '1',
                });
            assert.equal(restricted.scope, 'candidate_records_only',
                'restriction must not wait on a locked sent disclosure');
        } finally {
            await admin.query('rollback').catch(() => {});
        }
        assert.equal(scalar(pg17, `
            select status || '|' || version from app.document_disclosures
            where id = '${sentDisclosureId}'`), 'sent|1',
        'the sent disclosure must remain untouched');

        const legacyId = randomUUID();
        const legacySentId = randomUUID();
        const legacyRequest = randomUUID();
        const legacySubject = randomUUID();
        psql(pg17, `
            insert into app.legacy_records (id, organization_id, dataset_id,
                native_id, source_sha256, verified_by_membership_id, verified_at)
            values ('${legacyId}', '${ORG_A}', '${DS_A}', 9301,
                decode('${HASH.H3}', 'hex'), '${MEMBER_OFFICER_A}', now());
            insert into app.document_disclosures (id, organization_id, recipient_id,
                legacy_record_id, origin, channel, status, sent_at) values
            ('${legacySentId}', '${ORG_A}', '${RECIP_1}', '${legacyId}',
                'historical', 'email', 'sent', now())`);
        await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId: legacyRequest,
            kind: 'restriction',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        await reviewPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId: legacyRequest,
            expectedRequestVersion: '1',
            subjectId: legacySubject,
            legacyRecordId: legacyId,
            expectedTargetVersion: '1',
            sourceSha256: Buffer.from(HASH.H3, 'hex'),
        });
        await verifyRequest(pool, legacyRequest, 2);
        await admin.query('begin');
        await admin.query(
            'select id from app.document_disclosures where id = $1 for update',
            [legacySentId],
        );
        try {
            const restricted = await restrictPrivacySubject(
                pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                    requestId: legacyRequest,
                    expectedRequestVersion: '3',
                    subjectId: legacySubject,
                    expectedTargetVersion: '1',
                });
            assert.equal(restricted.scope, 'legacy_metadata_only',
                'legacy restriction must not wait on a locked sent disclosure');
        } finally {
            await admin.query('rollback').catch(() => {});
        }
        assert.equal(scalar(pg17, `
            select status from app.document_disclosures
            where id = '${legacySentId}'`), 'sent');
    });

    await t.test('duplicate audit identifiers roll back the whole operation', () => {
        const auditId = randomUUID();
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select app.create_privacy_request_v1(
                '${randomUUID()}', 'access', now(), null, '${auditId}', '${randomUUID()}')`);
        const duplicateRequest = randomUUID();
        staffBad(pg17, USER_ADMIN1, ORG_A, `
            select app.create_privacy_request_v1(
                '${duplicateRequest}', 'access', now(), null,
                '${auditId}', '${randomUUID()}')`, '23505');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_requests where id = '${duplicateRequest}'`),
        '0', 'request insert must roll back with the event');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_events where request_id = '${duplicateRequest}'`),
        '0');
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events where id = '${auditId}'`), '1');
    });

    await t.test('audit contract keeps privacy actions and staff actions strict', () => {
        assertSqlstate(pg17, `
            insert into app.audit_events (id, organization_id, actor_kind, actor_user_id,
                actor_membership_id, action, target_type, target_id, correlation_id,
                occurred_at, details) values
            ('${randomUUID()}', '${ORG_A}', 'staff', '${USER_ADMIN1}', '${MEMBER_ADMIN1}',
                'privacy.request.created', 'privacy_request', '${randomUUID()}',
                '${randomUUID()}', now(),
                jsonb_build_object('full_name', 'leaked name'))`, '23514',
        );
        assertSqlstate(pg17, `
            insert into app.audit_events (id, organization_id, actor_kind, actor_user_id,
                actor_membership_id, action, target_type, target_id, correlation_id,
                occurred_at, details) values
            ('${randomUUID()}', '${ORG_A}', 'staff', '${USER_ADMIN1}', '${MEMBER_ADMIN1}',
                'privacy.request.created', 'privacy_request', null,
                '${randomUUID()}', now(), '{}')`, '23514',
        );
        psql(pg17, `
            insert into app.audit_events (id, organization_id, actor_kind, actor_user_id,
                actor_membership_id, action, target_type, target_id, correlation_id,
                occurred_at, details) values
            ('${randomUUID()}', '${ORG_A}', 'staff', '${USER_ADMIN1}', '${MEMBER_ADMIN1}',
                'privacy.request.created', 'privacy_request', '${randomUUID()}',
                '${randomUUID()}', now(),
                jsonb_build_object('new_version', 1, 'subject_id', '${randomUUID()}'))`);

        const version = Number(scalar(pg17, `
            select version from app.organization_memberships
            where id = '${AUTHZ_ID.MEMBER_CUSTOM}'`));
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select membership_id, version from app.change_membership_v1(
                '${AUTHZ_ID.MEMBER_CUSTOM}', '${AUTHZ_ID.ROLE_A_CUSTOM}', 'revoked',
                ${version}, '${randomUUID()}', '${randomUUID()}')`);
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select membership_id, version from app.change_membership_v1(
                '${AUTHZ_ID.MEMBER_CUSTOM}', '${AUTHZ_ID.ROLE_A_CUSTOM}', 'active',
                ${version + 1}, '${randomUUID()}', '${randomUUID()}')`);
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events
            where action = 'staff.membership.changed'`), '2',
        'the original staff audit branch must still apply');

        const roleVersion = Number(scalar(pg17, `
            select version from app.roles where id = '${AUTHZ_ID.ROLE_A_CUSTOM}'`));
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select role_id, version from app.change_role_grants_v1(
                '${AUTHZ_ID.ROLE_A_CUSTOM}', ${roleVersion}, '{}'::text[],
                array['candidates.read'],
                '${randomUUID()}', '${randomUUID()}')`);
        psql(pg17, `${staffPreamble(USER_ADMIN1, ORG_A)}
            select role_id, version from app.change_role_grants_v1(
                '${AUTHZ_ID.ROLE_A_CUSTOM}', ${roleVersion + 1},
                array['candidates.read'], '{}'::text[],
                '${randomUUID()}', '${randomUUID()}')`);
        assert.equal(scalar(pg17, `
            select count(*) from app.role_permissions
            where role_id = '${AUTHZ_ID.ROLE_A_CUSTOM}'
                and permission_key = 'candidates.read'`), '1',
        'the role grant must be restored after the regression');
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events
            where action = 'staff.role_grants.changed'`), '2',
        'the original role-grants audit branch must still apply');
    });

    await t.test('isolation and permission re-check after the organization lock', async () => {
        assertSqlstate(pg17, `
            set role app_staff;
            select pg_catalog.set_config('app.actor_id', '${USER_ADMIN1}', false),
                   pg_catalog.set_config('app.organization_id', '${ORG_A}', false);
            begin isolation level repeatable read;
            select app.create_privacy_request_v1(
                '${randomUUID()}', 'access', now(), null,
                '${randomUUID()}', '${randomUUID()}');
            commit`, '25001');

        const lockWaiterDenial = async ({ applyDenial, restoreDenial, label }) => {
            await admin.query('begin');
            await admin.query(
                'select id from app.organizations where id = $1 for update',
                [ORG_A],
            );
            const waiterClient = await pool.connect();
            const waiterPid = Number((await waiterClient.query(
                'select pg_backend_pid() as pid',
            )).rows[0].pid);
            const waiterRequestId = randomUUID();
            const waiterAuditId = randomUUID();
            const waiter = (async () => {
                try {
                    await waiterClient.query('begin');
                    await waiterClient.query(`set local role app_staff`);
                    await waiterClient.query(
                        `select
                            pg_catalog.set_config('app.actor_id', $1, true),
                            pg_catalog.set_config('app.organization_id', $2, true)`,
                        [USER_ADMIN1, ORG_A],
                    );
                    const result = await waiterClient.query(
                        `select app.create_privacy_request_v1($1, $2, $3, $4, $5, $6)`,
                        [
                            waiterRequestId,
                            'access',
                            new Date().toISOString(),
                            null,
                            waiterAuditId,
                            randomUUID(),
                        ],
                    );
                    await waiterClient.query('commit');
                    return result.rows;
                } catch (error) {
                    await waiterClient.query('rollback').catch(() => {});
                    throw error;
                } finally {
                    waiterClient.release();
                }
            })();
            const waiterOutcome = waiter.then(
                (value) => ({ value }),
                (error) => ({ error }),
            );
            try {
                await waitFor(async () => {
                    const settled = await Promise.race([
                        waiterOutcome,
                        Promise.resolve(null),
                    ]);
                    if (settled?.error) {
                        throw settled.error;
                    }
                    const waiting = await admin.query(
                        `select locktype, mode from pg_locks
                         where pid = $1 and not granted`,
                        [waiterPid],
                    );
                    return waiting.rows.length > 0;
                }, `privacy call to block on the organization lock (${label})`);
                await applyDenial();
                await admin.query('commit');
            } catch (error) {
                await admin.query('rollback').catch(() => {});
                await waiterOutcome;
                throw error;
            }
            const outcome = await waiterOutcome;
            assert.ok(outcome.error, `${label}: waiter must recheck after lock`);
            assert.equal(outcome.error.code, '42501', `${label}: waiter must recheck`);
            assert.equal(scalar(pg17, `
                select count(*) from app.privacy_requests
                where id = '${waiterRequestId}'`), '0',
            `${label}: the denied waiter must not insert a request`);
            assert.equal(scalar(pg17, `
                select count(*) from app.privacy_events
                where id = '${waiterAuditId}'`), '0',
            `${label}: the denied waiter must not insert a privacy event`);
            assert.equal(scalar(pg17, `
                select count(*) from app.audit_events
                where id = '${waiterAuditId}'`), '0',
            `${label}: the denied waiter must not insert an audit row`);
            await restoreDenial();
        };

        await lockWaiterDenial({
            label: 'privacy.manage grant removed while waiting',
            applyDenial: () => admin.query(
                `delete from app.role_permissions
                 where organization_id = $1 and role_id = $2
                    and permission_key = 'privacy.manage'`,
                [ORG_A, ROLE_A_ADMIN],
            ),
            restoreDenial: () => admin.query(
                `insert into app.role_permissions
                    (organization_id, role_id, permission_key)
                 values ($1, $2, 'privacy.manage') on conflict do nothing`,
                [ORG_A, ROLE_A_ADMIN],
            ),
        });
        await lockWaiterDenial({
            label: 'actor membership revoked while waiting',
            applyDenial: () => admin.query(
                `update app.organization_memberships
                 set status = 'revoked', revoked_at = now(), version = version + 1,
                    updated_at = now()
                 where id = $1`,
                [MEMBER_ADMIN1],
            ),
            restoreDenial: () => admin.query(
                `update app.organization_memberships
                 set status = 'active', revoked_at = null,
                    activated_at = coalesce(activated_at, now()),
                    version = version + 1, updated_at = now()
                 where id = $1`,
                [MEMBER_ADMIN1],
            ),
        });

        const freshRequest = () => createPrivacyRequest(pool1, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId: randomUUID(),
            kind: 'access',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        await admin.query(
            `delete from app.role_permissions
             where organization_id = $1 and role_id = $2
                and permission_key = 'privacy.manage'`,
            [ORG_A, ROLE_A_ADMIN],
        );
        await assert.rejects(
            freshRequest(),
            (error) => error.code === 'FORBIDDEN',
            'the next request on the same pooled client must deny after grant revocation',
        );
        await admin.query(
            `insert into app.role_permissions
                (organization_id, role_id, permission_key)
             values ($1, $2, 'privacy.manage') on conflict do nothing`,
            [ORG_A, ROLE_A_ADMIN],
        );
        await admin.query(
            `update app.organization_memberships
             set status = 'revoked', revoked_at = now(), version = version + 1,
                updated_at = now()
             where id = $1`,
            [MEMBER_ADMIN1],
        );
        await assert.rejects(
            freshRequest(),
            (error) => error.code === 'UNAUTHORIZED',
            'the next request on the same pooled client must deny after membership revocation',
        );
        await admin.query(
            `update app.organization_memberships
             set status = 'active', revoked_at = null,
                activated_at = coalesce(activated_at, now()),
                version = version + 1, updated_at = now()
             where id = $1`,
            [MEMBER_ADMIN1],
        );

        const sharedCreate = (organizationId) => createPrivacyRequest(
            pool1,
            identity(SUBJECTS.SHARED),
            organizationId,
            {
                requestId: randomUUID(),
                kind: 'access',
                receivedAt: new Date(Date.now() - 86400_000).toISOString(),
            },
        );
        const orgBRequest = await sharedCreate(ORG_B);
        assert.equal(orgBRequest.status, 'received',
            'the shared admin may create in their own tenant on the pooled client');
        await assert.rejects(
            sharedCreate(ORG_A),
            (error) => error.code === 'FORBIDDEN',
            'the same pooled client must not carry privacy.manage across tenants',
        );

        const contextCheck = await pool1.connect();
        try {
            const settings = await contextCheck.query(
                `select
                    current_setting('app.actor_id', true) as actor,
                    current_setting('app.organization_id', true) as org`,
            );
            assert.deepEqual(settings.rows[0], { actor: '', org: '' },
                'failed requests must not leak transaction-local context');
        } finally {
            contextCheck.release();
        }
    });

    await t.test('concurrent corrections with the same versions race exactly once', async () => {
        const requestId = randomUUID();
        const subjectId = randomUUID();
        await createCorrectionRequest(pool, requestId);
        await reviewCandidateSubject(pool, requestId, 1, subjectId, CAND_2, 1);
        await verifyRequest(pool, requestId, 2);

        await admin.query('begin');
        await admin.query(
            'select id from app.organizations where id = $1 for update',
            [ORG_A],
        );
        const clientA = await pool.connect();
        const clientB = await pool.connect();
        const pidA = Number((await clientA.query(
            'select pg_backend_pid() as pid',
        )).rows[0].pid);
        const pidB = Number((await clientB.query(
            'select pg_backend_pid() as pid',
        )).rows[0].pid);
        const call = async (client, summary) => {
            try {
                await client.query('begin');
                await client.query('set local role app_staff');
                await client.query(
                    `select
                        pg_catalog.set_config('app.actor_id', $1, true),
                        pg_catalog.set_config('app.organization_id', $2, true)`,
                    [USER_ADMIN1, ORG_A],
                );
                const result = await client.query(
                    `select app.correct_privacy_candidate_v1(
                        $1, $2, $3, $4, $5::jsonb, $6, $7) as result`,
                    [
                        requestId,
                        3,
                        subjectId,
                        1,
                        JSON.stringify({ professional_summary: summary }),
                        randomUUID(),
                        randomUUID(),
                    ],
                );
                await client.query('commit');
                return { ok: true, result: result.rows[0].result };
            } catch (error) {
                await client.query('rollback').catch(() => {});
                return { ok: false, error };
            } finally {
                client.release();
            }
        };
        try {
            const calls = [
                call(clientA, 'race summary A'),
                call(clientB, 'race summary B'),
            ];
            await waitFor(async () => {
                const waiting = await admin.query(
                    `select count(*) from pg_locks
                     where pid = any($1::int[]) and not granted`,
                    [[pidA, pidB]],
                );
                return Number(waiting.rows[0].count) === 2;
            }, 'both corrections to wait on the organization lock');
            await admin.query('commit');
            const [outcomeA, outcomeB] = await Promise.all(calls);
            const winners = [outcomeA, outcomeB].filter((outcome) => outcome.ok);
            const losers = [outcomeA, outcomeB].filter((outcome) => !outcome.ok);
            const describe = (outcome) => (outcome.ok
                ? `ok:${outcome.result.target_version}`
                : `err:${outcome.error.code} ${outcome.error.message}`);
            assert.equal(winners.length, 1,
                `exactly one concurrent correction may succeed `
                    + `(${[outcomeA, outcomeB].map(describe).join('; ')})`);
            assert.equal(losers.length, 1);
            assert.equal(losers[0].error.code, '40001');
            assert.equal(winners[0].result.target_version, '2');
        } catch (error) {
            await admin.query('rollback').catch(() => {});
            throw error;
        }
        assert.equal(scalar(pg17, `
            select version from app.privacy_requests where id = '${requestId}'`), '4');
        assert.equal(scalar(pg17, `
            select version from app.candidates where id = '${CAND_2}'`), '2',
        'the candidate version must increment exactly once');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_events
            where request_id = '${requestId}'`), '4');
        assert.equal(scalar(pg17, `
            select count(*) from app.privacy_events
            where request_id = '${requestId}' and action = 'privacy.candidate.corrected'`),
        '1');
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events
            where target_id = '${requestId}'`), '4',
        'exactly one audit row per committed operation');
        assert.equal(scalar(pg17, `
            select count(*) from app.audit_events
            where target_id = '${requestId}'
                and action = 'privacy.candidate.corrected'`), '1');
    });

    await t.test('restriction beyond the interactive bound fails without effects', async () => {
        psql(pg17, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, purpose_id, actor_membership_id, origin, channel,
                status, source_version, source_sha256, approval_reference)
            select ('90000000-0000-4000-8000-' || lpad(to_hex(100000 + g), 12, '0'))::uuid,
                '${ORG_A}', '${RECIP_1}', '${CAND_2}', '${DOC_3}', '${PURPOSE_ACTIVE}',
                '${MEMBER_OFFICER_A}', 'planned', 'email', 'intended', 1,
                decode('${HASH.H3}', 'hex'), 'synthetic-approval-ref'
            from generate_series(1, 1000) g`);

        const requestId = randomUUID();
        const subjectId = randomUUID();
        await createPrivacyRequest(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
            requestId,
            kind: 'restriction',
            receivedAt: new Date(Date.now() - 86400_000).toISOString(),
        });
        await reviewCandidateSubject(pool, requestId, 1, subjectId, CAND_2, 2);
        await verifyRequest(pool, requestId, 2);
        await rejectCode(
            restrictPrivacySubject(pool, identity(SUBJECTS.ADMIN1), ORG_A, {
                requestId,
                expectedRequestVersion: '3',
                subjectId,
                expectedTargetVersion: '2',
            }),
            '54000',
            'restriction above 1000 targeted records must fail',
        );
        assert.equal(scalar(pg17, `
            select lifecycle from app.candidates where id = '${CAND_2}'`), 'active');
        assert.equal(scalar(pg17, `
            select count(*) from app.document_disclosures
            where candidate_id = '${CAND_2}' and status = 'intended'`), '1000',
        'the rollback must restore every intended disclosure');
        assert.equal(scalar(pg17, `
            select version from app.privacy_requests where id = '${requestId}'`), '3');
    });

    await t.test('PostgreSQL 16 is rejected before any change', () => {
        const stderr = psqlExpectError(pg16, readMigration(PRIVACY_OPS_MIGRATION));
        assert.match(stderr, /PostgreSQL 17/);
        assert.equal(scalar(pg16, `
            select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app'`), '0');
    });

    await t.test('non-superuser migration operator applies all migrations', () => {
        psql(pgOperator, `
            create role privacy_ops_operator nologin nosuperuser createrole bypassrls;
            grant create on database postgres to privacy_ops_operator with grant option;
        `);
        for (const fileName of [...PREFIX_MIGRATIONS, PRIVACY_OPS_MIGRATION]) {
            psql(
                pgOperator,
                `set session authorization privacy_ops_operator;\n${readMigration(fileName)}`,
            );
        }
        assert.equal(scalar(pgOperator, `
            select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            join pg_roles r on r.oid = p.proowner
            where n.nspname = 'app'
                and p.proname in ('${PRIVACY_FUNCTIONS.join("','")}')
                and p.prosecdef and r.rolname = 'app_executor'`), '5');
        assert.equal(scalar(pgOperator, `
            select count(*) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            join pg_roles r on r.oid = p.proowner
            where n.nspname = 'app'
                and p.proname in ('${PRIVACY_HELPER_FUNCTIONS.join("','")}')
                and not p.prosecdef and r.rolname = 'app_owner'`), '3');
        assert.equal(scalar(pgOperator, `
            select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relkind = 'r'
                and c.relrowsecurity and c.relforcerowsecurity`), '32');
    });
});

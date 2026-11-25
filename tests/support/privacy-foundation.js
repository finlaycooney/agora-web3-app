import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const migrationsDir = join(repoRoot, 'supabase', 'migrations');

export const PRIVACY_MIGRATIONS = [
    '20260922210000_document_foundation.sql',
    '20260922210100_privacy_foundation.sql',
    '20260922210200_privacy_tracking_foundation.sql',
];

export const PRIVACY_TABLES = [
    'file_blobs',
    'blob_locations',
    'documents',
    'application_documents',
    'processing_purposes',
    'privacy_notices',
    'candidate_processing_purposes',
    'privacy_requests',
    'privacy_complaints',
    'legacy_datasets',
    'legacy_records',
    'privacy_request_subjects',
    'privacy_events',
    'disclosure_recipients',
    'document_disclosures',
];

export const PRIVACY_GUARD_FUNCTIONS = [
    'file_blob_identity_guard_v1',
    'blob_location_verify_v1',
    'processing_purpose_guard_v1',
    'privacy_notice_guard_v1',
    'legacy_dataset_guard_v1',
    'legacy_record_guard_v1',
];

export const readPrivacyMigration = (name) => readFileSync(join(migrationsDir, name), 'utf8');

const uid = (n) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const PRIVACY_ID = {
    ORG_A: '9c4edd11-2571-490b-a87c-ef30b9e0a001',
    ROLE_A_ADMIN: '9c4edd11-2571-490b-a87c-ef30b9e0a011',
    PIPELINE_A: '9c4edd11-2571-490b-a87c-ef30b9e0a020',
    STAGE_A_REVIEW: '9c4edd11-2571-490b-a87c-ef30b9e0a021',
    ORG_B: uid(11),
    ROLE_B_ADMIN: uid(20),
    USER_OFFICER: uid(101),
    MEMBER_OFFICER_A: uid(201),
    MEMBER_OFFICER_B: uid(202),
    CLIENT_A1: uid(40),
    CLIENT_A2: uid(41),
    CLIENT_B: uid(42),
    JOB_A: uid(60),
    CAND_1: uid(70),
    CAND_2: uid(71),
    CAND_B: uid(72),
    SOURCE_1: uid(80),
    SOURCE_2: uid(81),
    APP_1: uid(100),
    BLOB_1: uid(110),
    BLOB_2: uid(111),
    BLOB_3: uid(112),
    BLOB_4: uid(113),
    LOC_1: uid(120),
    DOC_1: uid(130),
    DOC_2: uid(131),
    DOC_3: uid(132),
    PURPOSE_ACTIVE: uid(140),
    PURPOSE_DRAFT: uid(141),
    PURPOSE_B: uid(142),
    PURPOSE_ALT: uid(143),
    NOTICE_A: uid(150),
    NOTICE_B: uid(151),
    NOTICE_ALT: uid(152),
    CPP_1: uid(160),
    REQ_ACCESS: uid(170),
    REQ_LEGACY: uid(171),
    REQ_ERASURE: uid(172),
    REQ_RECEIVED: uid(173),
    COMPLAINT_1: uid(180),
    DS_A: uid(190),
    DS_B: uid(191),
    LR_1: uid(200),
    LR_2: uid(201),
    LR_B: uid(202),
    SUBJ_1: uid(210),
    SUBJ_2: uid(211),
    EV_1: uid(220),
    EV_2: uid(221),
    EV_3: uid(222),
    RECIP_1: uid(230),
    RECIP_2: uid(231),
    RECIP_B: uid(232),
    DISC_HIST: uid(240),
    DISC_PLANNED: uid(241),
    DISC_LEGACY: uid(242),
};

export const HASH = {
    H1: 'aa'.repeat(32),
    H2: 'bb'.repeat(32),
    H3: 'cc'.repeat(32),
    H4: 'dd'.repeat(32),
    H5: 'ee'.repeat(32),
    H6: 'ff'.repeat(32),
};

const hex = (value) => `decode('${value}', 'hex')`;

export const privacyFixtureSql = `
insert into app.users (id, display_name, status) values
    ('${PRIVACY_ID.USER_OFFICER}', 'Synthetic Privacy Officer', 'active');
insert into app.organizations (id, key, name, status) values
    ('${PRIVACY_ID.ORG_B}', 'globex-synthetic', 'Globex Synthetic', 'active');
insert into app.roles (id, organization_id, key, name, status, system_kind) values
    ('${PRIVACY_ID.ROLE_B_ADMIN}', '${PRIVACY_ID.ORG_B}', 'admin', 'Admin', 'active', 'admin');
insert into app.organization_memberships
        (id, organization_id, user_id, role_id, status, activated_at) values
    ('${PRIVACY_ID.MEMBER_OFFICER_A}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.USER_OFFICER}',
        '${PRIVACY_ID.ROLE_A_ADMIN}', 'active', now()),
    ('${PRIVACY_ID.MEMBER_OFFICER_B}', '${PRIVACY_ID.ORG_B}', '${PRIVACY_ID.USER_OFFICER}',
        '${PRIVACY_ID.ROLE_B_ADMIN}', 'active', now());
insert into app.clients (id, organization_id, name, status) values
    ('${PRIVACY_ID.CLIENT_A1}', '${PRIVACY_ID.ORG_A}', 'Synthetic Agency One', 'active'),
    ('${PRIVACY_ID.CLIENT_A2}', '${PRIVACY_ID.ORG_A}', 'Synthetic Agency Two', 'active'),
    ('${PRIVACY_ID.CLIENT_B}', '${PRIVACY_ID.ORG_B}', 'Synthetic Client B', 'active');
insert into app.jobs (id, organization_id, client_id, pipeline_id, slug, title, description,
        location_display, employment_type, publication_state, application_state) values
    ('${PRIVACY_ID.JOB_A}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CLIENT_A1}',
        '${PRIVACY_ID.PIPELINE_A}', 'privacy-synthetic-job', 'Synthetic Job', 'Synthetic only',
        'Remote', 'full_time', 'draft', 'open');
insert into app.candidates
        (id, organization_id, full_name, owner_membership_id, identity_state, lifecycle) values
    ('${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.ORG_A}', 'Synthetic Candidate One',
        '${PRIVACY_ID.MEMBER_OFFICER_A}', 'established', 'active'),
    ('${PRIVACY_ID.CAND_2}', '${PRIVACY_ID.ORG_A}', 'Synthetic Candidate Two',
        null, 'established', 'active'),
    ('${PRIVACY_ID.CAND_B}', '${PRIVACY_ID.ORG_B}', 'Synthetic Candidate B',
        '${PRIVACY_ID.MEMBER_OFFICER_B}', 'established', 'active');
insert into app.candidate_sources (id, organization_id, candidate_id, kind, received_at) values
    ('${PRIVACY_ID.SOURCE_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', 'manual', now()),
    ('${PRIVACY_ID.SOURCE_2}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_2}', 'legacy', now());
insert into app.applications (id, organization_id, candidate_id, job_id, pipeline_id, stage_id,
        public_reference, reference_version, source_id, received_at) values
    ('${PRIVACY_ID.APP_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.JOB_A}',
        '${PRIVACY_ID.PIPELINE_A}', '${PRIVACY_ID.STAGE_A_REVIEW}', 'AG-8000AAAABBBB', 1,
        '${PRIVACY_ID.SOURCE_1}', now());
insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes, mime_type,
        extension, lifecycle, scan_state, scan_engine, scan_definitions, scanned_at,
        scan_valid_until) values
    ('${PRIVACY_ID.BLOB_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', ${hex(HASH.H1)},
        1024, 'application/pdf', 'pdf', 'live', 'clean', 'synthetic-engine',
        'synthetic-defs-1', now() - interval '1 hour', now() + interval '1 day'),
    ('${PRIVACY_ID.BLOB_2}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', ${hex(HASH.H2)},
        2048, 'application/pdf', 'pdf', 'live', 'pending', null, null, null, null),
    ('${PRIVACY_ID.BLOB_3}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_2}', ${hex(HASH.H1)},
        1024, 'application/pdf', 'pdf', 'live', 'unscanned', null, null, null, null),
    ('${PRIVACY_ID.BLOB_4}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', ${hex(HASH.H3)},
        3072, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'docx', 'retired', 'unscanned', null, null, null, null);
update app.file_blobs set retired_into_id = '${PRIVACY_ID.BLOB_2}'
    where id = '${PRIVACY_ID.BLOB_4}';
insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket, object_key,
        state, is_primary, verified_sha256, verified_size_bytes, verified_at) values
    ('${PRIVACY_ID.LOC_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.BLOB_1}', 'synthetic-backend',
        'cv-submissions-synthetic', 'blob-1.pdf', 'available', true, ${hex(HASH.H1)}, 1024, now());
insert into app.documents (id, organization_id, candidate_id, blob_id, purpose,
        original_filename, source_id, received_at, supersedes_document_id, lifecycle) values
    ('${PRIVACY_ID.DOC_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.BLOB_1}',
        'cv', 'cv-one.pdf', '${PRIVACY_ID.SOURCE_1}', now() - interval '2 days', null, 'retired'),
    ('${PRIVACY_ID.DOC_2}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.BLOB_2}',
        'cv', 'cv-two.pdf', '${PRIVACY_ID.SOURCE_1}', now(), '${PRIVACY_ID.DOC_1}', 'active'),
    ('${PRIVACY_ID.DOC_3}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_2}', '${PRIVACY_ID.BLOB_3}',
        'cv', 'cv-three.pdf', '${PRIVACY_ID.SOURCE_2}', now(), null, 'active');
update app.candidates set current_document_id = '${PRIVACY_ID.DOC_2}'
    where id = '${PRIVACY_ID.CAND_1}';
insert into app.application_documents
        (organization_id, candidate_id, application_id, document_id, submitted_filename,
        attached_at) values
    ('${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.APP_1}', '${PRIVACY_ID.DOC_1}',
        'cv-one.pdf', now() - interval '2 days'),
    ('${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.APP_1}', '${PRIVACY_ID.DOC_2}',
        'cv-two.pdf', now());
insert into app.processing_purposes (id, organization_id, key, policy_version, description,
        legal_basis, jurisdiction, retention_rule, status, approved_by_membership_id,
        approved_at) values
    ('${PRIVACY_ID.PURPOSE_ACTIVE}', '${PRIVACY_ID.ORG_A}', 'application-processing', 1,
        'Synthetic only purpose', 'Synthetic only basis', 'Synthetic only jurisdiction',
        'Synthetic only rule', 'active', '${PRIVACY_ID.MEMBER_OFFICER_A}', now()),
    ('${PRIVACY_ID.PURPOSE_DRAFT}', '${PRIVACY_ID.ORG_A}', 'talent-pool', 1,
        'Synthetic only purpose', 'Synthetic only basis', 'Synthetic only jurisdiction',
        'Synthetic only rule', 'draft', null, null),
    ('${PRIVACY_ID.PURPOSE_B}', '${PRIVACY_ID.ORG_B}', 'application-processing', 1,
        'Synthetic only purpose', 'Synthetic only basis', 'Synthetic only jurisdiction',
        'Synthetic only rule', 'active', '${PRIVACY_ID.MEMBER_OFFICER_B}', now()),
    ('${PRIVACY_ID.PURPOSE_ALT}', '${PRIVACY_ID.ORG_A}', 'talent-pool-synthetic', 1,
        'Synthetic only alternate purpose', 'Synthetic only basis',
        'Synthetic only jurisdiction', 'Synthetic only rule', 'active',
        '${PRIVACY_ID.MEMBER_OFFICER_A}', now());
insert into app.privacy_notices (id, organization_id, purpose_id, version, locale, content,
        content_sha256, published_at) values
    ('${PRIVACY_ID.NOTICE_A}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.PURPOSE_ACTIVE}', 'v1',
        'en-GB', 'Synthetic only notice content A',
        pg_catalog.sha256(pg_catalog.convert_to('Synthetic only notice content A', 'UTF8')),
        now() - interval '1 day'),
    ('${PRIVACY_ID.NOTICE_B}', '${PRIVACY_ID.ORG_B}', '${PRIVACY_ID.PURPOSE_B}', 'v1',
        'en-GB', 'Synthetic only notice content B',
        pg_catalog.sha256(pg_catalog.convert_to('Synthetic only notice content B', 'UTF8')),
        now() - interval '1 day'),
    ('${PRIVACY_ID.NOTICE_ALT}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.PURPOSE_ALT}', 'v1',
        'en-GB', 'Synthetic only notice content alt',
        pg_catalog.sha256(pg_catalog.convert_to('Synthetic only notice content alt', 'UTF8')),
        now() - interval '1 day');
update app.applications set notice_id = '${PRIVACY_ID.NOTICE_A}'
    where id = '${PRIVACY_ID.APP_1}';
insert into app.candidate_processing_purposes (id, organization_id, candidate_id, purpose_id,
        notice_id, source_id, status, established_at, review_at, evidence_summary) values
    ('${PRIVACY_ID.CPP_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}',
        '${PRIVACY_ID.PURPOSE_ACTIVE}', '${PRIVACY_ID.NOTICE_A}', '${PRIVACY_ID.SOURCE_1}',
        'active', now() - interval '1 day', now() + interval '30 days',
        'Synthetic only evidence');
insert into app.privacy_requests (id, organization_id, candidate_id, kind, status, received_at,
        verified_by_membership_id, verified_at, verification_method, due_at, response_sent_at,
        response_code, resolution_code, resolved_at, ledger_sequence, ledger_confirmed_at) values
    ('${PRIVACY_ID.REQ_ACCESS}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', 'access',
        'in_progress', now() - interval '3 days', '${PRIVACY_ID.MEMBER_OFFICER_A}',
        now() - interval '2 days', 'synthetic-verification', now() + interval '25 days',
        null, null, null, null, null, null),
    ('${PRIVACY_ID.REQ_LEGACY}', '${PRIVACY_ID.ORG_A}', null, 'access', 'verified',
        now() - interval '3 days', '${PRIVACY_ID.MEMBER_OFFICER_A}', now() - interval '2 days',
        'synthetic-verification', null, null, null, null, null, null, null),
    ('${PRIVACY_ID.REQ_ERASURE}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_2}', 'erasure',
        'fulfilled', now() - interval '5 days', '${PRIVACY_ID.MEMBER_OFFICER_A}',
        now() - interval '4 days', 'synthetic-verification', null,
        now() - interval '1 day', 'synthetic-response', 'synthetic-resolved',
        now() - interval '1 day', 1, now() - interval '1 day'),
    ('${PRIVACY_ID.REQ_RECEIVED}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}', 'objection',
        'received', now(), null, null, null, null, null, null, null, null, null, null);
insert into app.privacy_complaints (id, organization_id, candidate_id, related_request_id,
        owner_membership_id, status, received_at, acknowledgment_due_at, acknowledged_at,
        next_update_due_at, summary, outcome_code, resolved_at) values
    ('${PRIVACY_ID.COMPLAINT_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CAND_1}',
        '${PRIVACY_ID.REQ_ACCESS}', '${PRIVACY_ID.MEMBER_OFFICER_A}', 'resolved',
        now() - interval '10 days', now() - interval '9 days', now() - interval '9 days',
        now() - interval '5 days', 'Synthetic only complaint', 'synthetic-outcome',
        now() - interval '5 days');
insert into app.legacy_datasets (id, organization_id, key, connection_key, source_kind, status) values
    ('${PRIVACY_ID.DS_A}', '${PRIVACY_ID.ORG_A}', 'legacy-applicants-synthetic',
        'synthetic-connection-a', 'legacy_applicants', 'active'),
    ('${PRIVACY_ID.DS_B}', '${PRIVACY_ID.ORG_B}', 'legacy-applicants-synthetic-b',
        'synthetic-connection-b', 'legacy_applicants', 'active');
insert into app.legacy_records (id, organization_id, dataset_id, native_id, candidate_id,
        source_sha256, verified_by_membership_id, verified_at) values
    ('${PRIVACY_ID.LR_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.DS_A}', 1,
        '${PRIVACY_ID.CAND_1}', ${hex(HASH.H4)}, '${PRIVACY_ID.MEMBER_OFFICER_A}', now()),
    ('${PRIVACY_ID.LR_2}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.DS_A}', 2, null, null, null, null),
    ('${PRIVACY_ID.LR_B}', '${PRIVACY_ID.ORG_B}', '${PRIVACY_ID.DS_B}', 7, null, null, null, null);
insert into app.privacy_request_subjects (id, organization_id, request_id, candidate_id,
        legacy_record_id, candidate_version, source_sha256, reviewed_by_membership_id,
        reviewed_at) values
    ('${PRIVACY_ID.SUBJ_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.REQ_ACCESS}',
        '${PRIVACY_ID.CAND_1}', null, 1, null, '${PRIVACY_ID.MEMBER_OFFICER_A}', now()),
    ('${PRIVACY_ID.SUBJ_2}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.REQ_LEGACY}', null,
        '${PRIVACY_ID.LR_2}', null, ${hex(HASH.H6)}, '${PRIVACY_ID.MEMBER_OFFICER_A}', now());
insert into app.privacy_events (id, organization_id, request_id, subject_id, candidate_id,
        sequence, action, lifecycle_generation, actor_membership_id, occurred_at,
        evidence_code) values
    ('${PRIVACY_ID.EV_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.REQ_ACCESS}', null, null, 1,
        'request.received', null, '${PRIVACY_ID.MEMBER_OFFICER_A}', now() - interval '3 days',
        'synthetic-evidence'),
    ('${PRIVACY_ID.EV_2}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.REQ_ACCESS}',
        '${PRIVACY_ID.SUBJ_1}', '${PRIVACY_ID.CAND_1}', 2, 'subject.verified', 1,
        '${PRIVACY_ID.MEMBER_OFFICER_A}', now() - interval '2 days', 'synthetic-evidence'),
    ('${PRIVACY_ID.EV_3}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.REQ_LEGACY}',
        '${PRIVACY_ID.SUBJ_2}', null, 1, 'subject.verified', null,
        '${PRIVACY_ID.MEMBER_OFFICER_A}', now() - interval '2 days', 'synthetic-evidence');
insert into app.disclosure_recipients (id, organization_id, client_id, legal_name, relationship,
        country_code, contact_reference, terms_reference, transfer_reference, status) values
    ('${PRIVACY_ID.RECIP_1}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.CLIENT_A1}',
        'Synthetic Agency One Ltd', 'unassessed', 'GB', null, null, null, 'active'),
    ('${PRIVACY_ID.RECIP_2}', '${PRIVACY_ID.ORG_A}', null, 'Synthetic Recipient Two',
        'unassessed', null, null, null, null, 'active'),
    ('${PRIVACY_ID.RECIP_B}', '${PRIVACY_ID.ORG_B}', '${PRIVACY_ID.CLIENT_B}',
        'Synthetic Recipient B', 'unassessed', null, null, null, null, 'active');
insert into app.document_disclosures (id, organization_id, recipient_id, candidate_id,
        document_id, legacy_record_id, application_id, purpose_id, actor_membership_id, origin,
        channel, status, source_version, source_sha256, approval_reference, external_reference,
        sent_at) values
    ('${PRIVACY_ID.DISC_HIST}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.RECIP_1}',
        '${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.DOC_1}', null, '${PRIVACY_ID.APP_1}', null, null,
        'historical', 'email', 'sent', null, null, null, 'synthetic-external-ref',
        now() - interval '30 days'),
    ('${PRIVACY_ID.DISC_PLANNED}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.RECIP_2}',
        '${PRIVACY_ID.CAND_1}', '${PRIVACY_ID.DOC_2}', null, '${PRIVACY_ID.APP_1}',
        '${PRIVACY_ID.PURPOSE_ACTIVE}', '${PRIVACY_ID.MEMBER_OFFICER_A}', 'planned', 'ats',
        'intended', 1, ${hex(HASH.H2)}, 'synthetic-approval-ref', null, null),
    ('${PRIVACY_ID.DISC_LEGACY}', '${PRIVACY_ID.ORG_A}', '${PRIVACY_ID.RECIP_1}', null, null,
        '${PRIVACY_ID.LR_2}', null, '${PRIVACY_ID.PURPOSE_ACTIVE}',
        '${PRIVACY_ID.MEMBER_OFFICER_A}', 'planned', 'email', 'sent', null, ${hex(HASH.H6)},
        'synthetic-approval-ref', null, now() - interval '1 day');
`;

export const AUTH_ROUTINE_SNAPSHOT_SQL = `
    select p.proname || '|' || r.rolname || '|' || p.prosecdef || '|'
        || coalesce(p.proacl::text, 'default') || '|'
        || coalesce(p.proconfig::text, '') || '|' || pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'app' and p.proname in
        ('context_uuid_v1', 'has_permission_v1', 'resolve_staff_principal_v1',
        'change_membership_v1', 'change_role_grants_v1')
    order by p.proname`;

export function assertPrivacyFoundation(runSql, runSqlError, authRoutineSnapshotBefore) {
    assert.equal(
        runSql(`select count(*) from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relkind = 'r'`).trim(),
        '32',
    );
    const tableList = PRIVACY_TABLES.map((t) => `'${t}'`).join(',');
    for (const table of PRIVACY_TABLES) {
        assert.equal(
            runSql(`select count(*) from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                join pg_roles r on r.oid = c.relowner
                where n.nspname = 'app' and c.relname = '${table}' and c.relkind = 'r'
                    and r.rolname = 'app_owner'
                    and c.relrowsecurity and c.relforcerowsecurity`).trim(),
            '1',
            `${table} must be app_owner-owned with forced RLS`,
        );
        assert.equal(
            runSql(`select coalesce(bool_or(acl.grantee <> c.relowner), false)
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                cross join lateral aclexplode(
                    coalesce(c.relacl, acldefault('r'::"char", c.relowner))
                ) acl
                where n.nspname = 'app' and c.relname = '${table}' and c.relkind = 'r'`).trim(),
            'f',
            `${table} must grant no role other than its owner`,
        );
        assert.equal(
            runSql(`select coalesce(bool_or(acl.grantee <> c.relowner), false)
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                join pg_attribute a on a.attrelid = c.oid and a.attnum > 0
                    and not a.attisdropped and a.attacl is not null
                cross join lateral aclexplode(a.attacl) acl
                where n.nspname = 'app' and c.relname = '${table}' and c.relkind = 'r'`).trim(),
            'f',
            `${table} must have no column privileges outside its owner`,
        );
    }
    assert.equal(
        runSql(`select count(*) from pg_policy pol
            join pg_class c on c.oid = pol.polrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relname = any(array[${tableList}])`).trim(),
        '0',
        'new tables must carry no RLS policies yet',
    );
    assert.equal(
        runSql(`select coalesce(bool_or(has_schema_privilege(r.rolname, 'app', 'create')),
                false)
            from (values ('app_staff'), ('app_intake'), ('app_worker'), ('app_executor'),
                ('app_authz_reader')) r(rolname)`).trim(),
        'f',
        'runtime and internal roles must not create in schema app',
    );
    for (const fn of PRIVACY_GUARD_FUNCTIONS) {
        assert.equal(
            runSql(`select count(*) from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
                join pg_roles r on r.oid = p.proowner
                where n.nspname = 'app' and p.proname = '${fn}' and p.pronargs = 0
                    and not p.prosecdef and r.rolname = 'app_owner'
                    and coalesce(p.proconfig::text, '') ~ 'search_path=pg_catalog, app, pg_temp'`).trim(),
            '1',
            `${fn} must be an app_owner SECURITY INVOKER trigger with fixed search_path`,
        );
        assert.match(
            runSqlError(`set role app_staff; select app.${fn}();`),
            /42501/,
            `${fn} must not be executable by runtime roles`,
        );
    }
    assert.equal(
        runSql(`select count(*) from pg_trigger tg
            join pg_class c on c.oid = tg.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and not tg.tgisinternal`).trim(),
        '6',
    );
    assert.match(
        runSqlError(`set role app_staff; select count(*) from app.documents`),
        /42501/,
        'runtime staff must not read new tables',
    );
    assert.match(
        runSqlError(`set role app_intake; insert into app.privacy_requests
            (id, organization_id, kind, status, received_at)
            values ('${'80000000-0000-4000-8000-000000000999'}',
                '${PRIVACY_ID.ORG_A}', 'access', 'received', now())`),
        /42501/,
        'intake must not write new tables',
    );
    assert.match(
        runSqlError(`set role app_worker; update app.file_blobs set lifecycle = 'deleted'`),
        /42501/,
        'worker must not write new tables',
    );
    assert.equal(
        runSql(AUTH_ROUTINE_SNAPSHOT_SQL),
        authRoutineSnapshotBefore,
        'the five authorization routines must be unchanged by the privacy migrations',
    );
}

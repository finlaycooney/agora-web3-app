import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
    POSTGRES_16_IMAGE,
    POSTGRES_17_IMAGE,
    assertLocalTestEnvironment,
    assertSqlstate,
    psql,
    psqlExpectError,
    startPostgresContainer,
    stopAndRemoveContainer,
} from '../support/foundation-docker.js';
import {
    AUTH_ROUTINE_SNAPSHOT_SQL,
    HASH,
    PRIVACY_ID,
    PRIVACY_MIGRATIONS,
    assertPrivacyFoundation,
    privacyFixtureSql,
    readPrivacyMigration,
} from '../support/privacy-foundation.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const migrationsDir = join(repoRoot, 'supabase', 'migrations');

const PREFIX_MIGRATIONS = [
    '20260922090000_foundation_roles.sql',
    '20260922090100_foundation_schema.sql',
    '20260922090200_foundation_seed.sql',
    '20260922130000_staff_authorization_core.sql',
    '20260922131000_staff_google_identities.sql',
];

const readMigration = (name) => readFileSync(join(migrationsDir, name), 'utf8');
const scalar = (container, sql) => psql(container, sql).trim();
const bad = (container, sql, state) => assertSqlstate(container, sql, state);

const {
    ORG_A,
    ORG_B,
    MEMBER_OFFICER_A,
    MEMBER_OFFICER_B,
    CLIENT_B,
    CAND_1,
    CAND_2,
    CAND_B,
    SOURCE_1,
    SOURCE_2,
    APP_1,
    BLOB_1,
    BLOB_2,
    BLOB_3,
    BLOB_4,
    LOC_1,
    DOC_1,
    DOC_2,
    DOC_3,
    PURPOSE_ACTIVE,
    PURPOSE_DRAFT,
    PURPOSE_B,
    NOTICE_A,
    NOTICE_B,
    NOTICE_ALT,
    REQ_ACCESS,
    REQ_LEGACY,
    REQ_RECEIVED,
    DS_A,
    DS_B,
    LR_1,
    LR_2,
    LR_B,
    SUBJ_1,
    SUBJ_2,
    RECIP_1,
    RECIP_B,
} = PRIVACY_ID;

const P = {
    ORG_A: '9c4edd11-2571-490b-a87c-ef30b9e0a001',
    PIPELINE_A: '9c4edd11-2571-490b-a87c-ef30b9e0a020',
    STAGE_A_REVIEW: '9c4edd11-2571-490b-a87c-ef30b9e0a021',
};

const pre = (n) => `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PRE_CLIENT = pre(1);
const PRE_JOB = pre(2);
const PRE_CAND = pre(3);
const PRE_APP = pre(4);

const hex = (value) => `decode('${value}', 'hex')`;
const SHAPE_QUERIES = [
    `select c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'app' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     order by c.relname, a.attnum`,
    `select con.conname, con.contype, pg_get_constraintdef(con.oid)
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'app'
     order by con.conname`,
    `select indexname, indexdef from pg_indexes where schemaname = 'app' order by indexname`,
];

const applyMigrations = (container, files, options = {}) => {
    const timings = {};
    for (const fileName of files) {
        const startedAt = performance.now();
        psql(container, readMigration(fileName), options);
        timings[fileName] = Math.round(performance.now() - startedAt);
    }
    return timings;
};

test('privacy and document foundations on PostgreSQL 17', async (t) => {
    assertLocalTestEnvironment();
    const pg = await startPostgresContainer('pgprivacy', POSTGRES_17_IMAGE);
    t.after(() => stopAndRemoveContainer(pg));
    const pgSecond = await startPostgresContainer('pgprivacyb', POSTGRES_17_IMAGE);
    t.after(() => stopAndRemoveContainer(pgSecond));
    const pg16 = await startPostgresContainer('pgprivacy16', POSTGRES_16_IMAGE);
    t.after(() => stopAndRemoveContainer(pg16));
    const pgOperator = await startPostgresContainer('pgprivacyop', POSTGRES_17_IMAGE);
    t.after(() => stopAndRemoveContainer(pgOperator));

    applyMigrations(pg, PREFIX_MIGRATIONS);

    psql(pg, `
        insert into app.clients (id, organization_id, name, status) values
            ('${PRE_CLIENT}', '${P.ORG_A}', 'Pre Client', 'active');
        insert into app.jobs (id, organization_id, client_id, pipeline_id, slug, title,
                description, location_display, employment_type, publication_state,
                application_state) values
            ('${PRE_JOB}', '${P.ORG_A}', '${PRE_CLIENT}', '${P.PIPELINE_A}',
                'pre-existing-job', 'Pre Job', 'Pre description', 'Remote', 'contract',
                'draft', 'open');
        insert into app.candidates (id, organization_id, full_name, identity_state,
                lifecycle, version) values
            ('${PRE_CAND}', '${P.ORG_A}', 'Pre Candidate', 'established', 'active', 3);
        insert into app.applications (id, organization_id, candidate_id, job_id, pipeline_id,
                stage_id, public_reference, reference_version, received_at, version) values
            ('${PRE_APP}', '${P.ORG_A}', '${PRE_CAND}', '${PRE_JOB}', '${P.PIPELINE_A}',
                '${P.STAGE_A_REVIEW}', 'AG-8100AAAABBBB', 1, now(), 7);
    `);
    const candidateBefore = scalar(pg, `
        select to_jsonb(c)::text from app.candidates c where id = '${PRE_CAND}'`);
    const applicationBefore = scalar(pg, `
        select to_jsonb(a)::text from app.applications a where id = '${PRE_APP}'`);
    const authRoutinesBefore = psql(pg, AUTH_ROUTINE_SNAPSHOT_SQL);

    const timings = applyMigrations(pg, PRIVACY_MIGRATIONS);
    t.diagnostic(`migration timings ms: ${JSON.stringify(timings)}`);

    await t.test('upgrade preserves existing rows and adds null pointers', () => {
        const candidateAfter = JSON.parse(scalar(pg, `
            select to_jsonb(c)::text from app.candidates c where id = '${PRE_CAND}'`));
        const applicationAfter = JSON.parse(scalar(pg, `
            select to_jsonb(a)::text from app.applications a where id = '${PRE_APP}'`));
        assert.equal(candidateAfter.current_document_id, null);
        assert.equal(applicationAfter.notice_id, null);
        delete candidateAfter.current_document_id;
        delete applicationAfter.notice_id;
        assert.deepEqual(candidateAfter, JSON.parse(candidateBefore));
        assert.deepEqual(applicationAfter, JSON.parse(applicationBefore));
    });

    psql(pg, privacyFixtureSql);

    await t.test('fixture provenance loads positive relationships', () => {
        assert.equal(scalar(pg, `select count(*) from app.file_blobs`), '4');
        assert.equal(scalar(pg, `
            select count(*) from app.blob_locations
            where is_primary and state = 'available' and blob_id = '${BLOB_1}'`), '1');
        assert.equal(scalar(pg, `
            select current_document_id from app.candidates where id = '${CAND_1}'`), DOC_2);
        assert.equal(scalar(pg, `
            select count(*) from app.application_documents
            where application_id = '${APP_1}'`), '2');
        assert.equal(scalar(pg, `
            select notice_id from app.applications where id = '${APP_1}'`), NOTICE_A);
        assert.equal(scalar(pg, `
            select content_sha256 = pg_catalog.sha256(
                pg_catalog.convert_to(content, 'UTF8'))
            from app.privacy_notices where id = '${NOTICE_A}'`), 't');
        assert.equal(scalar(pg, `
            select count(*) from app.privacy_requests`), '4');
        assert.equal(scalar(pg, `
            select count(*) from app.privacy_request_subjects`), '2');
        assert.equal(scalar(pg, `
            select count(*) from app.privacy_events`), '3');
        assert.equal(scalar(pg, `
            select count(*) from app.document_disclosures`), '3');
        assert.equal(scalar(pg, `
            select retired_into_id from app.file_blobs where id = '${PRIVACY_ID.BLOB_4}'`),
        BLOB_2);
        assert.equal(scalar(pg, `
            select status from app.processing_purposes where id = '${PURPOSE_ACTIVE}'`),
        'active');
        assert.equal(scalar(pg, `
            select count(*) from app.privacy_requests where id = '${REQ_LEGACY}'
                and candidate_id is null`), '1');
        assert.equal(scalar(pg, `
            select count(*) from app.legacy_records where id = '${LR_2}'
                and candidate_id is null`), '1');
        assert.equal(scalar(pg, `
            select count(*) from app.document_disclosures
            where legacy_record_id = '${LR_2}' and candidate_id is null
                and application_id is null and document_id is null`), '1');
        assert.equal(scalar(pg, `
            select source_sha256 from app.document_disclosures
            where id = '${PRIVACY_ID.DISC_PLANNED}'`), `\\x${HASH.H2}`);
    });

    await t.test('file blob and location constraints enforce', () => {
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H1)}, 10,
                'application/pdf', 'pdf', 'live', 'unscanned')`, '23505');
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H1)}, 10,
                'application/pdf', 'pdf', 'live', 'infected')`, '23505');
        psql(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H1)}, 10,
                'application/pdf', 'pdf', 'unavailable', 'unscanned')`);
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', decode('abcd', 'hex'), 10,
                'application/pdf', 'pdf', 'live', 'unscanned')`, '23514');
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H6)}, 4194305,
                'application/pdf', 'pdf', 'live', 'unscanned')`, '23514');
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H6)}, 10,
                'application/pdf', 'docx', 'live', 'unscanned')`, '23514');
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state, scanned_at,
                scan_valid_until) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H6)}, 10,
                'application/pdf', 'pdf', 'live', 'clean', now(), now() + interval '1 day')`,
        '23514');
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state, scan_engine, scan_definitions,
                scanned_at, scan_valid_until) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H6)}, 10,
                'application/pdf', 'pdf', 'live', 'clean', 'engine', 'defs',
                now(), now() - interval '1 day')`, '23514');
        bad(pg, `
            update app.file_blobs set retired_into_id = id where id = '${BLOB_1}'`, '23514');
        bad(pg, `
            update app.file_blobs set retired_into_id = '${BLOB_3}' where id = '${BLOB_2}'`,
        '23503');
        bad(pg, `
            update app.file_blobs set sha256 = ${hex(HASH.H6)} where id = '${BLOB_1}'`,
        '23514');
        bad(pg, `
            update app.file_blobs set mime_type = 'text/plain' where id = '${BLOB_1}'`,
        '23514');
        bad(pg, `
            insert into app.file_blobs (id, organization_id, candidate_id, sha256, size_bytes,
                mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_B}', ${hex(HASH.H6)}, 10,
                'application/pdf', 'pdf', 'live', 'unscanned')`, '23503');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, verified_sha256, verified_size_bytes, verified_at) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_1}', 'b2', 'bucket', 'key2', 'available',
                ${hex(HASH.H2)}, 1024, now())`, '23514');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, verified_sha256, verified_size_bytes, verified_at) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_1}', 'b3', 'bucket', 'key3', 'available',
                ${hex(HASH.H1)}, 9999, now())`, '23514');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, verified_sha256, verified_size_bytes, verified_at) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_1}', 'b4', 'bucket', 'key4', 'available',
                ${hex(HASH.H1)}, 1024, null)`, '23514');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state) values
            ('${randomUUID()}', '${ORG_B}', '${BLOB_1}', 'b5', 'bucket', 'key5', 'pending')`,
        '23503');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_2}', 'synthetic-backend',
                'cv-submissions-synthetic', 'blob-1.pdf', 'pending')`, '23505');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, is_primary) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_1}', 'b6', 'bucket', 'key6', 'pending',
                true)`, '23505');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, is_primary, deleted_at) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_2}', 'b7', 'bucket', 'key7', 'deleted',
                true, now())`, '23514');
        bad(pg, `
            update app.blob_locations set state = 'deleted', deleted_at = now()
            where id = '${LOC_1}'`, '23514');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, deleted_at) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_2}', 'b8', 'bucket', 'key8', 'pending',
                now())`, '23514');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, verified_sha256) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_2}', 'b9', 'bucket', 'key9', 'pending',
                decode('abcd', 'hex'))`, '23514');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, verified_size_bytes) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_2}', 'b10', 'bucket', 'key10', 'missing',
                0)`, '23514');
        bad(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, verified_size_bytes) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_2}', 'b11', 'bucket', 'key11', 'pending',
                4194305)`, '23514');
        psql(pg, `
            insert into app.blob_locations (id, organization_id, blob_id, backend_key, bucket,
                object_key, state, verified_sha256, verified_size_bytes) values
            ('${randomUUID()}', '${ORG_A}', '${BLOB_2}', 'b12', 'bucket', 'key12', 'pending',
                ${hex(HASH.H6)}, 10)`);
        bad(pg, `
            update app.file_blobs set scan_generation = 0 where id = '${BLOB_1}'`, '23514');
        bad(pg, `
            update app.file_blobs set lifecycle_generation = -1 where id = '${BLOB_1}'`,
        '23514');
        bad(pg, `
            update app.file_blobs set version = 0 where id = '${BLOB_1}'`, '23514');
        psql(pg, `
            begin;
            update app.file_blobs set lifecycle = 'retired' where id = '${BLOB_1}';
            insert into app.file_blobs (id, organization_id, candidate_id, sha256,
                size_bytes, mime_type, extension, lifecycle, scan_state) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', ${hex(HASH.H1)}, 10,
                'application/pdf', 'pdf', 'live', 'unscanned');
            rollback;`);
        assert.equal(scalar(pg, `
            select lifecycle from app.file_blobs where id = '${BLOB_1}'`), 'live');
        assert.equal(scalar(pg, `
            select count(*) from app.file_blobs
            where candidate_id = '${CAND_1}' and lifecycle = 'live'`), '2');
    });

    await t.test('documents, current document and attachment constraints enforce', () => {
        bad(pg, `
            insert into app.documents (id, organization_id, candidate_id, blob_id, purpose,
                original_filename, received_at, lifecycle) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', '${BLOB_3}', 'cv', 'x.pdf', now(),
                'active')`, '23503');
        bad(pg, `
            insert into app.documents (id, organization_id, candidate_id, blob_id, purpose,
                original_filename, source_id, received_at, lifecycle) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', '${BLOB_2}', 'cv', 'x.pdf',
                '${SOURCE_2}', now(), 'active')`, '23503');
        bad(pg, `
            insert into app.documents (id, organization_id, candidate_id, blob_id, purpose,
                received_at, lifecycle) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', '${BLOB_2}', 'cv', now(), 'active')`,
        '23502');
        bad(pg, `
            update app.documents set supersedes_document_id = id where id = '${DOC_1}'`,
        '23514');
        bad(pg, `
            update app.documents set supersedes_document_id = '${DOC_3}' where id = '${DOC_2}'`,
        '23503');
        bad(pg, `
            update app.documents set original_filename = null where id = '${DOC_1}'`, '23502');
        bad(pg, `
            update app.candidates set current_document_id = '${DOC_3}'
            where id = '${CAND_1}'`, '23503');
        bad(pg, `
            update app.candidates set current_document_id = '${DOC_1}'
            where id = '${CAND_2}'`, '23503');
        bad(pg, `
            insert into app.documents (id, organization_id, candidate_id, blob_id, purpose,
                original_filename, received_at, lifecycle) values
            ('${randomUUID()}', '${ORG_B}', '${CAND_B}', '${BLOB_1}', 'cv', 'x.pdf', now(),
                'active')`, '23503');
        bad(pg, `
            insert into app.application_documents (organization_id, candidate_id,
                application_id, document_id, submitted_filename, attached_at) values
            ('${ORG_A}', '${CAND_1}', '${APP_1}', '${DOC_3}', 'x.pdf', now())`, '23503');
        bad(pg, `
            insert into app.application_documents (organization_id, candidate_id,
                application_id, document_id, submitted_filename, attached_at) values
            ('${ORG_A}', '${CAND_2}', '${APP_1}', '${DOC_3}', 'x.pdf', now())`, '23503');
        bad(pg, `
            insert into app.application_documents (organization_id, candidate_id,
                application_id, document_id, submitted_filename, attached_at) values
            ('${ORG_B}', '${CAND_1}', '${APP_1}', '${DOC_2}', 'x.pdf', now())`, '23503');
        bad(pg, `
            insert into app.application_documents (organization_id, candidate_id,
                application_id, document_id, submitted_filename, attached_at) values
            ('${ORG_A}', '${CAND_1}', '${APP_1}', '${DOC_2}', 'x.pdf', now())`, '23505');
        bad(pg, `
            insert into app.application_documents (organization_id, candidate_id,
                application_id, document_id, attached_at) values
            ('${ORG_A}', '${CAND_1}', '${APP_1}', '${DOC_3}', now())`, '23502');
        const deferredDoc = randomUUID();
        psql(pg, `
            begin;
            set constraints all deferred;
            update app.candidates set current_document_id = '${deferredDoc}'
            where id = '${CAND_2}';
            insert into app.documents (id, organization_id, candidate_id, blob_id, purpose,
                original_filename, received_at, lifecycle) values
            ('${deferredDoc}', '${ORG_A}', '${CAND_2}', '${BLOB_3}', 'cv', 'deferred.pdf',
                now(), 'active');
            commit;`);
        psql(pg, `
            update app.candidates set current_document_id = null where id = '${CAND_2}';
            delete from app.documents where id = '${deferredDoc}'`);
        assert.match(
            psqlExpectError(pg, `
                begin;
                set constraints all deferred;
                update app.candidates set current_document_id = '${randomUUID()}'
                where id = '${CAND_2}';
                commit;`),
            /23503/,
        );
    });

    await t.test('purposes and notices constraints enforce', () => {
        bad(pg, `
            insert into app.privacy_notices (id, organization_id, purpose_id, version, locale,
                content, content_sha256, published_at) values
            ('${randomUUID()}', '${ORG_A}', '${PURPOSE_DRAFT}', 'v1', 'en-GB', 'x',
                pg_catalog.sha256(pg_catalog.convert_to('x', 'UTF8')), now())`, '23514');
        bad(pg, `
            insert into app.privacy_notices (id, organization_id, purpose_id, version, locale,
                content, content_sha256, published_at) values
            ('${randomUUID()}', '${ORG_A}', '${PURPOSE_ACTIVE}', 'v2', 'en-GB', 'x',
                pg_catalog.sha256(pg_catalog.convert_to('y', 'UTF8')), now())`, '23514');
        bad(pg, `
            insert into app.privacy_notices (id, organization_id, purpose_id, version, locale,
                content, content_sha256, published_at, retired_at) values
            ('${randomUUID()}', '${ORG_A}', '${PURPOSE_ACTIVE}', 'v3', 'en-GB', 'x',
                pg_catalog.sha256(pg_catalog.convert_to('x', 'UTF8')), null, now())`, '23514');
        bad(pg, `
            insert into app.privacy_notices (id, organization_id, purpose_id, version, locale,
                content, content_sha256, published_at, retired_at) values
            ('${randomUUID()}', '${ORG_A}', '${PURPOSE_ACTIVE}', 'v4', 'en-GB', 'x',
                pg_catalog.sha256(pg_catalog.convert_to('x', 'UTF8')), now(),
                now() - interval '2 days')`, '23514');
        psql(pg, `
            insert into app.privacy_notices (id, organization_id, purpose_id, version, locale,
                content, content_sha256) values
            ('${randomUUID()}', '${ORG_A}', '${PURPOSE_ACTIVE}', 'draft-copy', 'en-GB', 'x',
                pg_catalog.sha256(pg_catalog.convert_to('x', 'UTF8')))`);
        bad(pg, `
            update app.privacy_notices set content = 'changed'
            where id = '${NOTICE_A}'`, '23514');
        bad(pg, `
            update app.privacy_notices set purpose_id = '${PURPOSE_DRAFT}'
            where id = '${NOTICE_A}'`, '23514');
        psql(pg, `
            update app.privacy_notices set retired_at = now() where id = '${NOTICE_A}'`);
        bad(pg, `
            update app.privacy_notices set retired_at = null where id = '${NOTICE_A}'`,
        '23514');
        bad(pg, `
            update app.processing_purposes set description = 'changed'
            where id = '${PURPOSE_ACTIVE}'`, '23514');
        bad(pg, `
            update app.processing_purposes set legal_basis = 'changed'
            where id = '${PURPOSE_ACTIVE}'`, '23514');
        psql(pg, `
            update app.processing_purposes set status = 'retired'
            where id = '${PURPOSE_DRAFT}'`);
        bad(pg, `
            update app.processing_purposes set status = 'active'
            where id = '${PURPOSE_DRAFT}'`, '23514');
        bad(pg, `
            insert into app.privacy_notices (id, organization_id, purpose_id, version, locale,
                content, content_sha256, published_at) values
            ('${randomUUID()}', '${ORG_A}', '${PURPOSE_DRAFT}', 'v5', 'en-GB', 'x',
                pg_catalog.sha256(pg_catalog.convert_to('x', 'UTF8')), now())`, '23514');
        bad(pg, `
            insert into app.processing_purposes (id, organization_id, key, policy_version,
                description, legal_basis, jurisdiction, retention_rule, status) values
            ('${randomUUID()}', '${ORG_A}', 'x', 1, 'd', 'b', 'j', 'r', 'active')`, '23514');
        bad(pg, `
            insert into app.processing_purposes (id, organization_id, key, policy_version,
                description, legal_basis, jurisdiction, retention_rule, status,
                approved_by_membership_id) values
            ('${randomUUID()}', '${ORG_A}', 'x2', 1, 'd', 'b', 'j', 'r', 'draft',
                '${MEMBER_OFFICER_A}')`, '23514');
        bad(pg, `
            insert into app.processing_purposes (id, organization_id, key, policy_version,
                description, legal_basis, jurisdiction, retention_rule, status,
                approved_by_membership_id, approved_at) values
            ('${randomUUID()}', '${ORG_A}', 'x3', 1, 'd', 'b', 'j', 'r', 'active',
                '${MEMBER_OFFICER_B}', now())`, '23503');
        bad(pg, `
            insert into app.privacy_notices (id, organization_id, purpose_id, version, locale,
                content, content_sha256) values
            ('${randomUUID()}', '${ORG_A}', '${PURPOSE_B}', 'v1', 'en-GB', 'x',
                pg_catalog.sha256(pg_catalog.convert_to('x', 'UTF8')))`, '23503');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, notice_id, status, established_at, review_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_2}', '${PURPOSE_ACTIVE}', '${NOTICE_B}',
                'active', now(), now())`, '23503');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, notice_id, status, established_at, review_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_2}', '${PURPOSE_ACTIVE}', '${NOTICE_ALT}',
                'active', now(), now())`, '23503');
        bad(pg, `
            update app.applications set notice_id = '${NOTICE_B}'
            where id = '${APP_1}'`, '23503');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, source_id, status, established_at, review_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_2}', '${PURPOSE_ACTIVE}', '${SOURCE_1}',
                'active', now(), now())`, '23503');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, status, established_at, review_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', '${PURPOSE_ACTIVE}', 'active',
                now(), now() - interval '1 day')`, '23514');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, status, established_at, review_at, expires_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', '${PURPOSE_ACTIVE}', 'active',
                now(), now(), now() - interval '1 day')`, '23514');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, status, established_at, review_at, evidence_summary) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', '${PURPOSE_ACTIVE}', 'active',
                now(), now(), repeat('x', 2049))`, '23514');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, status, established_at, review_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', '${PURPOSE_ACTIVE}', 'active',
                now(), now())`, '23505');
        bad(pg, `
            insert into app.candidate_processing_purposes (id, organization_id, candidate_id,
                purpose_id, status, established_at, review_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_B}', '${PURPOSE_ACTIVE}', 'active',
                now(), now())`, '23503');
    });

    await t.test('privacy requests and complaints constraints enforce', () => {
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'verified', now())`,
        '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, verified_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'verified', now(), now())`,
        '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, verified_by_membership_id) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'received', now(),
                '${MEMBER_OFFICER_A}')`, '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, verified_by_membership_id, verified_at, verification_method,
                resolution_code) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'fulfilled', now(),
                '${MEMBER_OFFICER_A}', now(), 'm', 'done')`, '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, verified_by_membership_id, verified_at, verification_method,
                resolution_code, resolved_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'restriction', 'fulfilled', now(),
                '${MEMBER_OFFICER_A}', now(), 'm', 'done', now())`, '23514');
        psql(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, verified_by_membership_id, verified_at, verification_method,
                resolution_code, resolved_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'fulfilled', now(),
                '${MEMBER_OFFICER_A}', now(), 'm', 'done', now())`);
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, kind, status, received_at,
                verified_by_membership_id, verified_at, verification_method, resolution_code,
                resolved_at) values
            ('${randomUUID()}', '${ORG_A}', 'erasure', 'fulfilled', now(),
                '${MEMBER_OFFICER_A}', now(), 'm', 'done', now())`, '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, response_sent_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'received', now(), now())`,
        '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, due_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'received', now(),
                now() - interval '1 day')`, '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, verified_by_membership_id, verified_at, verification_method,
                resolution_code, resolved_at, ledger_sequence) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'fulfilled', now(),
                '${MEMBER_OFFICER_A}', now(), 'm', 'done', now(), 0)`, '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, ledger_confirmed_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'received', now(), now())`,
        '23514');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, ledger_sequence, ledger_confirmed_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_1}', 'access', 'received', now(), 1,
                now())`, '23505');
        const pendingLedger = randomUUID();
        psql(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at, verified_by_membership_id, verified_at, verification_method,
                ledger_sequence) values
            ('${pendingLedger}', '${ORG_A}', '${CAND_1}', 'restriction', 'in_progress', now(),
                '${MEMBER_OFFICER_A}', now(), 'm', 42)`);
        bad(pg, `
            update app.privacy_requests set status = 'fulfilled', resolved_at = now(),
                resolution_code = 'done' where id = '${pendingLedger}'`, '23514');
        psql(pg, `
            update app.privacy_requests set status = 'fulfilled', resolved_at = now(),
                resolution_code = 'done', ledger_confirmed_at = now()
            where id = '${pendingLedger}'`);
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, candidate_id, kind, status,
                received_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_B}', 'access', 'received', now())`,
        '23503');
        bad(pg, `
            insert into app.privacy_requests (id, organization_id, kind, status, received_at,
                verified_by_membership_id, verified_at, verification_method) values
            ('${randomUUID()}', '${ORG_A}', 'access', 'verified', now(),
                '${MEMBER_OFFICER_B}', now(), 'm')`, '23503');
        bad(pg, `
            insert into app.privacy_complaints (id, organization_id, status, received_at,
                resolved_at) values
            ('${randomUUID()}', '${ORG_A}', 'resolved', now(), now())`, '23514');
        bad(pg, `
            insert into app.privacy_complaints (id, organization_id, status, received_at,
                outcome_code) values
            ('${randomUUID()}', '${ORG_A}', 'resolved', now(), 'done')`, '23514');
        bad(pg, `
            insert into app.privacy_complaints (id, organization_id, status, received_at,
                acknowledgment_due_at) values
            ('${randomUUID()}', '${ORG_A}', 'received', now(), now() - interval '1 day')`,
        '23514');
        bad(pg, `
            insert into app.privacy_complaints (id, organization_id, related_request_id,
                status, received_at) values
            ('${randomUUID()}', '${ORG_B}', '${REQ_ACCESS}', 'received', now())`, '23503');
        bad(pg, `
            insert into app.privacy_complaints (id, organization_id, owner_membership_id,
                status, received_at) values
            ('${randomUUID()}', '${ORG_A}', '${MEMBER_OFFICER_B}', 'received', now())`,
        '23503');
        bad(pg, `
            insert into app.privacy_complaints (id, organization_id, candidate_id, status,
                received_at) values
            ('${randomUUID()}', '${ORG_A}', '${CAND_B}', 'received', now())`, '23503');
    });

    await t.test('legacy datasets and records constraints enforce', () => {
        bad(pg, `
            insert into app.legacy_datasets (id, organization_id, key, connection_key,
                source_kind, status) values
            ('${randomUUID()}', '${ORG_B}', 'legacy-applicants-synthetic', 'other-conn',
                'legacy_applicants', 'active')`, '23505');
        bad(pg, `
            insert into app.legacy_datasets (id, organization_id, key, connection_key,
                source_kind, status) values
            ('${randomUUID()}', '${ORG_B}', 'other-key', 'synthetic-connection-a',
                'legacy_applicants', 'active')`, '23505');
        bad(pg, `
            update app.legacy_datasets set key = 'changed' where id = '${DS_A}'`, '23514');
        bad(pg, `
            update app.legacy_datasets set connection_key = 'changed' where id = '${DS_A}'`,
        '23514');
        psql(pg, `
            update app.legacy_datasets set status = 'inactive', version = version + 1
            where id = '${DS_B}';
            update app.legacy_datasets set status = 'active', version = version + 1
            where id = '${DS_B}'`);
        bad(pg, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id) values
            ('${randomUUID()}', '${ORG_A}', '${DS_B}', 3)`, '23503');
        bad(pg, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id) values
            ('${randomUUID()}', '${ORG_A}', '${DS_A}', 1)`, '23505');
        bad(pg, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id,
                candidate_id) values
            ('${randomUUID()}', '${ORG_A}', '${DS_A}', 4, '${CAND_B}')`, '23503');
        bad(pg, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id,
                verified_by_membership_id) values
            ('${randomUUID()}', '${ORG_A}', '${DS_A}', 5, '${MEMBER_OFFICER_A}')`, '23514');
        bad(pg, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id,
                verified_at, source_sha256) values
            ('${randomUUID()}', '${ORG_A}', '${DS_A}', 6, now(), ${hex(HASH.H6)})`, '23514');
        bad(pg, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id,
                verified_by_membership_id, verified_at) values
            ('${randomUUID()}', '${ORG_A}', '${DS_A}', 7, '${MEMBER_OFFICER_A}', now())`,
        '23514');
        bad(pg, `
            update app.legacy_records set native_id = 99 where id = '${LR_1}'`, '23514');
        bad(pg, `
            update app.legacy_records set dataset_id = '${DS_B}' where id = '${LR_1}'`,
        '23514');
        psql(pg, `
            insert into app.legacy_records (id, organization_id, dataset_id, native_id) values
            ('${randomUUID()}', '${ORG_A}', '${DS_A}', -5)`);
    });

    await t.test('request subjects and events constraints enforce', () => {
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                candidate_id, legacy_record_id, candidate_version, reviewed_by_membership_id,
                reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${CAND_1}', '${LR_2}', 1,
                '${MEMBER_OFFICER_A}', now())`, '23514');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${MEMBER_OFFICER_A}', now())`,
        '23514');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                candidate_id, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${CAND_1}',
                '${MEMBER_OFFICER_A}', now())`, '23514');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                legacy_record_id, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${LR_2}',
                '${MEMBER_OFFICER_A}', now())`, '23514');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                legacy_record_id, candidate_version, source_sha256,
                reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${LR_2}', 1, ${hex(HASH.H6)},
                '${MEMBER_OFFICER_A}', now())`, '23514');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                candidate_id, candidate_version, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_B}', '${REQ_RECEIVED}', '${CAND_B}', 1,
                '${MEMBER_OFFICER_B}', now())`, '23503');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                candidate_id, candidate_version, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', '${CAND_1}', 2,
                '${MEMBER_OFFICER_A}', now())`, '23505');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                legacy_record_id, source_sha256, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_LEGACY}', '${LR_2}', ${hex(HASH.H4)},
                '${MEMBER_OFFICER_A}', now())`, '23505');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                candidate_id, candidate_version, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${CAND_B}', 1,
                '${MEMBER_OFFICER_A}', now())`, '23503');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                legacy_record_id, source_sha256, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${LR_B}', ${hex(HASH.H5)},
                '${MEMBER_OFFICER_A}', now())`, '23503');
        bad(pg, `
            insert into app.privacy_request_subjects (id, organization_id, request_id,
                candidate_id, candidate_version, reviewed_by_membership_id, reviewed_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_RECEIVED}', '${CAND_1}', 1,
                '${MEMBER_OFFICER_B}', now())`, '23503');
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, candidate_id,
                sequence, action, occurred_at, evidence_code) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', '${CAND_1}', 5, 'x', now(), 'e')`,
        '23514');
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, sequence, action,
                occurred_at) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', 9, 'x', now())`, '23502');
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, subject_id,
                sequence, action, occurred_at, evidence_code) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_LEGACY}', '${SUBJ_1}', 5, 'x', now(),
                'e')`, '23503');
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, subject_id,
                candidate_id, sequence, action, occurred_at, evidence_code) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', '${SUBJ_1}', '${CAND_2}', 5,
                'x', now(), 'e')`, '23503');
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, subject_id,
                candidate_id, sequence, action, occurred_at, evidence_code) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', '${SUBJ_2}', '${CAND_1}', 5,
                'x', now(), 'e')`, '23503');
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, sequence, action,
                occurred_at, evidence_code) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', 1, 'x', now(), 'e')`, '23505');
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, sequence, action,
                occurred_at, evidence_code) values
            ('${randomUUID()}', '${ORG_B}', '${REQ_ACCESS}', 8, 'x', now(), 'e')`, '23503');
        psql(pg, `
            insert into app.privacy_events (id, organization_id, request_id, subject_id,
                sequence, action, occurred_at, evidence_code) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_LEGACY}', '${SUBJ_2}', 4, 'x', now(),
                'e')`);
        bad(pg, `
            insert into app.privacy_events (id, organization_id, request_id, sequence, action,
                occurred_at, actor_membership_id, evidence_code) values
            ('${randomUUID()}', '${ORG_A}', '${REQ_ACCESS}', 6, 'x', now(),
                '${MEMBER_OFFICER_B}', 'e')`, '23503');
    });

    await t.test('disclosure constraints enforce', () => {
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, legacy_record_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}', '${LR_2}',
                'historical', 'email', 'unknown')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id, origin,
                channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', 'historical', 'email', 'unknown')`,
        '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                document_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${DOC_1}', 'historical', 'email',
                'unknown')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                legacy_record_id, application_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${LR_2}', '${APP_1}', 'historical',
                'email', 'unknown')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                legacy_record_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${LR_B}', 'historical', 'email',
                'unknown')`, '23503');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                legacy_record_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_B}', '${LR_2}', 'historical', 'email',
                'unknown')`, '23503');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, purpose_id, origin, channel, status,
                source_version, source_sha256, approval_reference) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                '${PURPOSE_ACTIVE}', 'planned', 'email', 'intended', 1, ${hex(HASH.H5)},
                'ref')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, actor_membership_id, origin, channel, status,
                source_version, source_sha256, approval_reference) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                '${MEMBER_OFFICER_A}', 'planned', 'email', 'intended', 1, ${hex(HASH.H5)},
                'ref')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, purpose_id, actor_membership_id, origin, channel,
                status, source_version, source_sha256, approval_reference) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                '${PURPOSE_ACTIVE}', '${MEMBER_OFFICER_A}', 'planned', 'email', 'intended',
                1, ${hex(HASH.H5)}, '  ')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, purpose_id, actor_membership_id, origin, channel,
                status, source_version, approval_reference) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                '${PURPOSE_ACTIVE}', '${MEMBER_OFFICER_A}', 'planned', 'email', 'intended',
                1, 'ref')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, purpose_id, actor_membership_id, origin, channel,
                status, source_sha256, approval_reference) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                '${PURPOSE_ACTIVE}', '${MEMBER_OFFICER_A}', 'planned', 'email', 'intended',
                ${hex(HASH.H5)}, 'ref')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                'historical', 'email', 'sent')`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, origin, channel, status, sent_at) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                'historical', 'email', 'failed', now())`, '23514');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_3}',
                'historical', 'email', 'unknown')`, '23503');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, application_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_2}', '${DOC_3}',
                '${APP_1}', 'historical', 'email', 'unknown')`, '23503');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_B}', '${RECIP_1}', '${CAND_B}', '${DOC_3}',
                'historical', 'email', 'unknown')`, '23503');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, purpose_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                '${PURPOSE_B}', 'historical', 'email', 'unknown')`, '23503');
        bad(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, actor_membership_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                '${MEMBER_OFFICER_B}', 'historical', 'email', 'unknown')`, '23503');
        bad(pg, `
            insert into app.disclosure_recipients (id, organization_id, client_id, legal_name,
                relationship, status) values
            ('${randomUUID()}', '${ORG_A}', '${CLIENT_B}', 'X', 'unassessed', 'active')`,
        '23503');
        psql(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, origin, channel, status, sent_at) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                'historical', 'email', 'sent', now() - interval '60 days'),
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                'historical', 'email', 'sent', now() - interval '59 days')`);
        psql(pg, `
            insert into app.document_disclosures (id, organization_id, recipient_id,
                candidate_id, document_id, origin, channel, status) values
            ('${randomUUID()}', '${ORG_A}', '${RECIP_1}', '${CAND_1}', '${DOC_1}',
                'historical', 'chat', 'unknown')`);
    });

    await t.test('deferrable checks allow in-transaction repair and reject broken commits', () => {
        psql(pg, `
            begin;
            set constraints all deferred;
            update app.file_blobs set candidate_id = '${CAND_2}' where id = '${BLOB_4}';
            update app.file_blobs set retired_into_id = '${BLOB_3}' where id = '${BLOB_4}';
            commit;`);
        psql(pg, `
            begin;
            set constraints all deferred;
            update app.file_blobs set candidate_id = '${CAND_1}' where id = '${BLOB_4}';
            update app.file_blobs set retired_into_id = '${BLOB_2}' where id = '${BLOB_4}';
            commit;`);
        assert.equal(scalar(pg, `
            select retired_into_id from app.file_blobs where id = '${BLOB_4}'`), BLOB_2);
        bad(pg, `
            update app.file_blobs set candidate_id = '${CAND_2}' where id = '${BLOB_4}'`,
        '23503');
        assert.match(
            psqlExpectError(pg, `
                begin;
                set constraints all deferred;
                update app.file_blobs set candidate_id = '${CAND_2}' where id = '${BLOB_4}';
                commit;`),
            /23503/,
        );
    });

    await t.test('catalog shape and runtime denial', () => {
        assertPrivacyFoundation(
            (sql) => psql(pg, sql),
            (sql) => psqlExpectError(pg, sql),
            authRoutinesBefore,
        );
        for (const role of ['app_executor', 'app_authz_reader']) {
            for (const statement of [
                `select count(*) from app.documents`,
                `insert into app.privacy_requests (id, organization_id, kind, status,
                    received_at) values ('${randomUUID()}', '${ORG_A}', 'access',
                    'received', now())`,
                `update app.file_blobs set version = version + 1`,
                `delete from app.legacy_datasets`,
            ]) {
                assert.match(
                    psqlExpectError(pg, `set role ${role}; ${statement}`),
                    /42501/,
                    `${role} must be denied on new tables`,
                );
            }
        }
        assert.equal(scalar(pg, `
            select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname in
                ('context_uuid_v1', 'has_permission_v1', 'resolve_staff_principal_v1',
                'change_membership_v1', 'change_role_grants_v1')`), '5');
    });

    await t.test('identical migrations produce identical schema on a clean instance', () => {
        applyMigrations(pgSecond, [...PREFIX_MIGRATIONS, ...PRIVACY_MIGRATIONS]);
        for (const query of SHAPE_QUERIES) {
            assert.equal(psql(pgSecond, query), psql(pg, query));
        }
    });

    await t.test('shared catalog assertions reject stray grants', () => {
        const authSnapshot = psql(pgSecond, AUTH_ROUTINE_SNAPSHOT_SQL);
        const runAssert = () => assertPrivacyFoundation(
            (sql) => psql(pgSecond, sql),
            (sql) => psqlExpectError(pgSecond, sql),
            authSnapshot,
        );
        psql(pgSecond, 'grant select on app.documents to public');
        try {
            assert.throws(runAssert, /documents must grant no role other than its owner/);
        } finally {
            psql(pgSecond, 'revoke select on app.documents from public');
        }
        psql(pgSecond, 'grant select (original_filename) on app.documents to public');
        try {
            assert.throws(
                runAssert,
                /documents must have no column privileges outside its owner/,
            );
        } finally {
            psql(pgSecond, 'revoke select (original_filename) on app.documents from public');
        }
        runAssert();
    });

    await t.test('PostgreSQL 16 is rejected before any change', () => {
        const stderr = psqlExpectError(pg16, readPrivacyMigration(PRIVACY_MIGRATIONS[0]));
        assert.match(stderr, /PostgreSQL 17/);
        assert.equal(scalar(pg16, `
            select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app'`), '0');
    });

    await t.test('non-superuser migration operator applies all migrations', () => {
        psql(pgOperator, `
            create role privacy_operator nologin nosuperuser createrole bypassrls;
            grant create on database postgres to privacy_operator with grant option;
        `);
        for (const fileName of PREFIX_MIGRATIONS) {
            psql(
                pgOperator,
                `set session authorization privacy_operator;\n${readMigration(fileName)}`,
            );
        }
        const operatorAuthBefore = psql(pgOperator, AUTH_ROUTINE_SNAPSHOT_SQL);
        for (const fileName of PRIVACY_MIGRATIONS) {
            psql(
                pgOperator,
                `set session authorization privacy_operator;\n${readMigration(fileName)}`,
            );
        }
        assert.equal(scalar(pgOperator, `
            select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relkind = 'r'`), '32');
        assert.equal(scalar(pgOperator, `
            select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relkind = 'r'
                and (not c.relrowsecurity or not c.relforcerowsecurity)`), '0');
        assert.equal(scalar(pgOperator, `
            select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relkind = 'r'
                and c.relowner <> 'app_owner'::regrole`), '0');
        assert.equal(scalar(pgOperator, `
            select pg_has_role('privacy_operator', 'app_owner', 'member')`), 't');
        assertPrivacyFoundation(
            (sql) => psql(pgOperator, sql),
            (sql) => psqlExpectError(pgOperator, sql),
            operatorAuthBefore,
        );
    });
});

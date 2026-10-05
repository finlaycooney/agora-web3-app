import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import {
    POSTGRES_17_IMAGE,
    assertLocalTestEnvironment,
    psql,
    startPostgresContainer,
    stopAndRemoveContainer,
} from '../support/foundation-docker.js';
import {
    AUTHZ_ID,
    AUTHZ_MIGRATION,
    GOOGLE_ISSUER,
    GOOGLE_MIGRATION,
    SUBJECTS,
    installStaffFixture,
    staffPoolOptions,
} from '../support/staff-authorization.js';
import { generateBackupCodes } from '../../src/lib/staff-backup-codes.js';
import { withStaffActor } from '../../src/lib/staff-authorization.js';
import { readStaffAccess } from '../../src/lib/staff-access.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const TOTP_MIGRATION = '20260925100000_staff_totp.sql';
const MIGRATIONS = [
    '20260922090000_foundation_roles.sql',
    '20260922090100_foundation_schema.sql',
    '20260922090200_foundation_seed.sql',
    AUTHZ_MIGRATION,
    GOOGLE_MIGRATION,
    TOTP_MIGRATION,
    '20261003090000_staff_mfa_backup_codes.sql',
];
const readMigration = (name) => readFileSync(join(migrationsDir, name), 'utf8');
const identity = (subject) => ({ provider: 'google', issuer: GOOGLE_ISSUER, subject });
const { ORG_A, USER_ADMIN1, USER_ADMIN2 } = AUTHZ_ID;

const scalar = (container, sql) => psql(container, sql).trim();
const rejectCode = async (promise, code) => {
    await assert.rejects(promise, (error) => error.code === code, `expected ${code}`);
};
const SECRET = 'ABCDEFGHIJKLMNOP';

const setLocalContext = (client, actor, org) => client.query(
    `select
        pg_catalog.set_config('app.actor_id', $1, true),
        pg_catalog.set_config('app.organization_id', $2, true)`,
    [actor ?? '', org ?? ''],
);

const withContext = async (pool, actor, org, fn) => {
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query('set local role app_staff');
        await setLocalContext(client, actor, org);
        return await fn(client);
    } finally {
        await client.query('rollback').catch(() => {});
        client.release();
    }
};

const totpStatus = (pool, subject) => withStaffActor(
    pool, identity(subject), ORG_A,
    async ({ client }) => (await client.query(
        'select credential_id, status, secret, last_used_counter from app.totp_status_v1()',
    )).rows[0] ?? null,
);

test('staff totp credentials on PostgreSQL 17', async (t) => {
    assertLocalTestEnvironment();
    const adminPassword = randomUUID();
    const container = await startPostgresContainer('pgtotp', POSTGRES_17_IMAGE, {
        publish: true,
        password: adminPassword,
    });
    let pool;
    t.after(async () => {
        await pool?.end().catch(() => {});
        await stopAndRemoveContainer(container);
    });

    for (const fileName of MIGRATIONS) {
        psql(container, readMigration(fileName));
    }
    const runtimePassword = installStaffFixture(container);
    pool = new pg.Pool(staffPoolOptions(container, runtimePassword, 4));

    await t.test('combined access uses four exchanges and does not reuse access across requests', async () => {
        const queries = [];
        const countedPool = { async connect() {
            const client = await pool.connect();
            return {
                query: (...args) => { queries.push(args[0]); return client.query(...args); },
                release: (error) => client.release(error),
            };
        } };
        const access = await readStaffAccess(countedPool, identity(SUBJECTS.ADMIN2), ORG_A);
        assert.equal(access.principal.user_id, USER_ADMIN2);
        assert.equal(access.totp, null);
        assert.equal(queries.length, 4, 'setup, resolve/context, MFA, commit');
        assert.equal(await readStaffAccess(pool, identity(SUBJECTS.UNMAPPED), ORG_A), null);
        assert.equal(await readStaffAccess(pool, identity(SUBJECTS.ADMIN1), AUTHZ_ID.ORG_B), null);
        psql(container, `update app.organization_memberships set status='revoked', revoked_at=now(), version=version+1
            where id='${AUTHZ_ID.MEMBER_ADMIN2}';`);
        try {
            assert.equal(await readStaffAccess(pool, identity(SUBJECTS.ADMIN2), ORG_A), null);
        } finally {
            psql(container, `update app.organization_memberships set status='active', revoked_at=null, version=version+1
                where id='${AUTHZ_ID.MEMBER_ADMIN2}';`);
        }
        assert.equal((await readStaffAccess(pool, identity(SUBJECTS.ADMIN2), ORG_A)).principal.user_id, USER_ADMIN2);
    });

    await t.test('procedures fail closed without a trusted actor context', async () => {
        await rejectCode(withContext(pool, '', '', (client) => client.query(
            'select app.totp_status_v1()',
        )), '42501');
        await rejectCode(withContext(pool, '', '', (client) => client.query(
            'select app.totp_enroll_v1($1, $2, $3)',
            [SECRET, randomUUID(), randomUUID()],
        )), '42501');
        // Unknown identity cannot even reach the procedures: resolution fails first.
        await assert.rejects(
            withStaffActor(pool, identity(SUBJECTS.UNMAPPED), ORG_A, async () => {}),
            (error) => error.code === 'UNAUTHORIZED',
        );
    });

    await t.test('enrollment lifecycle with audit trail', async () => {
        const enrolled = await withStaffActor(
            pool, identity(SUBJECTS.ADMIN1), ORG_A,
            async ({ client, auditId, correlationId }) => {
                const result = await client.query(
                    'select app.totp_enroll_v1($1, $2, $3) as credential_id',
                    [SECRET, auditId, correlationId],
                );
                return { credentialId: result.rows[0].credential_id, auditId };
            },
        );

        let status = await totpStatus(pool, SUBJECTS.ADMIN1);
        assert.equal(status.credential_id, enrolled.credentialId);
        assert.equal(status.status, 'pending');
        assert.equal((await readStaffAccess(pool, identity(SUBJECTS.ADMIN1), ORG_A)).totp.status, 'pending');
        assert.equal(status.secret, SECRET);
        assert.equal(Number(status.last_used_counter), -1);
        assert.equal(scalar(
            container,
            `select count(*) from app.audit_events where action = 'staff.totp.enrolled'`
                + ` and target_id = '${enrolled.credentialId}'`,
        ), '1');

        // Re-enrollment revokes the previous pending credential.
        const second = await withStaffActor(
            pool, identity(SUBJECTS.ADMIN1), ORG_A,
            async ({ client, auditId, correlationId }) => (await client.query(
                'select app.totp_enroll_v1($1, $2, $3) as credential_id',
                ['BCDEFGHIJKLMNOPQ', auditId, correlationId],
            )).rows[0].credential_id,
        );
        assert.notEqual(second, enrolled.credentialId);
        assert.equal(scalar(
            container,
            `select status from app.totp_credentials where id = '${enrolled.credentialId}'`,
        ), 'revoked');
        status = await totpStatus(pool, SUBJECTS.ADMIN1);
        assert.equal(status.credential_id, second);
        assert.equal(status.secret, 'BCDEFGHIJKLMNOPQ');

        // Confirm activates and revokes nothing else (no prior active).
        await withStaffActor(
            pool, identity(SUBJECTS.ADMIN1), ORG_A,
            async ({ client, auditId, correlationId }) => client.query(
                'select app.totp_confirm_v1($1, $2, $3)',
                [second, auditId, correlationId],
            ),
        );
        status = await totpStatus(pool, SUBJECTS.ADMIN1);
        assert.equal(status.status, 'active');
        const access = await readStaffAccess(pool, identity(SUBJECTS.ADMIN1), ORG_A);
        assert.equal(access.totp.status, 'active');
        assert.equal(access.totp.credentialId, second);
        assert.equal(access.principal.user_id, USER_ADMIN1);
        assert.equal(scalar(
            container,
            `select count(*) from app.audit_events where action = 'staff.totp.activated'`
                + ` and target_id = '${second}'`,
        ), '1');

        // Re-enrollment now replaces the active credential on confirm.
        const third = await withStaffActor(
            pool, identity(SUBJECTS.ADMIN1), ORG_A,
            async ({ client, auditId, correlationId }) => (await client.query(
                'select app.totp_enroll_v1($1, $2, $3) as credential_id',
                [SECRET, auditId, correlationId],
            )).rows[0].credential_id,
        );
        status = await totpStatus(pool, SUBJECTS.ADMIN1);
        assert.equal(status.credential_id, third);
        assert.equal(status.status, 'pending');
        await withStaffActor(
            pool, identity(SUBJECTS.ADMIN1), ORG_A,
            async ({ client, auditId, correlationId }) => client.query(
                'select app.totp_confirm_v1($1, $2, $3)',
                [third, auditId, correlationId],
            ),
        );
        assert.equal(scalar(
            container,
            `select count(*) from app.totp_credentials
                where organization_id = '${ORG_A}' and user_id = '${USER_ADMIN1}'
                  and status = 'active'`,
        ), '1');
        assert.equal(scalar(
            container,
            `select status from app.totp_credentials where id = '${second}'`,
        ), 'revoked');
    });

    await t.test('replay protection is counter-monotonic', async () => {
        const credential = (await totpStatus(pool, SUBJECTS.ADMIN1)).credential_id;
        const record = (counter) => withStaffActor(
            pool, identity(SUBJECTS.ADMIN1), ORG_A,
            async ({ client, auditId, correlationId }) => client.query(
                'select app.totp_record_use_v1($1, $2, $3, $4)',
                [credential, counter, auditId, correlationId],
            ),
        );
        await record(5);
        await rejectCode(record(5), '23514');
        await rejectCode(record(4), '23514');
        await record(6);
        assert.equal(scalar(
            container,
            `select count(*) from app.audit_events where action = 'staff.totp.verified'`
                + ` and target_id = '${credential}'`,
        ), '2');
        const status = await totpStatus(pool, SUBJECTS.ADMIN1);
        assert.equal(Number(status.last_used_counter), 6);
    });

    await t.test('credentials are bound to the acting user', async () => {
        const credential = (await totpStatus(pool, SUBJECTS.ADMIN1)).credential_id;
        // Admin Two cannot see or mutate Admin One's credential.
        await rejectCode(withContext(pool, USER_ADMIN2, ORG_A, (client) => client.query(
            'select app.totp_confirm_v1($1, $2, $3)',
            [credential, randomUUID(), randomUUID()],
        )), 'P0002');
        await rejectCode(withContext(pool, USER_ADMIN2, ORG_A, (client) => client.query(
            'select app.totp_record_use_v1($1, $2, $3, $4)',
            [credential, 99, randomUUID(), randomUUID()],
        )), 'P0002');
        const status2 = await totpStatus(pool, SUBJECTS.ADMIN2);
        assert.equal(status2, null);
    });

    await t.test('input validation', async () => {
        const enroll = (secret) => withStaffActor(
            pool, identity(SUBJECTS.ADMIN2), ORG_A,
            async ({ client, auditId, correlationId }) => client.query(
                'select app.totp_enroll_v1($1, $2, $3)',
                [secret, auditId, correlationId],
            ),
        );
        await rejectCode(enroll('short'), '22023');
        await rejectCode(enroll('INVALID!CHARS0000'), '22023');
        await rejectCode(enroll('aBCDEFGHIJKLMNOP'), '22023');
        await rejectCode(withStaffActor(
            pool, identity(SUBJECTS.ADMIN2), ORG_A,
            async ({ client }) => client.query(
                'select app.totp_enroll_v1($1, null, null)', [SECRET],
            ),
        ), '22023');
    });

    await t.test('raw table access stays denied for runtime roles', async () => {
        const client = await pool.connect();
        try {
            await rejectCode(
                client.query('select count(*) from app.totp_credentials'),
                '42501',
            );
            await rejectCode(client.query('set role app_executor'), '42501');
            await client.query('begin');
            await client.query('set local role app_staff');
            await rejectCode(
                client.query('select count(*) from app.totp_credentials'),
                '42501',
            );
            await client.query('rollback');
        } finally {
            client.release();
        }
    });

    await t.test('catalog assertions', async () => {
        assert.equal(scalar(
            container,
            `select relowner::regrole::text from pg_catalog.pg_class c
                join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'app' and c.relname = 'totp_credentials'`,
        ), 'app_owner');
        assert.equal(scalar(
            container,
            `select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class c
                join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'app' and c.relname = 'totp_credentials'`,
        ), 't');
        assert.equal(scalar(
            container,
            `select count(*) from pg_catalog.pg_policy p
                join pg_catalog.pg_class c on c.oid = p.polrelid
                join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'app' and c.relname = 'totp_credentials'
                  and p.polroles::regrole[]::text[] = array['app_executor']`,
        ), '3');
        assert.equal(scalar(
            container,
            `select string_agg(proowner::regrole::text, ',' order by proname)
                from pg_catalog.pg_proc p
                join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'app' and p.proname like 'totp_%_v1' and p.proname <> 'totp_actor_v1'`,
        ), 'app_executor,app_executor,app_executor,app_executor');
        assert.equal(scalar(
            container,
            `select proowner::regrole::text from pg_catalog.pg_proc p
                join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'app' and p.proname = 'totp_actor_v1'`,
        ), 'app_owner');
        // No grants to provider/runtime surfaces beyond app_staff/app_executor.
        assert.equal(scalar(
            container,
            `select count(*) from information_schema.role_table_grants
                where table_schema = 'app' and table_name = 'totp_credentials'
                  and grantee not in ('app_owner', 'app_executor')`,
        ), '0');
    });
    await t.test('backup codes are hashed, actor bound, single use, replaceable and audited', async () => {
        const credential = (await totpStatus(pool, SUBJECTS.ADMIN1)).credential_id;
        const backup = generateBackupCodes(credential);
        const set = (hashes) => withStaffActor(pool, identity(SUBJECTS.ADMIN1), ORG_A,
            ({ client, auditId, correlationId }) => client.query(
                'select app.set_mfa_backup_codes_v1($1,$2,$3,$4)',
                [credential, hashes, auditId, correlationId]));
        const consume = (hash, subject = SUBJECTS.ADMIN1) => withStaffActor(pool,
            identity(subject), ORG_A, async ({ client, auditId, correlationId }) =>
                (await client.query('select app.consume_mfa_backup_code_v1($1,$2,$3,$4) as accepted',
                    [credential, hash, auditId, correlationId])).rows[0].accepted);
        await rejectCode(set(['bad']), '22023');
        await rejectCode(set(Array(10).fill(backup.hashes[0])), '22023');
        await set(backup.hashes);
        assert.equal(scalar(container, `select count(*) from app.staff_mfa_backup_codes
            where credential_id = '${credential}'`), '10');
        assert.equal(scalar(container, `select code_hash from app.staff_mfa_backup_codes
            where credential_id = '${credential}' order by code_hash limit 1`), [...backup.hashes].sort()[0]);
        assert.equal(await consume(backup.hashes[0], SUBJECTS.ADMIN2), false);
        const concurrent = await Promise.all([consume(backup.hashes[0]), consume(backup.hashes[0])]);
        assert.deepEqual(concurrent.sort(), [false, true]);
        assert.equal(await consume(backup.hashes[0]), false);
        assert.equal(scalar(container, `select count(*) from app.audit_events where
            target_id = '${credential}' and action = 'staff.mfa.backup_code.used'`), '1');
        assert.equal(scalar(container, `select count(*) from app.audit_events where
            action like 'staff.mfa.%' and details::text like '%${backup.hashes[0]}%'`), '0');
        const replacement = generateBackupCodes(credential);
        await set(replacement.hashes);
        assert.equal(await consume(backup.hashes[1]), false);
        assert.equal(await consume(replacement.hashes[1]), true);
        scalar(container, `update app.totp_credentials set status = 'revoked', revoked_at = now()
            where id = '${credential}';`);
        assert.equal(await consume(replacement.hashes[2]), false);
        await rejectCode(set(replacement.hashes), '42501');
    });

    await t.test('MFA attempts share a persistent atomic budget across concurrent requests', async () => {
        const reserve = () => withStaffActor(pool, identity(SUBJECTS.ADMIN1), ORG_A,
            async ({ client }) => (await client.query('select app.reserve_mfa_attempt_v1() as retry')).rows[0].retry);
        const results = await Promise.all(Array.from({ length: 12 }, reserve));
        assert.equal(results.filter((n) => n === 0).length, 10);
        assert.equal(results.filter((n) => n > 0 && n <= 600).length, 2);
        assert.ok(await reserve() > 0);
        scalar(container, `update app.staff_mfa_attempts set window_started_at = now() - interval '11 minutes'
            where user_id = '${USER_ADMIN1}';`);
        assert.equal(await reserve(), 0);
        assert.equal(scalar(container, `select attempts from app.staff_mfa_attempts where user_id = '${USER_ADMIN1}'`), '1');
        await rejectCode(withContext(pool, '', '', (client) => client.query('select app.reserve_mfa_attempt_v1()')), '42501');
        await rejectCode(pool.query('select * from app.staff_mfa_backup_codes'), '42501');
        await rejectCode(pool.query('select * from app.staff_mfa_attempts'), '42501');
        assert.equal(scalar(container, `select count(*) from information_schema.role_table_grants
            where table_schema = 'app' and table_name in ('staff_mfa_backup_codes', 'staff_mfa_attempts')
            and grantee not in ('app_owner','app_executor')`), '0');
    });

});

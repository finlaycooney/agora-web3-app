import 'server-only';
import { randomUUID } from 'node:crypto';
import { generateBackupCodes, hashBackupCode } from './staff-backup-codes.js';
import { generateTotpSecret, matchTotpCode } from './totp.js';
import { withStaffActor } from './staff-authorization.js';

// Reads the acting staff member's TOTP credential (active preferred over
// pending). Returns { credentialId, status, secret, lastUsedCounter } or null.
export async function getTotpStatus(pool, identity, organizationId) {
    return withStaffActor(pool, identity, organizationId, async ({ client }) => {
        const result = await client.query(
            'select credential_id, status, secret, last_used_counter'
                + ' from app.totp_status_v1()',
        );
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return {
            credentialId: row.credential_id,
            status: row.status,
            secret: row.secret,
            lastUsedCounter: Number(row.last_used_counter),
        };
    });
}

// Starting setup is serialized by the database. Read the stored secret in
// the same transaction: another tab may have won with a different candidate.
export async function enrollTotp(pool, identity, organizationId) {
    const candidate = generateTotpSecret();
    return withStaffActor(pool, identity, organizationId, async ({ client, auditId, correlationId }) => {
        const result = await client.query(
            'select app.totp_enroll_v1($1, $2, $3) as credential_id',
            [candidate, auditId, correlationId],
        );
        const stored = await client.query(
            'select credential_id, status, secret, last_used_counter from app.totp_status_v1()',
        );
        const row = stored.rows[0];
        if (!row || row.credential_id !== result.rows[0].credential_id) {
            throw new Error('Enrollment credential could not be read');
        }
        return { credentialId: row.credential_id, status: row.status, secret: row.secret };
    });
}

export async function confirmTotpEnrollment(pool, identity, organizationId, credentialId, counter) {
    const backup = generateBackupCodes(credentialId);
    await withStaffActor(pool, identity, organizationId, async ({ client, auditId, correlationId }) => {
        await client.query(
            'select app.totp_confirm_v1($1, $2, $3)',
            [credentialId, auditId, correlationId],
        );
        await client.query('select app.totp_record_use_v1($1,$2,$3,$4)',
            [credentialId, counter, randomUUID(), correlationId]);
        await client.query('select app.set_mfa_backup_codes_v1($1,$2,$3,$4)',
            [credentialId, backup.hashes, randomUUID(), correlationId]);
    });
    return backup.codes;
}

export async function recordTotpUse(pool, identity, organizationId, credentialId, counter) {
    await withStaffActor(pool, identity, organizationId, async ({ client, auditId, correlationId }) => {
        await client.query(
            'select app.totp_record_use_v1($1, $2, $3, $4)',
            [credentialId, counter, auditId, correlationId],
        );
    });
}

export function verifyTotpCode(secret, code) {
    return matchTotpCode(secret, code);
}

// This reservation is committed separately so a failed code cannot roll it back.
export async function reserveMfaAttempt(pool, identity, organizationId) {
    return withStaffActor(pool, identity, organizationId, async ({ client }) =>
        (await client.query('select app.reserve_mfa_attempt_v1() as retry_after')).rows[0].retry_after);
}

export async function consumeBackupCode(pool, identity, organizationId, credentialId, code) {
    const hash = hashBackupCode(credentialId, code);
    if (!hash) return false;
    return withStaffActor(pool, identity, organizationId, async ({ client, auditId, correlationId }) =>
        (await client.query('select app.consume_mfa_backup_code_v1($1,$2,$3,$4) as accepted',
            [credentialId, hash, auditId, correlationId])).rows[0].accepted);
}

// Existing users can create/replace their set, but only after a fresh TOTP
// check. Generation and replay recording commit together or not at all.
export async function replaceBackupCodes(pool, identity, organizationId, credentialId, counter) {
    const backup = generateBackupCodes(credentialId);
    await withStaffActor(pool, identity, organizationId, async ({ client, auditId, correlationId }) => {
        await client.query('select app.totp_record_use_v1($1,$2,$3,$4)',
            [credentialId, counter, auditId, correlationId]);
        await client.query('select app.set_mfa_backup_codes_v1($1,$2,$3,$4)',
            [credentialId, backup.hashes, randomUUID(), correlationId]);
    });
    return backup.codes;
}

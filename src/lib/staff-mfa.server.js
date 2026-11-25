import 'server-only';
import { generateTotpSecret, matchTotpCode } from './totp.js';
import { withStaffActor } from './staff-authorization.js';

// Reads the acting staff member's TOTP credential (pending preferred over
// active). Returns { credentialId, status, secret, lastUsedCounter } or null.
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

// Starts enrollment: generates a fresh secret and stores a pending credential.
// The server already holds the secret, so confirmation needs no secret re-read.
export async function enrollTotp(pool, identity, organizationId) {
    const secret = generateTotpSecret();
    const credentialId = await withStaffActor(
        pool, identity, organizationId,
        async ({ client, auditId, correlationId }) => {
            const result = await client.query(
                'select app.totp_enroll_v1($1, $2, $3) as credential_id',
                [secret, auditId, correlationId],
            );
            return result.rows[0].credential_id;
        },
    );
    return { credentialId, secret };
}

export async function confirmTotpEnrollment(pool, identity, organizationId, credentialId) {
    await withStaffActor(pool, identity, organizationId, async ({ client, auditId, correlationId }) => {
        await client.query(
            'select app.totp_confirm_v1($1, $2, $3)',
            [credentialId, auditId, correlationId],
        );
    });
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

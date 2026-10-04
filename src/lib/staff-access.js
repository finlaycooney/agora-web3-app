import { StaffAuthorizationError, withStaffActor } from './staff-authorization.js';

// One fresh transaction resolves membership and reads the acting member's MFA
// credential. This is server-side data only; it must never be serialized.
export async function readStaffAccess(pool, identity, organizationId) {
    try {
        return await withStaffActor(pool, identity, organizationId, async ({ client, principal }) => {
            const { rows } = await client.query(
                'select credential_id, status, secret, last_used_counter from app.totp_status_v1()',
            );
            const row = rows[0];
            return {
                principal: {
                    user_id: principal.userId,
                    membership_id: principal.membershipId,
                    role_id: principal.roleId,
                },
                totp: row ? {
                    credentialId: row.credential_id,
                    status: row.status,
                    secret: row.secret,
                    lastUsedCounter: Number(row.last_used_counter),
                } : null,
            };
        });
    } catch (error) {
        if (error instanceof StaffAuthorizationError && error.code === 'UNAUTHORIZED') return null;
        throw error;
    }
}

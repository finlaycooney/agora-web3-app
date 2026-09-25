import 'server-only';
import pg from 'pg';

let staffPool;

// Lazily creates the staff-runtime pool. Returns null when the staff workspace
// is not configured, so callers can fail closed rather than crash.
export function getStaffPool() {
    const connectionString = process.env.STAFF_DATABASE_URL;
    if (!connectionString) {
        return null;
    }
    if (!staffPool) {
        staffPool = new pg.Pool({
            connectionString,
            max: 2,
            idleTimeoutMillis: 10_000,
        });
    }
    return staffPool;
}

// Resolves a verified Google identity to a staff principal via
// app.resolve_staff_principal_v1, executed under the app_staff runtime role.
// Returns null when the identity is unknown, unverified, inactive, or revoked.
export async function resolveStaffPrincipal(pool, identity, organizationId) {
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query('set local role app_staff');
        const result = await client.query(
            `select user_id, membership_id, role_id
               from app.resolve_staff_principal_v1($1, $2, $3, $4)`,
            [identity.provider, identity.issuer, identity.subject, organizationId],
        );
        await client.query('commit');
        return result.rows[0] ?? null;
    } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

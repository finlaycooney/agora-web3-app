import { randomUUID } from 'node:crypto';

const KNOWN_PERMISSION_KEYS = new Set([
    'applications.read',
    'applications.stage',
    'audit.read',
    'candidates.merge',
    'candidates.read',
    'candidates.write',
    'clients.read',
    'clients.write',
    'collaboration.read',
    'collaboration.write',
    'data.export',
    'documents.download',
    'documents.write',
    'duplicates.review',
    'jobs.read',
    'jobs.write',
    'organization.manage',
    'pipelines.manage',
    'privacy.manage',
    'roles.manage',
    'staff.manage',
]);

export const STAFF_PROVIDER = 'google';
export const STAFF_ISSUER = 'https://accounts.google.com';
const SUBJECT_PATTERN = /^[1-9][0-9]{0,20}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class StaffAuthorizationError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'StaffAuthorizationError';
        this.code = code;
    }
}

export async function withStaffTransaction(
    pool,
    verifiedIdentity,
    organizationId,
    requiredPermissions,
    operation,
) {
    if (!verifiedIdentity
        || verifiedIdentity.provider !== STAFF_PROVIDER
        || verifiedIdentity.issuer !== STAFF_ISSUER
        || typeof verifiedIdentity.subject !== 'string'
        || !SUBJECT_PATTERN.test(verifiedIdentity.subject)) {
        throw new StaffAuthorizationError(
            'INVALID_CONTEXT',
            'verifiedIdentity must be a server-verified supported provider subject',
        );
    }
    if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) {
        throw new StaffAuthorizationError('INVALID_CONTEXT', 'organizationId must be a UUID');
    }
    if (!Array.isArray(requiredPermissions)
        || requiredPermissions.length === 0
        || requiredPermissions.some((key) => !KNOWN_PERMISSION_KEYS.has(key))) {
        throw new StaffAuthorizationError(
            'INVALID_CONTEXT',
            'requiredPermissions must be a nonempty array of catalog permission keys',
        );
    }
    if (typeof operation !== 'function') {
        throw new StaffAuthorizationError('INVALID_CONTEXT', 'operation must be a function');
    }

    const client = await pool.connect();
    let released = false;
    const release = (error) => {
        if (!released) {
            released = true;
            client.release(error);
        }
    };

    try {
        await client.query('begin isolation level read committed');
        await client.query(`set local lock_timeout = '2s'`);
        await client.query(`set local statement_timeout = '10s'`);
        await client.query(
            `select
                pg_catalog.set_config('app.actor_id', '', true),
                pg_catalog.set_config('app.organization_id', '', true),
                pg_catalog.set_config('app.identity_provider', '', true),
                pg_catalog.set_config('app.identity_issuer', '', true),
                pg_catalog.set_config('app.identity_subject', '', true)`,
        );
        const resolved = await client.query(
            'select user_id, membership_id, role_id'
                + ' from app.resolve_staff_principal_v1($1, $2, $3, $4)',
            [
                verifiedIdentity.provider,
                verifiedIdentity.issuer,
                verifiedIdentity.subject,
                organizationId,
            ],
        );
        if (resolved.rows.length !== 1) {
            throw new StaffAuthorizationError(
                'UNAUTHORIZED',
                'identity does not resolve to an active staff membership',
            );
        }
        const principal = resolved.rows[0];
        await client.query(
            `select
                pg_catalog.set_config('app.actor_id', $1, true),
                pg_catalog.set_config('app.organization_id', $2, true)`,
            [principal.user_id, organizationId],
        );
        for (const key of requiredPermissions) {
            const permission = await client.query(
                'select app.has_permission_v1($1) as allowed',
                [key],
            );
            if (permission.rows[0]?.allowed !== true) {
                throw new StaffAuthorizationError(
                    'FORBIDDEN',
                    'a required permission is not granted',
                );
            }
        }
        const result = await operation({
            client,
            principal: {
                userId: principal.user_id,
                membershipId: principal.membership_id,
                roleId: principal.role_id,
                organizationId,
            },
            auditId: randomUUID(),
            correlationId: randomUUID(),
        });
        await client.query('commit');
        release();
        return result;
    } catch (error) {
        let rollbackError;
        try {
            await client.query('rollback');
        } catch (caught) {
            rollbackError = caught;
        }
        release(rollbackError);
        throw error;
    }
}

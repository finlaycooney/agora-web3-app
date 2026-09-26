import { randomUUID } from 'node:crypto';
import {
    StaffAuthorizationError,
    withStaffTransaction,
} from './staff-authorization.js';
import { STAFF_EMAIL_PATTERN } from './staff-identity.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAFF_MANAGE_PERMISSIONS = ['staff.manage'];

// Input-contract error for staff-administration operations; staff-api maps it
// to HTTP 400 with per-field details, same shape as ClientJobContractError.
export class StaffOperationsError extends Error {
    constructor(fieldErrors) {
        super('invalid input');
        this.name = 'StaffOperationsError';
        this.fieldErrors = fieldErrors;
    }
}

const invalidInput = (fieldErrors) => new StaffOperationsError(fieldErrors);

const requireRecord = (input, name, allowedKeys) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw invalidInput({ input: `${name} must be a plain object` });
    }
    for (const key of Object.keys(input)) {
        if (!allowedKeys.includes(key)) {
            throw invalidInput({ [key]: 'unknown key' });
        }
    }
    return input;
};

const requireUuid = (value, name) => {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw invalidInput({ [name]: 'must be a UUID' });
    }
    return value;
};

const run = (pool, verifiedIdentity, organizationId, sql, params) =>
    withStaffTransaction(
        pool,
        verifiedIdentity,
        organizationId,
        STAFF_MANAGE_PERMISSIONS,
        async ({ client }) => {
            const result = await client.query(sql, params);
            return result.rows[0]?.result ?? null;
        },
    );

export async function inviteStaffMember(pool, verifiedIdentity, organizationId, input) {
    const record = requireRecord(
        input, 'input',
        ['userId', 'membershipId', 'displayName', 'email', 'roleId', 'operationId'],
    );
    const userId = requireUuid(record.userId, 'userId');
    const membershipId = requireUuid(record.membershipId, 'membershipId');
    const roleId = requireUuid(record.roleId, 'roleId');
    const operationId = requireUuid(record.operationId, 'operationId');
    const displayName = typeof record.displayName === 'string'
        ? record.displayName.trim() : '';
    if (!displayName || displayName.length > 256) {
        throw invalidInput({ displayName: 'required, at most 256 characters' });
    }
    const email = typeof record.email === 'string' ? record.email.trim() : '';
    if (!email || email.length > 320 || !STAFF_EMAIL_PATTERN.test(email)) {
        throw invalidInput({ email: 'must be a valid email address' });
    }
    return run(
        pool, verifiedIdentity, organizationId,
        'select app.invite_staff_member_v1($1::uuid, $2::uuid, $3::text, $4::text,'
            + ' $5::uuid, $6::uuid, $7::uuid) as result',
        [
            userId, membershipId, displayName, email, roleId,
            operationId, randomUUID(),
        ],
    );
}

export async function getStaffDirectory(pool, verifiedIdentity, organizationId, input = {}) {
    const record = requireRecord(input, 'input', ['limit']);
    const limit = record.limit ?? null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
        throw invalidInput({ limit: 'must be an integer between 1 and 500' });
    }
    return run(
        pool, verifiedIdentity, organizationId,
        'select app.staff_directory_v1($1::integer) as result',
        [limit],
    );
}

export { StaffAuthorizationError };

import {
    StaffAuthorizationError,
    withStaffTransaction,
} from './staff-authorization.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /^[1-9][0-9]{0,18}$/;
const REQUEST_KINDS = new Set([
    'access',
    'correction',
    'restriction',
    'erasure',
    'objection',
    'portability',
    'withdrawal',
]);
const CHANGE_KEYS = new Set(['full_name', 'professional_summary']);
const MAX_CHANGES_BYTES = 49152;

const invalid = (message) => new StaffAuthorizationError('INVALID_CONTEXT', message);

const requireInput = (input, allowedKeys) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw invalid('input must be an object');
    }
    for (const key of Object.keys(input)) {
        if (!allowedKeys.includes(key)) {
            throw invalid(`unexpected input key ${key}`);
        }
    }
    return input;
};

const requireUuid = (value, name) => {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw invalid(`${name} must be a UUID`);
    }
    return value;
};

const optionalUuid = (value, name) => {
    if (value === undefined || value === null) {
        return null;
    }
    return requireUuid(value, name);
};

const requireVersion = (value, name) => {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw invalid(`${name} must be a positive safe integer`);
        }
        return String(value);
    }
    if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
        throw invalid(`${name} must be a positive version`);
    }
    if (BigInt(value) > 9223372036854775807n) {
        throw invalid(`${name} exceeds PostgreSQL bigint range`);
    }
    return value;
};

const optionalSha256 = (value, name) => {
    if (value === undefined || value === null) {
        return null;
    }
    if (!Buffer.isBuffer(value) || value.length !== 32) {
        throw invalid(`${name} must be a 32-byte Buffer`);
    }
    return value;
};

const requireChanges = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw invalid('changes must be a nonempty object');
    }
    const keys = Object.keys(value);
    if (keys.length === 0) {
        throw invalid('changes must be a nonempty object');
    }
    for (const key of keys) {
        if (!CHANGE_KEYS.has(key)) {
            throw invalid(`unsupported change key ${key}`);
        }
        const entry = value[key];
        if (entry !== null && typeof entry !== 'string') {
            throw invalid(`${key} must be a string or null`);
        }
    }
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_CHANGES_BYTES) {
        throw invalid('changes payload is too large');
    }
    return encoded;
};

const OPERATIONS = {
    create_privacy_request_v1: {
        keys: ['requestId', 'kind', 'receivedAt', 'dueAt'],
        sql: 'select app.create_privacy_request_v1('
            + '$1::uuid, $2::text, $3::timestamptz, $4::timestamptz, $5::uuid, $6::uuid'
            + ') as result',
        build(input) {
            requireUuid(input.requestId, 'requestId');
            if (typeof input.kind !== 'string' || !REQUEST_KINDS.has(input.kind)) {
                throw invalid('kind must be a supported privacy request kind');
            }
            if (input.receivedAt === undefined || input.receivedAt === null) {
                throw invalid('receivedAt is required');
            }
            return [
                input.requestId,
                input.kind,
                input.receivedAt,
                input.dueAt ?? null,
            ];
        },
    },
    review_privacy_subject_v1: {
        keys: [
            'requestId', 'expectedRequestVersion', 'subjectId', 'candidateId',
            'legacyRecordId', 'expectedTargetVersion', 'sourceSha256',
        ],
        sql: 'select app.review_privacy_subject_v1('
            + '$1::uuid, $2::bigint, $3::uuid, $4::uuid, $5::uuid, $6::bigint,'
            + ' $7::bytea, $8::uuid, $9::uuid'
            + ') as result',
        build(input) {
            requireUuid(input.requestId, 'requestId');
            requireUuid(input.subjectId, 'subjectId');
            const candidateId = optionalUuid(input.candidateId, 'candidateId');
            const legacyRecordId = optionalUuid(input.legacyRecordId, 'legacyRecordId');
            if ((candidateId === null) === (legacyRecordId === null)) {
                throw invalid('exactly one of candidateId or legacyRecordId is required');
            }
            return [
                input.requestId,
                requireVersion(input.expectedRequestVersion, 'expectedRequestVersion'),
                input.subjectId,
                candidateId,
                legacyRecordId,
                requireVersion(input.expectedTargetVersion, 'expectedTargetVersion'),
                optionalSha256(input.sourceSha256, 'sourceSha256'),
            ];
        },
    },
    verify_privacy_request_v1: {
        keys: ['requestId', 'expectedRequestVersion', 'verificationMethod'],
        sql: 'select app.verify_privacy_request_v1('
            + '$1::uuid, $2::bigint, $3::text, $4::uuid, $5::uuid'
            + ') as result',
        build(input) {
            requireUuid(input.requestId, 'requestId');
            if (typeof input.verificationMethod !== 'string'
                || input.verificationMethod.length === 0) {
                throw invalid('verificationMethod must be a nonempty string');
            }
            return [
                input.requestId,
                requireVersion(input.expectedRequestVersion, 'expectedRequestVersion'),
                input.verificationMethod,
            ];
        },
    },
    correct_privacy_candidate_v1: {
        keys: [
            'requestId', 'expectedRequestVersion', 'subjectId',
            'expectedCandidateVersion', 'changes',
        ],
        sql: 'select app.correct_privacy_candidate_v1('
            + '$1::uuid, $2::bigint, $3::uuid, $4::bigint, $5::jsonb, $6::uuid, $7::uuid'
            + ') as result',
        build(input) {
            requireUuid(input.requestId, 'requestId');
            requireUuid(input.subjectId, 'subjectId');
            return [
                input.requestId,
                requireVersion(input.expectedRequestVersion, 'expectedRequestVersion'),
                input.subjectId,
                requireVersion(input.expectedCandidateVersion, 'expectedCandidateVersion'),
                requireChanges(input.changes),
            ];
        },
    },
    restrict_privacy_subject_v1: {
        keys: [
            'requestId', 'expectedRequestVersion', 'subjectId', 'expectedTargetVersion',
        ],
        sql: 'select app.restrict_privacy_subject_v1('
            + '$1::uuid, $2::bigint, $3::uuid, $4::bigint, $5::uuid, $6::uuid'
            + ') as result',
        build(input) {
            requireUuid(input.requestId, 'requestId');
            requireUuid(input.subjectId, 'subjectId');
            return [
                input.requestId,
                requireVersion(input.expectedRequestVersion, 'expectedRequestVersion'),
                input.subjectId,
                requireVersion(input.expectedTargetVersion, 'expectedTargetVersion'),
            ];
        },
    },
};

const invoke = async (functionName, pool, verifiedIdentity, organizationId, input) => {
    const operation = OPERATIONS[functionName];
    requireInput(input, operation.keys);
    const values = operation.build(input);
    return withStaffTransaction(
        pool,
        verifiedIdentity,
        organizationId,
        ['privacy.manage'],
        async ({ client, auditId, correlationId }) => (
            await client.query(
                operation.sql,
                [...values, auditId, correlationId],
            )
        ).rows[0].result,
    );
};

export const createPrivacyRequest = (pool, verifiedIdentity, organizationId, input) =>
    invoke('create_privacy_request_v1', pool, verifiedIdentity, organizationId, input);

export const reviewPrivacySubject = (pool, verifiedIdentity, organizationId, input) =>
    invoke('review_privacy_subject_v1', pool, verifiedIdentity, organizationId, input);

export const verifyPrivacyRequest = (pool, verifiedIdentity, organizationId, input) =>
    invoke('verify_privacy_request_v1', pool, verifiedIdentity, organizationId, input);

export const correctPrivacyCandidate = (pool, verifiedIdentity, organizationId, input) =>
    invoke('correct_privacy_candidate_v1', pool, verifiedIdentity, organizationId, input);

export const restrictPrivacySubject = (pool, verifiedIdentity, organizationId, input) =>
    invoke('restrict_privacy_subject_v1', pool, verifiedIdentity, organizationId, input);

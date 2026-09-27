import { randomUUID } from 'node:crypto';
import {
    StaffAuthorizationError,
    withStaffTransaction,
} from './staff-authorization.js';
import { ClientJobContractError } from './client-job-contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIGINT_PATTERN = /^[0-9]{1,19}$/;
const REFERENCE_PATTERN = /^AG-[0-9A-F]{12}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CV_MIME_BY_EXTENSION = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const APPLICATION_READ_PERMISSIONS = ['applications.read'];
const CANDIDATE_READ_PERMISSIONS = ['candidates.read'];
const STAGE_PERMISSIONS = ['applications.read', 'applications.stage', 'candidates.read'];
const NOTE_PERMISSIONS = ['collaboration.write'];
const DOWNLOAD_PERMISSIONS = ['documents.download'];
const IMPORT_PERMISSIONS = [
    'candidates.write',
    'documents.write',
    'applications.stage',
    'jobs.read',
];

const invalidInput = (message, fieldErrors = {}) => new ClientJobContractError({
    input: message,
    ...fieldErrors,
});

const requireRecord = (input, name, allowedKeys) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw invalidInput(`${name} must be a plain object`);
    }
    for (const key of Object.keys(input)) {
        if (!allowedKeys.includes(key)) {
            throw invalidInput(`${name} has an unknown key`, { [key]: 'unknown key' });
        }
    }
    return input;
};

const requireUuid = (value, name) => {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw invalidInput(`${name} must be a UUID`);
    }
    return value;
};

const optionalUuid = (value, name) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    return requireUuid(value, name);
};

const requireVersion = (value, name) => {
    if (typeof value !== 'string' || !BIGINT_PATTERN.test(value) || BigInt(value) < 1n) {
        throw invalidInput(`${name} must be a positive bigint string`);
    }
    return value;
};

const optionalQuery = (value, name, maxLength = 200) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== 'string' || value.trim().length > maxLength) {
        throw invalidInput(`${name} must be a string of at most ${maxLength} characters`);
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

const run = (pool, verifiedIdentity, organizationId, permissions, sql, params) =>
    withStaffTransaction(
        pool,
        verifiedIdentity,
        organizationId,
        permissions,
        async ({ client }) => {
            const result = await client.query(sql, params);
            return result.rows[0]?.result ?? null;
        },
    );

export async function listApplications(pool, verifiedIdentity, organizationId, input = {}) {
    const record = requireRecord(input, 'input', ['jobId', 'query', 'limit']);
    const jobId = optionalUuid(record.jobId, 'jobId');
    const query = optionalQuery(record.query, 'query');
    const limit = record.limit ?? null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) {
        throw invalidInput('limit must be an integer between 1 and 1000');
    }
    return run(
        pool, verifiedIdentity, organizationId, APPLICATION_READ_PERMISSIONS,
        'select app.list_applications_v1($1::uuid, $2::text, $3::integer) as result',
        [jobId, query, limit],
    );
}

export async function listCandidates(pool, verifiedIdentity, organizationId, input = {}) {
    const record = requireRecord(input, 'input', ['query', 'limit']);
    const query = optionalQuery(record.query, 'query');
    const limit = record.limit ?? null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) {
        throw invalidInput('limit must be an integer between 1 and 1000');
    }
    return run(
        pool, verifiedIdentity, organizationId, CANDIDATE_READ_PERMISSIONS,
        'select app.list_candidates_v1($1::text, $2::integer) as result',
        [query, limit],
    );
}

export async function getCandidateWorkspace(pool, verifiedIdentity, organizationId, input) {
    const record = requireRecord(input, 'input', ['candidateId']);
    const candidateId = requireUuid(record.candidateId, 'candidateId');
    return run(
        pool, verifiedIdentity, organizationId, CANDIDATE_READ_PERMISSIONS,
        'select app.get_candidate_workspace_v1($1::uuid) as result',
        [candidateId],
    );
}

export async function transitionApplicationStage(
    pool, verifiedIdentity, organizationId, input,
) {
    const record = requireRecord(
        input, 'input',
        ['applicationId', 'toStageId', 'expectedVersion', 'reason', 'operationId'],
    );
    const applicationId = requireUuid(record.applicationId, 'applicationId');
    const toStageId = requireUuid(record.toStageId, 'toStageId');
    const expectedVersion = requireVersion(record.expectedVersion, 'expectedVersion');
    const operationId = requireUuid(record.operationId, 'operationId');
    const reason = optionalQuery(record.reason, 'reason', 500);
    return run(
        pool, verifiedIdentity, organizationId, STAGE_PERMISSIONS,
        'select app.transition_application_stage_v1($1::uuid, $2::uuid, $3::bigint,'
            + ' $4::text, $5::uuid, $6::uuid) as result',
        [applicationId, toStageId, expectedVersion, reason, operationId, randomUUID()],
    );
}

export async function addCandidateNote(pool, verifiedIdentity, organizationId, input) {
    const record = requireRecord(input, 'input', ['candidateId', 'body', 'operationId']);
    const candidateId = requireUuid(record.candidateId, 'candidateId');
    const operationId = requireUuid(record.operationId, 'operationId');
    const body = typeof record.body === 'string' ? record.body.trim() : '';
    if (!body || Buffer.byteLength(body, 'utf8') > 16384) {
        throw invalidInput('body is required, at most 16 KB', { body: 'required' });
    }
    return run(
        pool, verifiedIdentity, organizationId, NOTE_PERMISSIONS,
        'select app.add_candidate_note_v1($1::uuid, $2::uuid, $3::text, $4::uuid, $5::uuid) as result',
        [randomUUID(), candidateId, body, operationId, randomUUID()],
    );
}

// Resolves a document to its bucket/object coordinates. The route signs a
// short-lived URL from these — the coordinates never reach the client without
// going through this permission check.
export async function getDocumentDownload(pool, verifiedIdentity, organizationId, input) {
    const record = requireRecord(input, 'input', ['documentId']);
    const documentId = requireUuid(record.documentId, 'documentId');
    return run(
        pool, verifiedIdentity, organizationId, DOWNLOAD_PERMISSIONS,
        'select app.get_document_download_v1($1::uuid) as result',
        [documentId],
    );
}

// Imports one public intake row. `document` is null when the CV object could
// not be fetched — the application still lands, just without a registered CV.
export async function importPublicApplication(
    pool, verifiedIdentity, organizationId, input,
) {
    const record = requireRecord(
        input, 'input',
        [
            'jobSlug', 'reference', 'fullName', 'email', 'professionalUrl',
            'achievement', 'receivedAt', 'document', 'operationId',
        ],
    );
    const operationId = requireUuid(record.operationId, 'operationId');
    const jobSlug = typeof record.jobSlug === 'string' ? record.jobSlug.trim() : '';
    if (!jobSlug || jobSlug.length > 200) {
        throw invalidInput('jobSlug is required', { jobSlug: 'required' });
    }
    const reference = typeof record.reference === 'string' ? record.reference : '';
    if (!REFERENCE_PATTERN.test(reference)) {
        throw invalidInput('reference must match the AG-XXXXXXXXXXXX format');
    }
    const fullName = typeof record.fullName === 'string' ? record.fullName.trim() : '';
    if (!fullName || fullName.length > 256) {
        throw invalidInput('fullName is required', { fullName: 'required' });
    }
    const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
    if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
        throw invalidInput('email must be a valid email address', { email: 'invalid' });
    }
    const professionalUrl = optionalQuery(record.professionalUrl, 'professionalUrl', 2048);
    const achievement = optionalQuery(record.achievement, 'achievement', 4000);
    const receivedAt = new Date(record.receivedAt);
    if (Number.isNaN(receivedAt.getTime())) {
        throw invalidInput('receivedAt must be an ISO timestamp');
    }
    let documentId = null;
    let locationId = null;
    let blobId = null;
    let blob = null;
    if (record.document !== null && record.document !== undefined) {
        const document = requireRecord(
            record.document, 'document',
            ['sha256', 'sizeBytes', 'mimeType', 'extension', 'bucket', 'objectKey', 'filename'],
        );
        if (typeof document.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(document.sha256)) {
            throw invalidInput('document.sha256 must be 64 hex characters');
        }
        const sizeBytes = Number(document.sizeBytes);
        if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 4194304) {
            throw invalidInput('document.sizeBytes must be between 1 and 4 MiB');
        }
        if (CV_MIME_BY_EXTENSION[document.extension] !== document.mimeType) {
            throw invalidInput('document mime/extension combination is invalid');
        }
        for (const key of ['bucket', 'objectKey', 'filename']) {
            if (typeof document[key] !== 'string' || !document[key].trim()) {
                throw invalidInput(`document.${key} is required`);
            }
        }
        blobId = randomUUID();
        locationId = randomUUID();
        documentId = randomUUID();
        blob = {
            sha256: `\\x${document.sha256.toLowerCase()}`,
            sizeBytes,
            mimeType: document.mimeType,
            extension: document.extension,
            bucket: document.bucket.trim(),
            objectKey: document.objectKey.trim(),
            filename: document.filename.trim(),
        };
    }
    return run(
        pool, verifiedIdentity, organizationId, IMPORT_PERMISSIONS,
        `select app.import_public_application_v1(
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
            $7::uuid, $8::uuid, $9::uuid,
            $10::text, $11::text, $12::text, $13::text, $14::text, $15::text,
            $16::timestamptz,
            $17::bytea, $18::bigint, $19::text, $20::text, $21::text, $22::text,
            $23::text, $24::uuid, $25::uuid
        ) as result`,
        [
            randomUUID(), randomUUID(), randomUUID(), randomUUID(),
            randomUUID(), randomUUID(), blobId, locationId, documentId,
            jobSlug, reference, fullName, email, professionalUrl, achievement,
            receivedAt.toISOString(),
            blob?.sha256 ?? null, blob?.sizeBytes ?? null, blob?.mimeType ?? null,
            blob?.extension ?? null, blob?.bucket ?? null, blob?.objectKey ?? null,
            blob?.filename ?? null,
            operationId, randomUUID(),
        ],
    );
}

export { StaffAuthorizationError };

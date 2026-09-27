import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientJobContractError } from '../../src/lib/client-job-contracts.js';
import {
    addCandidateNote,
    getCandidateWorkspace,
    getDocumentDownload,
    importPublicApplication,
    listApplications,
    listCandidates,
    transitionApplicationStage,
} from '../../src/lib/pipeline-operations.js';

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';

const rejectsInvalid = (promise, messagePart) => assert.rejects(
    promise,
    (error) => error instanceof ClientJobContractError
        && error.fieldErrors.input.includes(messagePart),
);

test('listApplications validates filters before opening a transaction', async () => {
    await rejectsInvalid(
        listApplications(null, null, null, { jobId: 'nope' }),
        'jobId must be a UUID',
    );
    await rejectsInvalid(
        listApplications(null, null, null, { limit: 0 }),
        'limit must be an integer between 1 and 1000',
    );
    await rejectsInvalid(
        listApplications(null, null, null, { unknown: true }),
        'input has an unknown key',
    );
});

test('listCandidates and getCandidateWorkspace validate input', async () => {
    await rejectsInvalid(
        listCandidates(null, null, null, { limit: 1001 }),
        'limit must be an integer between 1 and 1000',
    );
    await rejectsInvalid(
        getCandidateWorkspace(null, null, null, { candidateId: 'x' }),
        'candidateId must be a UUID',
    );
    await rejectsInvalid(
        getCandidateWorkspace(null, null, null, null),
        'input must be a plain object',
    );
});

test('transitionApplicationStage validates ids, version and reason', async () => {
    await rejectsInvalid(
        transitionApplicationStage(null, null, null, {
            applicationId: 'bad', toStageId: UUID, expectedVersion: '1',
            reason: null, operationId: UUID2,
        }),
        'applicationId must be a UUID',
    );
    await rejectsInvalid(
        transitionApplicationStage(null, null, null, {
            applicationId: UUID, toStageId: UUID, expectedVersion: '0',
            reason: null, operationId: UUID2,
        }),
        'expectedVersion must be a positive bigint string',
    );
    await rejectsInvalid(
        transitionApplicationStage(null, null, null, {
            applicationId: UUID, toStageId: UUID, expectedVersion: 'abc',
            reason: null, operationId: UUID2,
        }),
        'expectedVersion must be a positive bigint string',
    );
});

test('addCandidateNote enforces a nonempty bounded body', async () => {
    await rejectsInvalid(
        addCandidateNote(null, null, null, {
            candidateId: UUID, body: '   ', operationId: UUID2,
        }),
        'body is required',
    );
    await rejectsInvalid(
        addCandidateNote(null, null, null, {
            candidateId: UUID, body: 'x'.repeat(17000), operationId: UUID2,
        }),
        'body is required',
    );
});

test('getDocumentDownload requires a document UUID', async () => {
    await rejectsInvalid(
        getDocumentDownload(null, null, null, { documentId: 'cv.pdf' }),
        'documentId must be a UUID',
    );
});

test('importPublicApplication validates the submission envelope', async () => {
    const base = {
        jobSlug: 'founding-engineer',
        reference: 'AG-AAAA00000001',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        professionalUrl: null,
        achievement: null,
        receivedAt: '2026-09-20T10:00:00Z',
        document: null,
        operationId: UUID2,
    };
    await rejectsInvalid(
        importPublicApplication(null, null, null, { ...base, jobSlug: '' }),
        'jobSlug is required',
    );
    await rejectsInvalid(
        importPublicApplication(null, null, null, { ...base, reference: 'bad' }),
        'reference must match',
    );
    await rejectsInvalid(
        importPublicApplication(null, null, null, { ...base, email: 'nope' }),
        'email must be a valid email address',
    );
    await rejectsInvalid(
        importPublicApplication(null, null, null, { ...base, receivedAt: 'soon' }),
        'receivedAt must be an ISO timestamp',
    );
});

test('importPublicApplication validates document metadata when present', async () => {
    const base = {
        jobSlug: 'founding-engineer',
        reference: 'AG-AAAA00000001',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        professionalUrl: null,
        achievement: null,
        receivedAt: '2026-09-20T10:00:00Z',
        operationId: UUID2,
    };
    const document = {
        sha256: 'ab'.repeat(32),
        sizeBytes: 4096,
        mimeType: 'application/pdf',
        extension: 'pdf',
        bucket: 'cv-submissions',
        objectKey: 'cvs/job/cv.pdf',
        filename: 'cv.pdf',
    };
    await rejectsInvalid(
        importPublicApplication(null, null, null, {
            ...base, document: { ...document, sha256: 'short' },
        }),
        'document.sha256 must be 64 hex characters',
    );
    await rejectsInvalid(
        importPublicApplication(null, null, null, {
            ...base, document: { ...document, sizeBytes: 0 },
        }),
        'document.sizeBytes must be between 1 and 4 MiB',
    );
    await rejectsInvalid(
        importPublicApplication(null, null, null, {
            ...base, document: { ...document, sizeBytes: 5000000 },
        }),
        'document.sizeBytes must be between 1 and 4 MiB',
    );
    await rejectsInvalid(
        importPublicApplication(null, null, null, {
            ...base, document: { ...document, extension: 'png' },
        }),
        'document mime/extension combination is invalid',
    );
    await rejectsInvalid(
        importPublicApplication(null, null, null, {
            ...base, document: { ...document, objectKey: '' },
        }),
        'document.objectKey is required',
    );
});

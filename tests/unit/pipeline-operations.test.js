import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientJobContractError } from '../../src/lib/client-job-contracts.js';
import {
    addCandidateNote,
    getCandidateWorkspace,
    getDocumentDownload,
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

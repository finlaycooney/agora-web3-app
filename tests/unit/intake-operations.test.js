import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientJobContractError } from '../../src/lib/client-job-contracts.js';
import {
    listPublicJobs,
    submitPublicApplication,
} from '../../src/lib/intake-operations.js';
import { rateLimitAllow } from '../../src/lib/rate-limit.js';

const rejectsInvalid = (promise, messagePart) => assert.rejects(
    promise,
    (error) => error instanceof ClientJobContractError
        && error.fieldErrors.input.includes(messagePart),
);

test('listPublicJobs requires a UUID organization', async () => {
    await rejectsInvalid(
        listPublicJobs(null, 'not-a-uuid'),
        'organizationId must be a UUID',
    );
});

test('submitPublicApplication validates input before opening a transaction', async () => {
    const base = {
        jobSlug: 'founding-engineer',
        reference: 'AG-0123456789AB',
        fullName: 'Test Applicant',
        email: 'applicant@example.com',
        professionalUrl: null,
        achievement: null,
        document: null,
    };
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            jobSlug: 'Bad Slug',
        }),
        'jobSlug is invalid',
    );
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            reference: 'AG-123',
        }),
        'reference must match',
    );
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            fullName: ' ',
        }),
        'fullName is required',
    );
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            email: 'not-an-email',
        }),
        'email must be a valid email address',
    );
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            unexpected: true,
        }),
        'input has an unknown key',
    );
});

test('submitPublicApplication validates the document descriptor', async () => {
    const base = {
        jobSlug: 'founding-engineer',
        reference: 'AG-0123456789AB',
        fullName: 'Test Applicant',
        email: 'applicant@example.com',
        professionalUrl: null,
        achievement: null,
    };
    const document = {
        sha256: 'ab'.repeat(32),
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        extension: 'pdf',
        bucket: 'cv-submissions',
        objectKey: 'cvs/job/cv.pdf',
        filename: 'cv.pdf',
    };
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            document: { ...document, sha256: 'xyz' },
        }),
        'document.sha256 must be 64 hex characters',
    );
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            document: { ...document, sizeBytes: 5 * 1024 * 1024 },
        }),
        'document.sizeBytes must be between 1 and 4 MiB',
    );
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            document: { ...document, mimeType: 'text/plain' },
        }),
        'document mime/extension combination is invalid',
    );
    await rejectsInvalid(
        submitPublicApplication(null, '00000000-0000-4000-8000-000000000001', {
            ...base,
            document: { ...document, objectKey: '  ' },
        }),
        'document.objectKey is required',
    );
});

test('submission ID occupies the intake request argument, not an identifier argument', async () => {
    const calls = [];
    const client = {
        query: async (sql, values) => {
            calls.push({ sql, values });
            return { rows: [{ result: { accepted: true } }] };
        },
        release() {},
    };
    const pool = { connect: async () => client };
    const submissionId = '00000000-0000-4000-8000-000000000042';
    await submitPublicApplication(pool, '00000000-0000-4000-8000-000000000001', {
        jobSlug: 'founding-engineer', reference: 'AG-0123456789AB',
        submissionId, fullName: 'Test Applicant', email: 'applicant@example.com',
        professionalUrl: null, achievement: null, document: null,
    });
    const call = calls.find(({ sql }) => sql.includes('app.submit_public_application_v1('));
    assert.equal(call.values[7], submissionId);
    assert.notEqual(call.values[3], submissionId);
});

test('rateLimitAllow admits up to the limit inside the window', () => {
    const options = { limit: 3, windowMs: 60_000, now: 1_000_000 };
    assert.equal(rateLimitAllow('k-unit-1', options), true);
    assert.equal(rateLimitAllow('k-unit-1', { ...options, now: 1_000_001 }), true);
    assert.equal(rateLimitAllow('k-unit-1', { ...options, now: 1_000_002 }), true);
    assert.equal(rateLimitAllow('k-unit-1', { ...options, now: 1_000_003 }), false);
    // A different key is unaffected.
    assert.equal(rateLimitAllow('k-unit-2', { ...options, now: 1_000_003 }), true);
    // Entries older than the window expire and free capacity.
    assert.equal(rateLimitAllow('k-unit-1', { ...options, now: 1_000_003 + 60_001 }), true);
});

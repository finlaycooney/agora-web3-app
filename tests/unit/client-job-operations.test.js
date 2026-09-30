import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { ClientJobContractError } from '../../src/lib/client-job-contracts.js';
import {
    createJobDraft,
    duplicateJob,
    duplicateJobUnlisted,
    saveClient,
    saveClientDraft,
} from '../../src/lib/client-job-operations.js';

test('operation wrappers return structured field errors before opening a transaction', async () => {
    await assert.rejects(
        saveClient(null, null, null, {
            clientId: 'not-a-uuid',
            expectedVersion: null,
            fields: {},
            operationId: '00000000-0000-4000-8000-000000000001',
        }),
        (error) => error instanceof ClientJobContractError
            && error.code === 'INVALID_INPUT'
            && error.fieldErrors.input === 'clientId must be a UUID',
    );
    await assert.rejects(
        saveClientDraft(null, null, null, {
            clientId: 'not-a-uuid',
            expectedVersion: null,
            fields: {},
            operationId: '00000000-0000-4000-8000-000000000001',
        }),
        (error) => error instanceof ClientJobContractError
            && error.code === 'INVALID_INPUT'
            && error.fieldErrors.input === 'clientId must be a UUID',
    );
});

const emptyJobFields = (title) => ({
    title,
    employmentType: null,
    workplaceMode: null,
    locations: [],
    remoteRegions: [],
    compensationMin: null,
    compensationMax: null,
    currency: null,
    payPeriod: null,
    bonuses: [],
    descriptionDocument: {
        type: 'doc',
        content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Synthetic description' }],
        }],
    },
});

test('createJobDraft rejects a non-boolean publiclyListed before opening a transaction', async () => {
    const pool = {
        connect: async () => {
            throw new Error('must not open a transaction');
        },
    };
    const base = {
        jobId: randomUUID(),
        revisionId: randomUUID(),
        clientId: randomUUID(),
        fields: emptyJobFields('Synthetic role'),
        operationId: randomUUID(),
    };
    for (const publiclyListed of [null, 'true', 1]) {
        await assert.rejects(
            createJobDraft(
                pool,
                {
                    provider: 'google',
                    issuer: 'https://accounts.google.com',
                    subject: '1002',
                },
                randomUUID(),
                { ...base, publiclyListed },
            ),
            (error) => error instanceof ClientJobContractError
                && error.code === 'INVALID_INPUT'
                && error.fieldErrors.input === 'publiclyListed must be a boolean',
        );
    }
});

test('createJobDraft sends the listing flag through create_job_draft_v2', async () => {
    const statements = [];
    const jobId = randomUUID();
    const revisionId = randomUUID();
    const clientId = randomUUID();
    const operationId = randomUUID();
    const pool = {
        connect: async () => ({
            release: () => {},
            query: async (text, params) => {
                statements.push({ text, params });
                if (text.includes('resolve_staff_principal_v1')) {
                    return { rows: [{
                        user_id: randomUUID(),
                        membership_id: randomUUID(),
                        role_id: randomUUID(),
                    }] };
                }
                if (text.includes('has_permission_v1')) {
                    return { rows: [{ allowed: true }] };
                }
                if (text.includes('create_job_draft_v2')) {
                    return {
                        rows: [{
                            result: {
                                status: 'created',
                                jobId,
                                revisionId,
                                version: '1',
                            },
                        }],
                    };
                }
                return { rows: [] };
            },
        }),
    };
    const result = await createJobDraft(
        pool,
        {
            provider: 'google',
            issuer: 'https://accounts.google.com',
            subject: '1002',
        },
        randomUUID(),
        {
            jobId,
            revisionId,
            clientId,
            fields: emptyJobFields('Listed synthetic role'),
            publiclyListed: true,
            operationId,
        },
    );
    assert.equal(result.status, 'created');
    const call = statements.find(({ text }) => text.includes('create_job_draft_v2'));
    assert.ok(call, 'the v2 procedure must be called');
    assert.equal(
        call.text,
        'select app.create_job_draft_v2($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::boolean,$6::uuid,$7::uuid) as result',
    );
    assert.equal(call.params[0], jobId);
    assert.equal(call.params[1], revisionId);
    assert.equal(call.params[2], clientId);
    assert.equal(call.params[4], true);
    assert.equal(call.params[5], operationId);
    assert.ok(
        !statements.some(({ text }) => text.includes('set_job_public_listing_v1')),
        'listing must be stored atomically, not through a second mutation',
    );
});

const duplicateInput = () => ({
    sourceRevisionId: randomUUID(),
    expectedSourceVersion: '2',
    clientId: randomUUID(),
    jobId: randomUUID(),
    revisionId: randomUUID(),
    operationId: randomUUID(),
});

for (const operation of [duplicateJob, duplicateJobUnlisted]) {
    test(`${operation.name} validates every ID, bigint version and known keys before connecting`, async () => {
        const pool = { connect: () => assert.fail('invalid input must not connect') };
        const input = duplicateInput();
        for (const key of [
            'sourceRevisionId', 'clientId', 'jobId', 'revisionId', 'operationId',
        ]) {
            for (const value of [null, 'invalid', 123]) {
                await assert.rejects(
                    operation(pool, null, null, { ...input, [key]: value }),
                    (error) => error instanceof ClientJobContractError,
                );
            }
        }
        for (const value of [null, 2, '0', '-1', '1.5', '9223372036854775808']) {
            await assert.rejects(
                operation(pool, null, null, { ...input, expectedSourceVersion: value }),
                (error) => error instanceof ClientJobContractError,
            );
        }
        await assert.rejects(
            operation(pool, null, null, { ...input, sql: 'client-controlled' }),
            (error) => error instanceof ClientJobContractError,
        );
    });

    test(`${operation.name} uses its fixed SQL and least-privilege permission checks`, async () => {
        const statements = [];
        const input = duplicateInput();
        const expected = { jobId: input.jobId, status: 'draft' };
        const pool = {
            connect: async () => ({
                release: () => {},
                query: async (text, params) => {
                    statements.push({ text, params });
                    if (text.includes('resolve_staff_principal_v1')) {
                        return { rows: [{
                            user_id: randomUUID(), membership_id: randomUUID(),
                            role_id: randomUUID(),
                        }] };
                    }
                    if (text.includes('has_permission_v1')) {
                        return { rows: [{ allowed: true }] };
                    }
                    return { rows: [{ result: expected }] };
                },
            }),
        };
        assert.deepEqual(await operation(pool, {
            provider: 'google', issuer: 'https://accounts.google.com', subject: '1002',
        }, randomUUID(), input), expected);
        const call = statements.find(({ text }) => text.includes('app.duplicate_job_'));
        assert.equal(call.text, operation === duplicateJobUnlisted
            ? 'select app.duplicate_job_v2($1::uuid,$2::bigint,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid) as result'
            : 'select app.duplicate_job_v1($1::uuid, $2::bigint, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid) as result');
        assert.deepEqual(call.params.slice(0, 6), [
            input.sourceRevisionId, input.expectedSourceVersion, input.clientId,
            input.jobId, input.revisionId, input.operationId,
        ]);
        assert.match(call.params[6], /^[0-9a-f-]{36}$/);
        assert.deepEqual(statements.filter(({ text }) => text.includes('has_permission_v1'))
            .map(({ params }) => params[0]), ['jobs.read', 'jobs.write', 'clients.read']);
        assert.equal(statements.filter(({ text }) => text.includes('app.duplicate_job_')).length, 1);
    });
}

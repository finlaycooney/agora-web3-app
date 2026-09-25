import assert from 'node:assert/strict';
import test from 'node:test';

import { ClientJobContractError } from '../../src/lib/client-job-contracts.js';
import { saveClient, saveClientDraft } from '../../src/lib/client-job-operations.js';

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

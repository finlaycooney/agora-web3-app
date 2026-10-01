import test from 'node:test';
import assert from 'node:assert/strict';
import { readTelegramJson, telegramErrorResponse, telegramFeatureResponse, telegramJson, telegramOriginAllowed } from '../../src/lib/telegram-intake-http.js';
import { ClientJobContractError } from '../../src/lib/client-job-contracts.js';
import { validateWorkerResult, telegramWorkerOperation } from '../../src/lib/telegram-worker-operations.js';
import { TELEGRAM_INDEX_VERSION } from '../../src/lib/telegram-intake-operations.js';

test('intake is disabled by default and private responses are not cached', () => {
    const previous = process.env.TELEGRAM_INTAKE_ENABLED;
    try {
        delete process.env.TELEGRAM_INTAKE_ENABLED;
        assert.equal(telegramFeatureResponse().status, 404);
        process.env.TELEGRAM_INTAKE_ENABLED = '1';
        assert.equal(telegramFeatureResponse(), null);
        assert.equal(telegramJson({}).headers.get('cache-control'), 'private, no-store');
    } finally {
        if (previous === undefined) delete process.env.TELEGRAM_INTAKE_ENABLED;
        else process.env.TELEGRAM_INTAKE_ENABLED = previous;
    }
});

test('staff mutations reject cross-site origins, including opaque origins', () => {
    const request = headers => new Request('https://app.example/api/staff/telegram-intake/drafts', { headers });
    assert.equal(telegramOriginAllowed(request({ origin: 'https://app.example' })), true);
    assert.equal(telegramOriginAllowed(request({})), true);
    assert.equal(telegramOriginAllowed(new Request('http://localhost:3000/api', { headers: { origin: 'https://app.example' } }), 'https://app.example'), true);
    assert.equal(telegramOriginAllowed(request({ origin: 'https://evil.example' }), 'https://app.example'), false);
    for (const headers of [{ origin: 'https://evil.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
        assert.equal(telegramOriginAllowed(request(headers)), false);
    }
});

test('bounded JSON rejects streamed oversize bodies, invalid JSON and nonobjects', async () => {
    const request = body => new Request('https://app.example', { method: 'POST', body });
    assert.deepEqual(await readTelegramJson(request('{"safe":true}')), { safe: true });
    for (const body of ['[]', 'null', 'no JSON', '"text"']) await assert.rejects(readTelegramJson(request(body)), ClientJobContractError);
    let cancelled = false;
    const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } });
    await assert.rejects(readTelegramJson(new Request('https://app.example', { method: 'POST', body, duplex: 'half' }), 10), ClientJobContractError);
    assert.equal(cancelled, true);
});

test('errors expose useful field feedback without private SQL or token details', async () => {
    const error = new ClientJobContractError({ cv: 'Attach a CV.' }); error.code = 'DRAFT_INCOMPLETE';
    const response = telegramErrorResponse(error);
    assert.equal(response.status, 422);
    assert.deepEqual((await response.json()).fields, { cv: 'Attach a CV.' });
    for (const [code, status] of [['FORBIDDEN', 403], ['UNAUTHORIZED', 401], ['40001', 409], ['P0002', 404], ['unknown', 503]]) {
        const response = telegramErrorResponse(Object.assign(new Error('private SQL and token'), { code }));
        assert.equal(response.status, status);
        assert.ok(!(await response.text()).includes('private SQL'));
    }
});

test('hosted worker rejects incompatible and unnormalized vectors before opening a database connection', async () => {
    const result = { indexVersion: TELEGRAM_INDEX_VERSION, embeddings: [Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0)] };
    assert.equal(validateWorkerResult(result), result);
    for (const invalid of [{ ...result, indexVersion: 'wrong' }, { ...result, embeddings: [[1]] }, { ...result, embeddings: [Array(384).fill(1)] }, { ...result, extra: true }]) {
        assert.throws(() => validateWorkerResult(invalid), ClientJobContractError);
    }
    const pool = { connect() { assert.fail('invalid input must not connect'); } };
    await assert.rejects(telegramWorkerOperation(pool, 'wrong', 'claim'), { code: '42501' });
    await assert.rejects(telegramWorkerOperation(pool, 'a'.repeat(64), 'complete', {}), ClientJobContractError);
});

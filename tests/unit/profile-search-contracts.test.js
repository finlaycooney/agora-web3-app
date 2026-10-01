import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { PROFILE_INDEX_VERSION, PROFILE_PROJECTION_VERSION, PROFILE_CHUNKER_VERSION, profileSearchStaffInput, profileSearchWorkerInput, validateProfileManifest, profileSearchCursor } from '../../src/lib/profile-search-contracts.js';
const hash = s => createHash('sha256').update(s).digest('hex');
const common = () => ({ jobId: randomUUID(), leaseToken: randomUUID(), indexVersion: PROFILE_INDEX_VERSION, projectionVersion: PROFILE_PROJECTION_VERSION, chunkerVersion: PROFILE_CHUNKER_VERSION });
test('search input rejects invalid Unicode and keeps explicit scope/readiness', () => {
    const input = { action: 'search', operationId: randomUUID(), query: '  backend engineer  ', scope: 'all', readyOnly: true };
    assert.equal(profileSearchStaffInput(input).query, 'backend engineer');
    for (const query of [' ', '\ud800', 'x'.repeat(2001), '\u0000']) assert.throws(() => profileSearchStaffInput({ ...input, query }));
    assert.throws(() => profileSearchStaffInput({ ...input, ownerUserId: randomUUID() }));
});
test('manifest proves exact complete UTF-8 partition and rejects omitted tail or split codepoint', () => {
    const text = 'Name: 王小明\nSummary: '.repeat(90) + 'critical final profile detail'; const bytes = Buffer.from(text);
    const split = Buffer.byteLength('Name: 王小明\nSummary: '.repeat(45));
    const chunks = [[0, split], [split, bytes.length]].map(([startByte, endByte], ordinal) => ({ ordinal, startByte, endByte, sha256: hash(bytes.subarray(startByte, endByte)), tokenCount: 448 }));
    const input = { ...common(), kind: 'plan', sourceRevision: 1, sourceSha256: hash(bytes), result: { byteLength: bytes.length, chunks } };
    assert.equal(validateProfileManifest(text, profileSearchWorkerInput('complete', input).result), input.result);
    assert.throws(() => profileSearchWorkerInput('complete', { ...input, result: { ...input.result, chunks: chunks.slice(0, 1) } }));
    const broken = { byteLength: bytes.length, chunks: [{ ordinal: 0, startByte: 0, endByte: 7, sha256: hash(bytes.subarray(0, 7)), tokenCount: 1 }, { ordinal: 1, startByte: 7, endByte: bytes.length, sha256: hash(bytes.subarray(7)), tokenCount: 1 }] };
    assert.throws(() => validateProfileManifest(text, broken));
    assert.throws(() => validateProfileManifest(text + 'tail', input.result));
});
test('normalized vector shape, staged batch identity and query-bound pagination are strict', () => {
    const input = { ...common(), kind: 'query', querySha256: 'a'.repeat(64), result: { embedding: Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0) } };
    assert.equal(profileSearchWorkerInput('complete', input), input);
    assert.throws(() => profileSearchWorkerInput('complete', { ...input, result: { embedding: Array(384).fill(1) } }));
    assert.throws(() => profileSearchWorkerInput('complete', { ...input, indexVersion: 'other' }));
    const c = { queryId: randomUUID(), score: 0.7, sourceType: 'candidate', sourceId: randomUUID() }; const cursor = Buffer.from(JSON.stringify(c)).toString('base64url');
    assert.deepEqual(profileSearchCursor(cursor, c.queryId), c); assert.throws(() => profileSearchCursor(cursor, randomUUID()));
});

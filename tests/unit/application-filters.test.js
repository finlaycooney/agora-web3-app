import assert from 'node:assert/strict';
import test from 'node:test';
import { filterApplicationRows } from '../../src/lib/application-filters.js';

const filters = { query: '', jobId: 'all', clientId: 'all', stage: 'all', review: false };
const rows = [
    { candidateName: 'Alice', clientId: 'a', clientName: 'Alpha', jobId: 'one', jobTitle: 'Engineer', stageId: 'review-id', stageKey: 'review', stageIsInitial: true, publicReference: 'REF1' },
    { candidateName: 'Bob', clientId: 'a', clientName: 'Alpha', jobId: 'two', jobTitle: 'Designer', stageId: 'interview-id', stageKey: 'interview', stageIsInitial: false, publicReference: 'REF2' },
    { candidateName: 'Carol', clientId: 'b', clientName: 'Beta', jobId: 'three', jobTitle: 'Engineer', stageId: 'review-id', stageKey: 'review', stageIsInitial: true, publicReference: 'REF3' },
];

test('a client without applications produces zero table rows and zero summary scope', () => {
    const selected = { ...filters, clientId: 'empty-client' };
    assert.deepEqual(filterApplicationRows(rows, selected), []);
    assert.deepEqual(filterApplicationRows(rows, selected, { includeStage: false }), []);
});

test('summary scope follows client, job, text and awaiting-review filters', () => {
    assert.equal(filterApplicationRows(rows, { ...filters, clientId: 'a' }).length, 2);
    assert.equal(filterApplicationRows(rows, { ...filters, clientId: 'a', jobId: 'two' }).length, 1);
    assert.equal(filterApplicationRows(rows, { ...filters, query: ' engineer ', clientId: 'a' }).length, 1);
    assert.equal(filterApplicationRows(rows, { ...filters, clientId: 'a', review: true }).length, 1);
    assert.equal(filterApplicationRows(rows, { ...filters, clientId: 'a', query: 'REF3' }).length, 0);
});

test('stage selection narrows the table but preserves the other stage-card counts', () => {
    const selected = { ...filters, clientId: 'a', stage: 'interview' };
    assert.deepEqual(filterApplicationRows(rows, selected).map(row => row.candidateName), ['Bob']);
    assert.equal(filterApplicationRows(rows, selected, { includeStage: false }).length, 2);
    assert.equal(filterApplicationRows(rows, { ...selected, stage: 'interview-id' }).length, 1);
});

test('unknown client/job IDs stay empty instead of silently dropping their filter', () => {
    assert.equal(filterApplicationRows(rows, { ...filters, clientId: 'foreign' }).length, 0);
    assert.equal(filterApplicationRows(rows, { ...filters, jobId: 'missing' }).length, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { jobStatusLabel } from '../../src/lib/job-display.js';

test('jobStatusLabel reports lifecycle states', () => {
    assert.equal(jobStatusLabel({ publicationState: 'draft' }), 'Draft');
    assert.equal(jobStatusLabel({ publicationState: 'archived' }), 'Archived');
    assert.equal(jobStatusLabel({ publicationState: 'withdrawn' }), 'Withdrawn');
});

test('jobStatusLabel reports board visibility only for published jobs', () => {
    assert.equal(
        jobStatusLabel({ publicationState: 'published', publiclyListed: true }),
        'Listed',
    );
    assert.equal(
        jobStatusLabel({ publicationState: 'published', publiclyListed: false }),
        'Unlisted',
    );
    assert.equal(
        jobStatusLabel({ publicationState: 'published' }),
        'Visibility unavailable',
    );
    assert.equal(
        jobStatusLabel({ publicationState: 'published', publiclyListed: null }),
        'Visibility unavailable',
    );
});

test('jobStatusLabel never labels a draft by its listing preference', () => {
    assert.equal(
        jobStatusLabel({ publicationState: 'draft', publiclyListed: true }),
        'Draft',
    );
    assert.equal(
        jobStatusLabel({ publicationState: 'archived', publiclyListed: true }),
        'Archived',
    );
});

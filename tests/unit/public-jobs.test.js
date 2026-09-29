import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import { mapPublicJob } from '../../src/lib/public-jobs.js';

const ORG = '9c4edd11-2571-490b-a87c-ef30b9e0a0b2';

const compiled = ts.transpileModule(
    readFileSync(
        new URL('../../src/lib/public-jobs.server.js', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

const STATIC_JOBS = [{ id: 'static-fallback', title: 'Static Fallback Role' }];

function loadServerHelper({ env = {}, pool }) {
    const exports = {};
    const logs = [];
    const imports = {
        'server-only': {},
        '../data/jobs': { JOBS: STATIC_JOBS },
        '@/lib/intake-db.server': { getIntakePool: () => pool ?? null },
        '@/lib/intake-operations': {
            listPublicJobs: async (_pool, organizationId) => {
                assert.equal(organizationId, ORG);
                const result = await pool.query();
                return result;
            },
        },
        '@/lib/public-jobs': { mapPublicJob },
    };
    runInNewContext(compiled, {
        exports,
        require: (name) => {
            assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
            return imports[name];
        },
        process: { env },
        console: {
            ...console,
            error: (...parts) => logs.push(parts.join(' ')),
        },
    });
    return { loadPublicJobs: exports.loadPublicJobs, logs };
}

test('mapPublicJob preserves the published document and timestamp verbatim', () => {
    const document = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Real role' }] }],
    };
    const mapped = mapPublicJob({
        slug: 'real-role',
        title: 'Real Role',
        company: { name: 'Real Client' },
        employmentType: 'full_time',
        workplaceMode: 'remote',
        locations: [],
        remoteRegions: ['Worldwide'],
        compensation: {
            min: '100000.00', max: '140000.00', currency: 'USD', payPeriod: 'year',
        },
        descriptionText: 'Plain summary',
        descriptionDocument: document,
        publishedAt: '2026-09-20T10:00:00.000Z',
        applicationOpen: true,
    });
    assert.equal(mapped.id, 'real-role');
    assert.equal(mapped.title, 'Real Role');
    assert.equal(mapped.company, 'Real Client');
    assert.deepEqual(mapped.descriptionDocument, document);
    assert.equal(mapped.publishedAt, '2026-09-20T10:00:00.000Z');
    assert.equal(mapped.applicationOpen, true);
    assert.equal(mapped.responsibilities, null, 'no fabricated responsibilities');
    assert.deepEqual(mapped.tags, [], 'no fabricated tags');
    assert.equal(mapped.className, 'md:col-span-1');
});

test('mapPublicJob tolerates missing document and timestamp', () => {
    const mapped = mapPublicJob({
        slug: 'sparse', title: 'Sparse', company: null,
        employmentType: null, workplaceMode: null,
        locations: null, remoteRegions: null, compensation: null,
        descriptionText: null, applicationOpen: true,
    });
    assert.equal(mapped.descriptionDocument, null);
    assert.equal(mapped.publishedAt, null);
    assert.equal(mapped.company, null);
    assert.equal(mapped.description, '');
});

test('loadPublicJobs returns the static fallback only outside production without config', async () => {
    const dev = loadServerHelper({ env: { NODE_ENV: 'development' } });
    const devResult = await dev.loadPublicJobs();
    assert.equal(devResult.unavailable, false);
    assert.equal(devResult.jobs, STATIC_JOBS);

    const prod = loadServerHelper({ env: { NODE_ENV: 'production' } });
    const prodResult = await prod.loadPublicJobs();
    assert.equal(prodResult.unavailable, true);
    assert.equal(prodResult.jobs.length, 0);
});

test('loadPublicJobs maps live rows and reports outages without falling back', async () => {
    const rows = [{
        slug: 'live-role',
        title: 'Live Role',
        company: { name: 'Live Client' },
        employmentType: 'full_time',
        workplaceMode: 'remote',
        locations: [],
        remoteRegions: ['Worldwide'],
        compensation: null,
        descriptionText: 'Live description',
        descriptionDocument: null,
        publishedAt: '2026-09-28T00:00:00.000Z',
        applicationOpen: true,
    }];
    const live = loadServerHelper({
        env: { NODE_ENV: 'production', STAFF_ORGANIZATION_ID: ORG },
        pool: { query: async () => ({ jobs: rows }) },
    });
    const listed = await live.loadPublicJobs();
    assert.equal(listed.unavailable, false);
    assert.equal(listed.jobs.length, 1);
    assert.equal(listed.jobs[0].id, 'live-role');
    assert.equal(listed.jobs[0].company, 'Live Client');
    assert.equal(listed.jobs[0].publishedAt, '2026-09-28T00:00:00.000Z');

    const failing = loadServerHelper({
        env: { NODE_ENV: 'development', STAFF_ORGANIZATION_ID: ORG },
        pool: {
            query: async () => {
                const error = new Error('connection refused detail');
                error.code = 'ECONNREFUSED';
                throw error;
            },
        },
    });
    const failed = await failing.loadPublicJobs();
    assert.equal(failed.unavailable, true);
    assert.equal(failed.jobs.length, 0);
    assert.ok(
        failing.logs.some((line) => line.includes('Public job listing failed:')),
        'outages must be logged with the safe error code',
    );
    assert.ok(
        failing.logs.some((line) => line.includes('ECONNREFUSED')),
        'the safe error code is logged',
    );
    assert.ok(
        !failing.logs.some((line) => line.includes('connection refused detail')),
        'raw error details must not be logged',
    );
});

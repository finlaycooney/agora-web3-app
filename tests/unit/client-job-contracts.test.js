import assert from 'node:assert/strict';
import test from 'node:test';
import {
    EMPTY_JOB_DOCUMENT,
    ClientJobContractError,
    jobDocumentText,
    normalizeJobDocument,
    validateClientDraftInput,
    validateClientInput,
    validateJobDraftInput,
    validateJobReadyInput,
} from '../../src/lib/client-job-contracts.js';

const CLIENT = {
    name: 'Acme Corp',
    contactName: 'Dana Example',
    contactEmail: 'dana@acme.example',
    telegramUsername: '@dana_ops',
    website: 'https://acme.example/careers',
    socialLinks: [
        { platform: 'linkedin', url: 'https://linkedin.com/company/acme' },
        { platform: 'x', url: 'https://x.com/acme' },
    ],
    isStealth: false,
    anonymousDescription: null,
};

const STEALTH_CLIENT = {
    ...CLIENT,
    isStealth: true,
    anonymousDescription: 'A synthetic stealth robotics company.',
};

const READY_DOC = {
    type: 'doc',
    content: [
        {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'About the role' }],
        },
        {
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Build ' },
                {
                    type: 'text',
                    text: 'products',
                    marks: [
                        { type: 'bold' },
                        { type: 'link', attrs: { href: 'https://acme.example/p' } },
                    ],
                },
                { type: 'hardBreak' },
                { type: 'text', text: 'with us' },
            ],
        },
        {
            type: 'bulletList',
            content: [
                {
                    type: 'listItem',
                    content: [
                        { type: 'paragraph', content: [{ type: 'text', text: 'First item' }] },
                        {
                            type: 'orderedList',
                            attrs: { start: 3 },
                            content: [{
                                type: 'listItem',
                                content: [{
                                    type: 'paragraph',
                                    content: [{ type: 'text', text: 'Nested' }],
                                }],
                            }],
                        },
                    ],
                },
            ],
        },
        {
            type: 'blockquote',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] },
            ],
        },
    ],
};

const JOB = {
    title: 'Staff Engineer',
    employmentType: 'full_time',
    workplaceMode: 'remote',
    locations: [],
    remoteRegions: ['Worldwide'],
    compensationMin: '120000.00',
    compensationMax: '180000.50',
    currency: 'USD',
    payPeriod: 'year',
    bonuses: [{ type: 'equity', details: 'Synthetic equity grant' }],
    descriptionDocument: READY_DOC,
};

const invalid = (fn, value, field) => assert.throws(
    () => fn(value),
    (error) => error instanceof ClientJobContractError
        && error.code === 'INVALID_INPUT'
        && (field === undefined || field in (error.fieldErrors ?? {})),
    `expected INVALID_INPUT${field ? ` for ${field}` : ''}`,
);

test('valid client inputs return canonical trimmed values', () => {
    const value = validateClientInput(CLIENT);
    assert.equal(value.telegramUsername, 'dana_ops', 'a single leading @ is stripped');
    assert.deepEqual(value.socialLinks, CLIENT.socialLinks);
    assert.equal(validateClientInput(STEALTH_CLIENT).isStealth, true);
    assert.equal(
        validateClientInput({ ...CLIENT, website: ' https://acme.example ' }).website,
        'https://acme.example',
    );
    assert.equal(
        validateClientInput({ ...CLIENT, website: 'acme.example/careers' }).website,
        'https://acme.example/careers',
    );
    assert.deepEqual(
        validateClientInput({
            ...CLIENT,
            socialLinks: [
                { platform: 'github', url: 'github.com/acme' },
                { platform: 'linkedin', url: 'www.linkedin.com/company/acme' },
                { platform: 'x', url: 'twitter.com/acme' },
            ],
        }).socialLinks,
        [
            { platform: 'github', url: 'https://github.com/acme' },
            { platform: 'linkedin', url: 'https://www.linkedin.com/company/acme' },
            { platform: 'x', url: 'https://twitter.com/acme' },
        ],
    );
});

test('client inputs reject malformed fields and unknown keys', () => {
    invalid(validateClientInput, { ...CLIENT, name: '' }, 'name');
    invalid(validateClientInput, { ...CLIENT, name: 'x'.repeat(257) }, 'name');
    invalid(validateClientInput, { ...CLIENT, contactEmail: 'not-an-email' }, 'contactEmail');
    invalid(validateClientInput, { ...CLIENT, contactEmail: 'a b@c.example' }, 'contactEmail');
    invalid(validateClientInput, { ...CLIENT, telegramUsername: '@@dana' }, 'telegramUsername');
    invalid(validateClientInput, { ...CLIENT, telegramUsername: 'ab' }, 'telegramUsername');
    invalid(validateClientInput, { ...CLIENT, website: 'ftp://acme.example' }, 'website');
    invalid(validateClientInput, { ...CLIENT, website: 'https://user:pw@acme.example' }, 'website');
    invalid(validateClientInput, { ...CLIENT, website: 'javascript:alert(1)' }, 'website');
    invalid(validateClientInput, {
        ...CLIENT,
        socialLinks: [{ platform: 'mastodon', url: 'https://m.example/@a' }],
    }, 'socialLinks[0].platform');
    invalid(validateClientInput, {
        ...CLIENT,
        socialLinks: [{ platform: 'github', url: 'linkedin.com/in/acme' }],
    }, 'socialLinks[0].url');
    invalid(validateClientInput, {
        ...CLIENT,
        socialLinks: [{ platform: 'linkedin', url: 'github.com/acme' }],
    }, 'socialLinks[0].url');
    invalid(validateClientInput, {
        ...CLIENT,
        socialLinks: [{ platform: 'x', url: 'facebook.com/acme' }],
    }, 'socialLinks[0].url');
    invalid(validateClientInput, {
        ...CLIENT,
        socialLinks: [
            { platform: 'x', url: 'https://x.com/a' },
            { platform: 'other', url: 'https://X.com/a' },
        ],
    }, 'socialLinks[1].url');
    invalid(validateClientInput, {
        ...CLIENT,
        socialLinks: [{ platform: 'x', url: 'https://x.com/a', extra: 1 }],
    });
    invalid(validateClientInput, { ...STEALTH_CLIENT, anonymousDescription: ' ' }, 'anonymousDescription');
    invalid(validateClientInput, { ...CLIENT, bogus: true }, 'bogus');
    invalid(validateClientInput, { ...CLIENT, constructor: { name: 'x' } });
    invalid(validateClientInput, null);
    invalid(validateClientInput, [CLIENT]);
});

test('client draft validation keeps valid fields and drops invalid optional values', () => {
    const draft = validateClientDraftInput({
        name: ' Draft Co ',
        contactName: ' Dana Draft ',
        contactEmail: 'not-an-email',
        telegramUsername: 'ab',
        website: 'draft.example',
        socialLinks: [
            { platform: 'github', url: 'linkedin.com/in/draft' },
            { platform: 'github', url: 'github.com/draft-co' },
            { platform: 'other', url: 'javascript:alert(1)' },
            { platform: 'other', url: 'draft.example/press' },
        ],
        isStealth: true,
        anonymousDescription: '',
    });
    assert.deepEqual(draft, {
        name: 'Draft Co',
        contactName: 'Dana Draft',
        contactEmail: null,
        telegramUsername: null,
        website: 'https://draft.example',
        socialLinks: [
            { platform: 'github', url: 'https://github.com/draft-co' },
            { platform: 'other', url: 'https://draft.example/press' },
        ],
        isStealth: true,
        anonymousDescription: null,
    });
    invalid(validateClientDraftInput, { ...CLIENT, name: '' }, 'name');
    invalid(validateClientDraftInput, { ...CLIENT, extra: true }, 'extra');
});

test('draft job inputs allow partial fields; ready inputs enforce completeness', () => {
    const draft = validateJobDraftInput({
        title: '  Partial draft  ',
        employmentType: null,
        workplaceMode: null,
        locations: [],
        remoteRegions: [],
        compensationMin: null,
        compensationMax: null,
        currency: null,
        payPeriod: null,
        bonuses: [],
        descriptionDocument: EMPTY_JOB_DOCUMENT,
    });
    assert.equal(draft.title, 'Partial draft');
    assert.equal(jobDocumentText(draft.descriptionDocument), '');
    assert.deepEqual(draft.descriptionDocument, {
        type: 'doc',
        content: [{ type: 'paragraph' }],
    });
    invalid(validateJobReadyInput, { ...JOB, employmentType: null }, 'employmentType');
    invalid(validateJobReadyInput, { ...JOB, remoteRegions: [] }, 'remoteRegions');
    invalid(validateJobReadyInput, {
        ...JOB, workplaceMode: 'onsite', remoteRegions: ['Europe'], locations: ['Berlin'],
    }, 'remoteRegions');
    invalid(validateJobReadyInput, {
        ...JOB, workplaceMode: 'onsite', remoteRegions: [], locations: [],
    }, 'locations');
    invalid(validateJobReadyInput, { ...JOB, currency: null }, 'currency');
    invalid(validateJobReadyInput, {
        ...JOB, descriptionDocument: EMPTY_JOB_DOCUMENT,
    }, 'descriptionDocument');
    const ready = validateJobReadyInput(JOB);
    assert.equal(ready.employmentType, 'full_time');
    assert.equal(
        jobDocumentText(ready.descriptionDocument),
        'About the role\nBuild products\nwith us\nFirst item\nNested\nQuoted',
    );
    const exact = validateJobReadyInput({ ...JOB, compensationMax: JOB.compensationMin });
    assert.equal(exact.compensationMin, exact.compensationMax);
});

test('job fields enforce enums, money, labels, bonuses and unknown keys', () => {
    invalid(validateJobDraftInput, { ...JOB, employmentType: 'seasonal' }, 'employmentType');
    invalid(validateJobDraftInput, { ...JOB, payPeriod: 'week' }, 'payPeriod');
    invalid(validateJobDraftInput, { ...JOB, currency: 'usd' }, 'currency');
    invalid(validateJobDraftInput, { ...JOB, currency: 'US1' }, 'currency');
    invalid(validateJobDraftInput, { ...JOB, compensationMin: '-1' }, 'compensationMin');
    invalid(validateJobDraftInput, { ...JOB, compensationMin: '1234567890123' }, 'compensationMin');
    invalid(validateJobDraftInput, { ...JOB, compensationMin: '1.234' }, 'compensationMin');
    invalid(validateJobDraftInput, {
        ...JOB, compensationMin: '100', compensationMax: '99.99',
    }, 'compensationMax');
    invalid(validateJobDraftInput, { ...JOB, compensationMin: 100 }, 'compensationMin');
    assert.deepEqual(
        validateJobDraftInput({ ...JOB, locations: ['berlin', 'New York'] }).locations,
        ['Berlin', 'New York'],
    );
    assert.equal(
        validateJobDraftInput({ ...JOB, remoteRegions: ['Worldwide'] }).remoteRegions[0],
        'Worldwide',
    );
    assert.equal(
        validateJobDraftInput({ ...JOB, bonuses: [{ type: 'other', details: 'Annual review' }] })
            .bonuses[0].type,
        'other',
    );
    invalid(validateJobDraftInput, { ...JOB, locations: ['Berlin', ' Berlin '] }, 'locations[1]');
    invalid(validateJobDraftInput, { ...JOB, locations: ['Not A Real Place'] }, 'locations[0]');
    invalid(validateJobDraftInput, { ...JOB, locations: Array(21).fill('x') }, 'locations');
    invalid(validateJobDraftInput, { ...JOB, locations: [''] }, 'locations[0]');
    invalid(validateJobDraftInput, {
        ...JOB,
        bonuses: [
            { type: 'cash', details: 'a' },
            { type: 'cash', details: 'b' },
        ],
    }, 'bonuses[1].type');
    invalid(validateJobDraftInput, { ...JOB, bonuses: [{ type: 'cash', details: '' }] });
    invalid(validateJobDraftInput, { ...JOB, title: 'x'.repeat(201) }, 'title');
    invalid(validateJobDraftInput, { ...JOB, extraField: 1 }, 'extraField');
    invalid(validateJobDraftInput, { ...JOB, hasOwnProperty: 'x' });
    invalid(validateJobDraftInput, 'job');
});

test('job documents normalize canonical structure and strip default link attrs', () => {
    const normalized = normalizeJobDocument({
        type: 'doc',
        content: [{
            type: 'paragraph',
            content: [{
                type: 'text',
                text: 'link',
                marks: [{
                    type: 'link',
                    attrs: { href: 'https://a.example', target: '_blank', rel: 'noopener', class: 'x' },
                }],
            }],
        }],
    });
    assert.deepEqual(normalized.content[0].content[0].marks, [
        { type: 'link', attrs: { href: 'https://a.example' } },
    ]);
    assert.equal(jobDocumentText(EMPTY_JOB_DOCUMENT), '');
    assert.equal(normalizeJobDocument(READY_DOC).type, 'doc');
});

test('job documents reject hostile shapes', () => {
    const doc = (content) => ({ type: 'doc', content });
    const para = (content) => ({ type: 'paragraph', content });
    const text = (value, marks) => ({ type: 'text', text: value, marks });
    invalid(normalizeJobDocument, null);
    invalid(normalizeJobDocument, { type: 'doc', content: 'x' });
    invalid(normalizeJobDocument, doc([]), 'descriptionDocument');
    invalid(normalizeJobDocument, doc([{ type: 'image' }]));
    invalid(normalizeJobDocument, doc([{ type: 'paragraph', content: [doc([])] }]));
    invalid(normalizeJobDocument, doc([para([{ type: 'paragraph' }])]));
    invalid(normalizeJobDocument, doc([para([text('')])]), 'descriptionDocument');
    invalid(normalizeJobDocument, doc([para([text('a', [{ type: 'script' }])])]));
    invalid(normalizeJobDocument, doc([para([text('a', [{ type: 'bold' }, { type: 'bold' }])])]));
    invalid(normalizeJobDocument, doc([para([text('a', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])])]));
    invalid(normalizeJobDocument, doc([para([text('a', [{ type: 'link', attrs: { href: 'data:text/html,x' } }])])]));
    invalid(normalizeJobDocument, doc([para([text('a', [{ type: 'link', attrs: { href: 'https://u:p@a.example' } }])])]));
    invalid(normalizeJobDocument, doc([para([text('a', [{ type: 'link' }])])]));
    invalid(normalizeJobDocument, doc([para([text('a', [{ type: 'bold', attrs: {} }])])]));
    invalid(normalizeJobDocument, doc([{ type: 'heading', attrs: { level: 1 }, content: [text('x')] }]));
    invalid(normalizeJobDocument, doc([{ type: 'heading', content: [text('x')] }]));
    invalid(normalizeJobDocument, doc([{ type: 'orderedList', attrs: { start: 0 }, content: [{ type: 'listItem', content: [para([text('x')])] }] }]));
    invalid(normalizeJobDocument, doc([{ type: 'orderedList', attrs: { start: 10001 }, content: [{ type: 'listItem', content: [para([text('x')])] }] }]));
    invalid(normalizeJobDocument, doc([{ type: 'bulletList', content: [para([text('x')])] }]));
    invalid(normalizeJobDocument, doc([{ type: 'listItem', content: [para([text('x')]), { type: 'bulletList', content: [{ type: 'listItem', content: [para([text('y')])] }] }] }]));
    invalid(normalizeJobDocument, doc([{ type: 'blockquote', content: [para([text('x')])], onClick: 'x' }]));
    invalid(normalizeJobDocument, doc([para([text('x')]), { type: 'text', text: 'top' }]));
    invalid(normalizeJobDocument, { type: 'doc', content: [{ __proto__: { polluted: true }, type: 'paragraph' }] });
    invalid(normalizeJobDocument, JSON.parse('{"type":"doc","content":[{"type":"paragraph","__proto__":{"x":1}}]}'));

    let deep = text('leaf');
    for (let i = 0; i < 14; i += 1) {
        deep = { type: 'blockquote', content: [deep] };
    }
    invalid(normalizeJobDocument, doc([deep]));

    const wide = doc(Array.from({ length: 2049 }, () => para([text('x')])));
    invalid(normalizeJobDocument, wide);

    const big = doc([para([text('x'.repeat(70000))])]);
    invalid(normalizeJobDocument, big);
});

test('jobDocumentText extracts plain text and rejects non-canonical input', () => {
    invalid(jobDocumentText, null, 'descriptionDocument');
    invalid(jobDocumentText, { type: 'doc', content: 'bad' }, 'descriptionDocument');
    assert.equal(
        jobDocumentText({
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
            ],
        }),
        'a\nb',
    );
    assert.equal(jobDocumentText(EMPTY_JOB_DOCUMENT), '');
});

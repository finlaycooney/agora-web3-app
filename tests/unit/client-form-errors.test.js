import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clientFieldMessage,
    mapClientFieldErrors,
} from '../../src/lib/client-form-errors.js';

test('scalar fields map reasons to human messages', () => {
    assert.equal(
        clientFieldMessage('name', 'required'), 'Enter a client name.');
    assert.equal(
        clientFieldMessage('contactName', 'required'), 'Enter a contact name.');
    assert.equal(
        clientFieldMessage('contactEmail', 'required'),
        'Enter a contact email.');
    assert.equal(
        clientFieldMessage('contactEmail', 'must be a simple email address'),
        'Enter a valid email address.');
    assert.equal(
        clientFieldMessage(
            'telegramUsername', 'must be a valid Telegram username'),
        'Use 5–32 letters, numbers or underscores, starting with a letter.'
            + ' @ is optional.');
    assert.equal(
        clientFieldMessage('website', 'must be a valid website URL'),
        'Enter a valid web address, such as https://example.com.');
    assert.equal(
        clientFieldMessage(
            'anonymousDescription', 'required for a stealth client'),
        'Add a public description for this stealth client.');
    assert.equal(
        clientFieldMessage('name', 'length must be 1..256'),
        'Enter a client name.');
    assert.equal(
        clientFieldMessage('mysteryField', 'some internal reason'),
        'Check this field.');
});

test('social row errors land on submitted row keys, not visible indexes', () => {
    const mapped = mapClientFieldErrors(
        {
            'socialLinks[0].url': 'must be a valid URL',
            'socialLinks[1].platform': 'unsupported platform',
            'socialLinks[2].url': 'must be a LinkedIn URL',
            'socialLinks[3].url': 'duplicate URL',
            'socialLinks[4]': 'must be an object',
        },
        ['key-a', 'key-b', 'key-c', 'key-d', 'key-e'],
    );
    assert.deepEqual({ ...mapped.fields }, {});
    assert.equal(mapped.rows.get('key-a').url,
        'Enter a valid web address, such as https://example.com.');
    assert.equal(mapped.rows.get('key-b').platform, 'Choose a platform.');
    assert.equal(mapped.rows.get('key-c').url,
        'Use a LinkedIn link, or choose Other.');
    assert.equal(mapped.rows.get('key-d').url, 'This link is already listed.');
    assert.equal(mapped.rows.get('key-e').url, 'Check this link.');
    assert.equal(mapped.group, null);
});

test('a blank first row shifts server indexes onto later visible rows', () => {
    const mapped = mapClientFieldErrors(
        { 'socialLinks[0].url': 'must be a GitHub URL' },
        ['key-second'],
    );
    assert.equal(mapped.rows.size, 1);
    assert.equal(mapped.rows.get('key-second').url,
        'Use a GitHub link, or choose Other.');
    assert.equal(mapped.rows.get('key-first'), undefined);
});

test('group-level and unknown social errors surface without internal keys', () => {
    const mapped = mapClientFieldErrors(
        { socialLinks: 'at most 8 entries' }, [],
    );
    assert.equal(mapped.group, 'Add up to 8 links.');
    const overIndex = mapClientFieldErrors(
        { 'socialLinks[9].url': 'must be a valid URL' }, ['key-a'],
    );
    assert.equal(overIndex.rows.size, 0,
        'an out-of-range submitted index must not attach to a row');
    assert.equal(overIndex.group, 'Check the social links.');
});

test('mixed scalar and row errors come back together', () => {
    const mapped = mapClientFieldErrors(
        {
            contactEmail: 'must be a simple email address',
            'socialLinks[0].url': 'must be a valid URL',
        },
        ['key-only'],
    );
    assert.equal(mapped.fields.contactEmail, 'Enter a valid email address.');
    assert.equal(mapped.rows.get('key-only').url,
        'Enter a valid web address, such as https://example.com.');
});

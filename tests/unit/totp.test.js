import assert from 'node:assert/strict';
import test from 'node:test';
import {
    base32Decode,
    base32Encode,
    generateTotpSecret,
    matchTotpCode,
    totpCode,
    totpUri,
} from '../../src/lib/totp.js';
import {
    createStaffMfaProof,
    readStaffMfaProof,
} from '../../src/lib/staff-mfa-cookie.js';
import { createHmac } from 'node:crypto';

const RFC_KEY_ASCII = '12345678901234567890';
const RFC_KEY_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('base32 round-trips and produces the expected alphabet', () => {
    assert.equal(base32Encode(Buffer.from(RFC_KEY_ASCII, 'ascii')), RFC_KEY_BASE32);
    assert.deepEqual(base32Decode(RFC_KEY_BASE32), Buffer.from(RFC_KEY_ASCII, 'ascii'));
    assert.throws(() => base32Decode('not-valid-!'));
});

test('generateTotpSecret returns a 32-character base32 secret', () => {
    const secret = generateTotpSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.equal(base32Decode(secret).length, 20);
});

test('totpCode matches RFC 6238 SHA-1 test vectors (8 digits)', () => {
    assert.equal(totpCode(RFC_KEY_BASE32, 1, 8), '94287082');          // T = 59s
    assert.equal(totpCode(RFC_KEY_BASE32, 37037036, 8), '07081804');   // T = 1111111109
    assert.equal(totpCode(RFC_KEY_BASE32, 41152263, 8), '89005924');   // T = 1234567890
});

test('matchTotpCode returns the matching counter and rejects bad codes', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const counter = Math.floor(now / 1000 / 30);
    const code = totpCode(secret, counter);
    assert.equal(matchTotpCode(secret, code, { timestampMs: now }), counter);
    assert.equal(matchTotpCode(secret, '000000', { timestampMs: now }) === counter
        || matchTotpCode(secret, '000000', { timestampMs: now }) === null, true);
    assert.equal(matchTotpCode(secret, 'abcdef', { timestampMs: now }), null);
    assert.equal(matchTotpCode(secret, '12345', { timestampMs: now }), null);
    // Drift window: previous step's code still matches within window 1.
    const previous = totpCode(secret, counter - 1);
    if (previous !== code) {
        assert.equal(matchTotpCode(secret, previous, { timestampMs: now }), counter - 1);
        assert.equal(matchTotpCode(secret, previous, { timestampMs: now, window: 0 }), null);
    }
});

test('totpUri builds a standards-compliant otpauth URI', () => {
    const uri = totpUri({ secret: 'ABC123', accountName: 'op@example.com' });
    assert.match(uri, /^otpauth:\/\/totp\/Agora:op%40example\.com\?secret=ABC123&issuer=Agora$/);
});

test('staff MFA proof round-trips and binds to subject/user/credential', () => {
    const secret = 'test-secret';
    const binding = { subject: '117', userId: 'u-1', credentialId: 'c-1' };
    const proof = createStaffMfaProof(secret, binding);
    assert.ok(readStaffMfaProof(secret, proof, binding));
    assert.equal(readStaffMfaProof(secret, proof, { ...binding, subject: '118' }), null);
    assert.equal(readStaffMfaProof(secret, proof, { ...binding, userId: 'u-2' }), null);
    assert.equal(readStaffMfaProof(secret, proof, { ...binding, credentialId: 'c-2' }), null);
    assert.equal(readStaffMfaProof('other-secret', proof, binding), null);
    assert.equal(readStaffMfaProof(secret, `${proof}x`, binding), null);
    assert.equal(readStaffMfaProof(secret, 'garbage', binding), null);
});

test('expired staff MFA proofs are rejected', () => {
    const secret = 'test-secret';
    const body = Buffer.from(JSON.stringify({ s: '117', u: 'u-1', c: 'c-1', exp: Date.now() - 1 }))
        .toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    assert.equal(
        readStaffMfaProof(secret, `${body}.${signature}`, {
            subject: '117', userId: 'u-1', credentialId: 'c-1',
        }),
        null,
    );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { generateBackupCodes, hashBackupCode, normalizeBackupCode } from '../../src/lib/staff-backup-codes.js';

test('backup sets contain ten unique random 128-bit codes and only credential-bound hashes', () => {
    const a = generateBackupCodes('credential-a');
    const b = generateBackupCodes('credential-a');
    assert.equal(a.codes.length, 10);
    assert.equal(new Set(a.codes).size, 10);
    for (const [i, code] of a.codes.entries()) {
        assert.match(code, /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);
        assert.match(a.hashes[i], /^[a-f0-9]{64}$/);
        assert.equal(hashBackupCode('credential-a', code.toLowerCase()), a.hashes[i]);
        assert.notEqual(hashBackupCode('credential-b', code), a.hashes[i]);
        assert.notEqual(a.hashes[i], normalizeBackupCode(code));
    }
    assert.equal(a.codes.filter((code) => b.codes.includes(code)).length, 0);
});

test('normalization accepts copied formatting and rejects malformed, partial and oversized codes', () => {
    const normalized = '0123456789abcdef0123456789abcdef';
    assert.equal(normalizeBackupCode(' 01234567-89ABCDEF-01234567-89ABCDEF '), normalized);
    for (const value of [null, 123, '', '123456', 'z'.repeat(32), 'a'.repeat(65)]) {
        assert.equal(normalizeBackupCode(value), null);
        assert.equal(hashBackupCode('credential', value), null);
    }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STAFF_IDENTITY_ISSUER,
    STAFF_IDENTITY_PROVIDER,
    staffIdentityFromSession,
} from '../../src/lib/staff-identity.js';

test('staffIdentityFromSession maps a Google session to the resolver identity', () => {
    const identity = staffIdentityFromSession({
        provider: 'google',
        subject: '117755567890123456789',
        user: { email: 'operator@example.com' },
    });
    assert.deepEqual(identity, {
        provider: STAFF_IDENTITY_PROVIDER,
        issuer: STAFF_IDENTITY_ISSUER,
        subject: '117755567890123456789',
    });
});

test('staffIdentityFromSession rejects GitHub sessions — applicant identities never resolve staff access', () => {
    assert.equal(staffIdentityFromSession({ provider: 'github', subject: '12345678' }), null);
});

test('staffIdentityFromSession rejects missing or malformed sessions', () => {
    assert.equal(staffIdentityFromSession(null), null);
    assert.equal(staffIdentityFromSession({}), null);
    assert.equal(staffIdentityFromSession({ provider: 'google' }), null);
    for (const subject of ['', '0', '0123', 'abc', '123456789012345678901234', 12345, null]) {
        assert.equal(staffIdentityFromSession({ provider: 'google', subject }), null, `subject=${subject}`);
    }
});

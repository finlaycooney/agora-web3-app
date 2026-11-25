import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STAFF_IDENTITY_ISSUER,
    STAFF_EMAIL_DOMAIN,
    STAFF_IDENTITY_PROVIDER,
    staffEmailDomainAllowed,
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

test('staffEmailDomainAllowed admits only Google-verified @agora4.xyz emails', () => {
    assert.equal(STAFF_EMAIL_DOMAIN, 'agora4.xyz');
    const session = (email, emailVerified = true) => ({
        provider: 'google', subject: '117755567890123456789', emailVerified, user: { email },
    });
    assert.equal(staffEmailDomainAllowed(session('fin@agora4.xyz')), true);
    assert.equal(staffEmailDomainAllowed(session('Fin@AGORA4.XYZ')), true);
    for (const email of [
        'fin@gmail.com',
        'fin@staff.agora4.xyz',
        'fin@agora4.xyz.evil.com',
        'fin@notagora4.xyz',
        'agora4.xyz@gmail.com',
        'fin@agora4.xyz@gmail.com',
        '',
        null,
    ]) {
        assert.equal(staffEmailDomainAllowed(session(email)), false, `email=${email}`);
    }
    assert.equal(staffEmailDomainAllowed(session('fin@agora4.xyz', false)), false, 'unverified email');
    assert.equal(staffEmailDomainAllowed({ provider: 'google', user: { email: 'fin@agora4.xyz' } }), false, 'missing verification');
    assert.equal(staffEmailDomainAllowed(null), false);
    assert.equal(staffEmailDomainAllowed({ provider: 'google', emailVerified: true }), false);
});

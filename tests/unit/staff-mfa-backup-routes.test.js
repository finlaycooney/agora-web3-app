import assert from 'node:assert/strict';
import test from 'node:test';
import { stubModule, setRouteStub, installRouteMocks } from '../support/staff-route-mocks.js';

stubModule('@/lib/staff-mfa.server', Object.fromEntries([
    'consumeBackupCode', 'getTotpStatus', 'recordTotpUse', 'verifyTotpCode',
    'confirmTotpEnrollment', 'replaceBackupCodes',
].map((name) => [name, 'fn'])));
stubModule('@/lib/staff-mfa-http.server', Object.fromEntries([
    'staffMfaContext', 'issueMfaProof', 'mfaJson', 'mfaFailure',
].map((name) => [name, 'fn'])));
installRouteMocks();
const verify = await import('../../src/app/api/staff/mfa/verify/route.ts');
const enroll = await import('../../src/app/api/staff/mfa/enroll/route.ts');
const generate = await import('../../src/app/api/staff/mfa/backup-codes/route.ts');

function mocks({ denied, accepted = true, credentialStatus = 'active', outage = false } = {}) {
    const calls = [];
    setRouteStub((module, name, args) => {
        calls.push({ name, args });
        if (name === 'staffMfaContext') return denied ? { denied: Response.json({}, { status: denied }) }
            : { pool: {}, identity: { subject: '123' }, organizationId: 'org' };
        if (name === 'getTotpStatus') {
            if (outage) throw new Error('DB unavailable');
            return { status: credentialStatus, credentialId: 'credential', secret: 'secret', lastUsedCounter: 41 };
        }
        if (name === 'consumeBackupCode') return accepted;
        if (name === 'verifyTotpCode') return args[1] === '123456' ? 42 : null;
        if (name === 'issueMfaProof') return true;
        if (name === 'confirmTotpEnrollment' || name === 'replaceBackupCodes') return Array(10).fill('SYNTHETIC');
        if (name === 'mfaJson') return Response.json(args[0], { status: args[1] ?? 200 });
        if (name === 'mfaFailure') return Response.json({}, { status: 503 });
        if (name === 'recordTotpUse') return;
        assert.fail(`Unexpected ${module} ${name}`);
    });
    return calls;
}
const request = (body) => new Request('http://localhost/api/staff/mfa/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('backup verification consumes once before issuing the bound MFA proof', async () => {
    const calls = mocks();
    assert.equal((await verify.POST(request({ method: 'backup', code: 'saved-code' }))).status, 200);
    assert.deepEqual(calls.filter(({ name }) => ['consumeBackupCode', 'issueMfaProof', 'recordTotpUse'].includes(name))
        .map(({ name }) => name), ['consumeBackupCode', 'issueMfaProof']);
    assert.equal(calls.find(({ name }) => name === 'consumeBackupCode').args[4], 'saved-code');
});

test('invalid/used backup code never issues an MFA cookie', async () => {
    const calls = mocks({ accepted: false });
    const response = await verify.POST(request({ method: 'backup', code: 'used-code' }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'invalid backup code');
    assert.equal(calls.some(({ name }) => name === 'issueMfaProof'), false);
});

for (const denied of [401, 403, 429, 503]) {
    test(`context denial ${denied} prevents all verification, enrollment and generation`, async () => {
        for (const route of [verify, enroll, generate]) {
            const calls = mocks({ denied });
            assert.equal((await route.POST(request({ code: '123456' }))).status, denied);
            assert.deepEqual(calls.map(({ name }) => name), ['staffMfaContext']);
        }
    });
}

test('enrollment returns backup codes only after atomic activation and proof creation', async () => {
    const calls = mocks({ credentialStatus: 'pending' });
    const response = await enroll.POST(request({ code: '123456' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).backupCodes.length, 10);
    assert.equal(calls.find(({ name }) => name === 'confirmTotpEnrollment').args[4], 42);
});

test('generation requires a fresh TOTP and cannot use a backup code or stale session alone', async () => {
    const calls = mocks();
    assert.equal((await generate.POST(request({ code: 'saved-backup-code' }))).status, 401);
    assert.equal(calls.some(({ name }) => name === 'replaceBackupCodes'), false);
    assert.equal((await generate.POST(request({ code: '123456' }))).status, 200);
    assert.equal(calls.find(({ name }) => name === 'replaceBackupCodes').args[4], 42);
});

test('a service outage returns retryable 503 rather than consuming codes or declaring them invalid', async () => {
    const calls = mocks({ outage: true });
    assert.equal((await verify.POST(request({ code: '123456' }))).status, 503);
    assert.equal(calls.some(({ name }) => name === 'issueMfaProof' || name === 'consumeBackupCode'), false);
});

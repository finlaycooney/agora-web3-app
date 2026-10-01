import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, publicEncrypt, constants } from 'node:crypto';
import test from 'node:test';
import { validateConnectorPublicKey, validateTelegramConnectionAction, validateTelegramConnectionReport } from '../../src/lib/telegram-connection-contracts.js';

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const connectionId = randomUUID(); const challengeId = randomUUID(); const leaseToken = randomUUID();
const base = { connectionId, generation: 1, leaseToken };
test('connector only accepts canonical RSA2048/e65537 public SPKI', () => {
    assert.equal(validateConnectorPublicKey(spki), spki);
    for (const invalid of ['', spki.slice(0, -1), 'A'.repeat(392), publicKey.export({ format: 'pem', type: 'spki' })]) assert.throws(() => validateConnectorPublicKey(invalid));
    const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 3 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    assert.throws(() => validateConnectorPublicKey(wrongKey));
});
test('staff password contract accepts only encrypted bound submission and never plaintext/extra fields', () => {
    const ciphertext = publicEncrypt({ key: publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepLabel: Buffer.from(`agora-telegram:${connectionId}:1:${challengeId}`) }, Buffer.from('synthetic-password')).toString('base64');
    const input = { action: 'password', connectionId, generation: 1, challengeId, ciphertext };
    assert.deepEqual(validateTelegramConnectionAction(input), input);
    for (const invalid of [{ ...input, ciphertext: 'synthetic-password' }, { ...input, password: 'synthetic-password' }, { ...input, generation: 0 }, { ...input, connectionId: 'arbitrary' }]) assert.throws(() => validateTelegramConnectionAction(invalid));
    try { validateTelegramConnectionAction({ ...input, ciphertext: 'synthetic-password' }); } catch (error) {
        assert.ok(!JSON.stringify(error).includes('synthetic-password'));
    }
});
test('QR report is Telegram-only, short-lived and requires matching-shape challenge', () => {
    const now = Date.now();
    const input = { ...base, status: 'qr_pending', challengeId, qrLoginUrl: 'tg://login?token=abc123_-', qrExpiresAt: new Date(now + 30000).toISOString() };
    assert.equal(validateTelegramConnectionReport(input, now).report.qrLoginUrl, input.qrLoginUrl);
    for (const patch of [{ qrLoginUrl: 'https://evil.test' }, { qrLoginUrl: 'tg://login?token=abc&url=evil' }, { qrExpiresAt: new Date(now - 1000).toISOString() }, { qrExpiresAt: new Date(now + 121000).toISOString() }, { challengeId: null }, { rawSession: 'secret' }]) assert.throws(() => validateTelegramConnectionReport({ ...input, ...patch }, now));
});
test('reports constrain profile identifiers, hint, error code and password acknowledgement', () => {
    const input = { ...base, status: 'connected', profile: { telegramUserId: '900719925474099399', username: 'sample_user', displayName: 'Synthetic Person' } };
    assert.deepEqual(validateTelegramConnectionReport(input).report.profile, input.profile);
    for (const patch of [{ profile: { ...input.profile, telegramUserId: 123 } }, { profile: { ...input.profile, session: 'secret' } }, { errorCode: 'raw provider error' }, { passwordSubmissionId: 'invalid' }]) assert.throws(() => validateTelegramConnectionReport({ ...input, ...patch }));
    const acknowledged = { ...base, status: 'awaiting_password', challengeId, passwordSubmissionId: randomUUID(), errorCode: 'PASSWORD_INVALID' };
    assert.equal(validateTelegramConnectionReport(acknowledged).report.passwordSubmissionId, acknowledged.passwordSubmissionId);
    assert.throws(() => validateTelegramConnectionReport({ ...acknowledged, passwordHint: 'x\nsecret' }));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { googleRefreshGrantStatus } from '../../src/lib/staff-google-check.js';

const deps = (fetchImpl) => ({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl,
});

const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

test('a successful refresh grant means the credential is active', async () => {
    const seen = [];
    const status = await googleRefreshGrantStatus('rt-123', deps(async (url, init) => {
        seen.push({ url, init });
        return jsonResponse(200, { access_token: 'x', expires_in: 3600 });
    }));
    assert.equal(status, 'active');
    assert.equal(seen[0].url, 'https://oauth2.googleapis.com/token');
    const params = new URLSearchParams(seen[0].init.body);
    assert.equal(params.get('grant_type'), 'refresh_token');
    assert.equal(params.get('refresh_token'), 'rt-123');
    assert.equal(params.get('client_id'), 'client-id');
});

test('invalid_grant means the credential is revoked — suspended accounts fail closed', async () => {
    for (const status of [400, 401]) {
        const result = await googleRefreshGrantStatus('rt', deps(async () =>
            jsonResponse(status, { error: 'invalid_grant' })));
        assert.equal(result, 'revoked', `status ${status}`);
    }
});

test('other error responses and transport failures fail open', async () => {
    for (const fetchImpl of [
        async () => jsonResponse(400, { error: 'invalid_client' }),
        async () => jsonResponse(403, { error: 'access_denied' }),
        async () => jsonResponse(500, {}),
        async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }),
        async () => { throw new Error('network down'); },
    ]) {
        assert.equal(await googleRefreshGrantStatus('rt', deps(fetchImpl)), 'unknown');
    }
});

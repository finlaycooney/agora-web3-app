'use strict';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SYNTHETIC_REFRESH_TOKEN = 'SYNTHETIC-WORKSPACE-TEST';
const SYNTHETIC_CLIENT_ID = 'synthetic-workspace-client';

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === GOOGLE_TOKEN_URL) {
        const params = new URLSearchParams(
            init?.body == null ? '' : String(init.body));
        if (params.get('grant_type') === 'refresh_token'
            && params.get('refresh_token') === SYNTHETIC_REFRESH_TOKEN
            && params.get('client_id') === SYNTHETIC_CLIENT_ID) {
            return new Response(JSON.stringify({
                access_token: 'synthetic-access-token',
                expires_in: 3600,
                scope: 'openid email profile',
                token_type: 'Bearer',
                id_token: 'synthetic-id-token',
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        return new Response(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'staff-workspace test harness blocked this request',
        }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
        });
    }
    return realFetch(input, init);
};

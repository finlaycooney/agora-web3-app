// Pure Google credential liveness check, kept free of server-only imports so
// it stays unit-testable. The staff gate and API context call this with the
// session's Google refresh token.
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Runs a refresh_token grant. Returns 'active' when Google accepts the
 * credential, 'revoked' on invalid_grant (suspended/deleted account or a
 * revoked grant), and 'unknown' for anything else — network failures and
 * client misconfigurations fail open so a Google outage cannot lock out the
 * workspace, while explicit revocation fails closed.
 */
export async function googleRefreshGrantStatus(refreshToken, {
    clientId,
    clientSecret,
    fetchImpl = fetch,
    timeoutMs = 5000,
} = {}) {
    let response;
    try {
        response = await fetchImpl(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId ?? '',
                client_secret: clientSecret ?? '',
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
        });
    } catch {
        return 'unknown';
    }
    if (response.ok) {
        return 'active';
    }
    const body = await response.json().catch(() => null);
    if ((response.status === 400 || response.status === 401)
        && body?.error === 'invalid_grant') {
        return 'revoked';
    }
    return 'unknown';
}

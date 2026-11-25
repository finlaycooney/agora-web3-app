import 'server-only';
import { cookies } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import { googleRefreshGrantStatus } from './staff-google-check';

// Staff sessions carry a Google refresh token (minted with access_type=offline).
// Each staff request re-verifies that credential against Google's token
// endpoint so a suspended or deleted Google account loses staff access on its
// next request instead of riding out the session/MFA cookie TTLs.
//
// Outcomes are cached briefly per credential — enough to absorb a burst of
// page loads, short enough that a Workspace suspension propagates within a
// minute inside a warm instance.
const CHECK_INTERVAL_MS = 60_000;
const SESSION_COOKIE = 'next-auth.session-token';

// credential key -> { status, at }. Keying by the refresh-token tail (not just
// the subject) means a re-login after revocation re-checks immediately instead
// of hitting a stale 'revoked' entry.
const outcomes = new Map();

async function readStaffToken() {
    const cookieStore = await cookies();
    const jar = {};
    for (const cookie of cookieStore.getAll()) {
        jar[cookie.name] = cookie.value;
    }
    try {
        return await getToken({
            req: { cookies: jar },
            secret: process.env.NEXTAUTH_SECRET,
            cookieName: SESSION_COOKIE,
        });
    } catch {
        return null;
    }
}

/** @returns {Promise<'active' | 'revoked' | 'unknown'>} */
export async function staffGoogleCredentialStatus(subject) {
    const token = await readStaffToken();
    const refreshToken = typeof token?.googleRefreshToken === 'string'
        ? token.googleRefreshToken
        : null;
    const key = `${subject}:${refreshToken ? refreshToken.slice(-8) : 'none'}`;
    const cached = outcomes.get(key);
    if (cached && Date.now() - cached.at < CHECK_INTERVAL_MS) {
        return cached.status;
    }
    // A session without an offline credential predates this check (or lost the
    // grant); deny until the member re-authenticates and mints a fresh one.
    const status = refreshToken
        ? await googleRefreshGrantStatus(refreshToken, {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })
        : 'revoked';
    outcomes.set(key, { at: Date.now(), status });
    if (outcomes.size > 1000) {
        outcomes.clear();
    }
    return status;
}

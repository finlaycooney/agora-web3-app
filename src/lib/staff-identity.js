// Staff identity contract — must match supabase/migrations/20260922131000_staff_google_identities.sql.
// GitHub identities may exist in app.auth_identities for applicants, but they can
// never resolve to a staff principal: this seam accepts Google only.

export const STAFF_IDENTITY_PROVIDER = 'google';
export const STAFF_IDENTITY_ISSUER = 'https://accounts.google.com';
export const STAFF_SUBJECT_PATTERN = /^[1-9][0-9]{0,20}$/;
export const STAFF_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Maps a NextAuth session onto the resolver identity, or returns null when the
// session cannot represent a staff principal.
export function staffIdentityFromSession(session) {
    if (!session || session.provider !== STAFF_IDENTITY_PROVIDER) {
        return null;
    }
    const subject = session.subject;
    if (typeof subject !== 'string' || !STAFF_SUBJECT_PATTERN.test(subject)) {
        return null;
    }
    return {
        provider: STAFF_IDENTITY_PROVIDER,
        issuer: STAFF_IDENTITY_ISSUER,
        subject,
    };
}

// Returns the session email only when Google attested it (email_verified) —
// that is what makes it safe to use as an invite-claim key. Anything else
// returns null so the caller falls back to plain resolution.
export function staffInviteEmailFromSession(session) {
    const email = session?.user?.email;
    if (session?.emailVerified !== true
        || typeof email !== 'string'
        || email.length > 320
        || !STAFF_EMAIL_PATTERN.test(email)) {
        return null;
    }
    return email;
}

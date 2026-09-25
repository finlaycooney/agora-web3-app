import { createHmac, timingSafeEqual } from 'node:crypto';

export const STAFF_MFA_COOKIE = 'staff_mfa';
export const STAFF_MFA_TTL_MS = 12 * 60 * 60 * 1000;

// A staff-MFA proof is an HMAC-signed payload bound to the Google subject,
// resolved user and TOTP credential. It is deliberately independent of the
// NextAuth session so a Google session refresh cannot silently extend it.
export function createStaffMfaProof(secret, { subject, userId, credentialId }) {
    const payload = {
        s: subject,
        u: userId,
        c: credentialId,
        exp: Date.now() + STAFF_MFA_TTL_MS,
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

export function readStaffMfaProof(secret, value, { subject, userId, credentialId }) {
    if (typeof value !== 'string' || !value.includes('.')) {
        return null;
    }
    const [body, signature] = value.split('.');
    const expected = createHmac('sha256', secret).update(body).digest('base64url');
    const given = Buffer.from(signature ?? '', 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
        return null;
    }
    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
        return null;
    }
    if (payload.s !== subject || payload.u !== userId || payload.c !== credentialId) {
        return null;
    }
    return payload;
}

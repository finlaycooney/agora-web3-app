import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';
import { staffIdentityFromSession, staffInviteEmailFromSession } from './staff-identity';
import { getStaffPool, resolveOrClaimStaffPrincipal } from './staff-db.server';
import { getTotpStatus } from './staff-mfa.server';
import { STAFF_MFA_COOKIE, readStaffMfaProof } from './staff-mfa-cookie';

/**
 * @typedef {{ provider: string, issuer: string, subject: string }} StaffGateIdentity
 * @typedef {{ user_id: string, membership_id: string, role_id: string }} StaffGatePrincipal
 * @typedef {import('next-auth').Session} StaffGateSession
 * @typedef {import('pg').Pool} StaffGatePool
 * @typedef {{ status: string, credentialId?: string, secret?: string } | null} StaffGateTotp
 * @typedef {{ stage: 'resolved' | 'mfa-pending' | 'verified', session: StaffGateSession,
 *   identity: StaffGateIdentity, principal: StaffGatePrincipal, totp: StaffGateTotp,
 *   pool: StaffGatePool, organizationId: string }} StaffGateResolved
 * @typedef {{ stage: 'signed-out' }
 *   | { stage: 'unresolved', session: StaffGateSession, identity: StaffGateIdentity }
 *   | StaffGateResolved} StaffGateResult
 */

// One server-side gate for every staff surface. Stages:
//   signed-out   → no session or non-Google provider
//   unresolved   → Google identity with no active staff membership
//   resolved     → active principal, but TOTP not yet active
//   mfa-pending  → active credential without a valid staff_mfa proof
//   verified     → full gate satisfied (session + principal + MFA proof)
/** @returns {Promise<StaffGateResult>} */
export async function staffGate() {
    const session = await getServerSession(authOptions);
    const identity = staffIdentityFromSession(session);
    if (!identity) {
        return { stage: 'signed-out' };
    }

    const pool = getStaffPool();
    const organizationId = process.env.STAFF_ORGANIZATION_ID;
    if (!pool || !organizationId) {
        return { stage: 'unresolved', session, identity };
    }

    let principal = null;
    let totp = null;
    try {
        principal = await resolveOrClaimStaffPrincipal(
            pool, identity, staffInviteEmailFromSession(session), organizationId);
        if (principal) {
            totp = await getTotpStatus(pool, identity, organizationId);
        }
    } catch (error) {
        console.error('staff gate resolution failed', error);
        principal = null;
    }
    if (!principal) {
        return { stage: 'unresolved', session, identity };
    }

    const base = { session, identity, principal, totp, pool, organizationId };
    if (!totp || totp.status !== 'active') {
        return { stage: 'resolved', ...base };
    }
    const cookieStore = await cookies();
    const proof = readStaffMfaProof(
        process.env.NEXTAUTH_SECRET,
        cookieStore.get(STAFF_MFA_COOKIE)?.value,
        {
            subject: identity.subject,
            userId: principal.user_id,
            credentialId: totp.credentialId,
        },
    );
    return { stage: proof ? 'verified' : 'mfa-pending', ...base };
}

// Enforces the full gate for data-bearing staff pages; throws redirect() for
// any stage that is not 'verified'.
/** @returns {Promise<StaffGateResolved & { stage: 'verified' }>} */
export async function requireStaffVerified() {
    const gate = await staffGate();
    if (gate.stage === 'signed-out') {
        redirect('/staff/sign-in');
    }
    if (gate.stage === 'unresolved') {
        redirect('/staff/no-access');
    }
    if (gate.stage === 'resolved') {
        redirect('/staff/mfa/enroll');
    }
    if (gate.stage === 'mfa-pending') {
        redirect('/staff/mfa/verify');
    }
    return gate;
}

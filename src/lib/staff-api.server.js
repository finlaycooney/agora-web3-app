import 'server-only';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';
import { staffIdentityFromSession, staffInviteEmailFromSession } from './staff-identity';
import { getStaffPool, resolveOrClaimStaffPrincipal } from './staff-db.server';
import { StaffOperationsError } from './staff-operations';
import { getTotpStatus } from './staff-mfa.server';
import { STAFF_MFA_COOKIE, readStaffMfaProof } from './staff-mfa-cookie';
import { ClientJobContractError } from './client-job-contracts';
import { StaffAuthorizationError } from './staff-authorization';

// Staff API boundary: session + resolved principal + active TOTP credential +
// a valid staff_mfa proof. Data-bearing routes must not run without all four.
export async function staffApiContext() {
    const session = await getServerSession(authOptions);
    const identity = staffIdentityFromSession(session);
    if (!identity) {
        return { status: 'unauthorized' };
    }
    const pool = getStaffPool();
    const organizationId = process.env.STAFF_ORGANIZATION_ID;
    const secret = process.env.NEXTAUTH_SECRET;
    if (!pool || !organizationId || !secret) {
        return { status: 'unconfigured' };
    }
    const principal = await resolveOrClaimStaffPrincipal(
        pool, identity, staffInviteEmailFromSession(session), organizationId);
    if (!principal) {
        return { status: 'unauthorized' };
    }
    const totp = await getTotpStatus(pool, identity, organizationId);
    if (!totp || totp.status !== 'active') {
        return { status: 'mfa-required' };
    }
    const cookieStore = await cookies();
    const proof = readStaffMfaProof(
        secret,
        cookieStore.get(STAFF_MFA_COOKIE)?.value,
        {
            subject: identity.subject,
            userId: principal.user_id,
            credentialId: totp.credentialId,
        },
    );
    if (!proof) {
        return { status: 'mfa-required' };
    }
    return { status: 'ok', session, identity, principal, pool, organizationId };
}

export function staffGateResponse(context) {
    if (context.status === 'ok') {
        return null;
    }
    if (context.status === 'unconfigured') {
        return Response.json({ error: 'staff workspace not configured' }, { status: 503 });
    }
    if (context.status === 'mfa-required') {
        return Response.json({ error: 'mfa required' }, { status: 428 });
    }
    return Response.json({ error: 'unauthorized' }, { status: 401 });
}

// Maps the contract/authorization/database error vocabulary onto HTTP.
export function staffErrorResponse(error) {
    if (error instanceof ClientJobContractError
        || error instanceof StaffOperationsError) {
        return Response.json(
            { error: 'invalid input', fields: error.fieldErrors }, { status: 400 });
    }
    if (error instanceof StaffAuthorizationError) {
        const status = error.code === 'FORBIDDEN' ? 403 : 401;
        return Response.json({ error: error.code.toLowerCase() }, { status });
    }
    const mapped = { '22023': 400, '23505': 409, '23514': 422, '40001': 409, P0002: 404 };
    if (typeof error?.code === 'string' && error.code in mapped) {
        return Response.json({ error: 'operation rejected', code: error.code }, { status: mapped[error.code] });
    }
    throw error;
}

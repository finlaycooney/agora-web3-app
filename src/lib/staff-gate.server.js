import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';
import { staffIdentityFromSession } from './staff-identity';
import { getStaffPool, resolveStaffPrincipal } from './staff-db.server';
import { getTotpStatus } from './staff-mfa.server';

// One server-side gate for every staff surface. Stages:
//   signed-out → no session or non-Google provider
//   unresolved → Google identity with no active staff membership
//   resolved   → active principal (totp may be null, 'pending' or 'active')
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
        principal = await resolveStaffPrincipal(pool, identity, organizationId);
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
    return { stage: 'resolved', session, identity, principal, totp, pool, organizationId };
}

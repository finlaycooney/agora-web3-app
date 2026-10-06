import { confirmTotpEnrollment, getTotpStatus, verifyTotpCode } from '@/lib/staff-mfa.server';
import { staffMfaContext, issueMfaProof, mfaJson, mfaFailure } from '@/lib/staff-mfa-http.server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const context = await staffMfaContext(request);
        if (context.denied) return context.denied;
        const { pool, identity, organizationId } = context;
        const body = await request.json().catch(() => ({}));
        const status = await getTotpStatus(pool, identity, organizationId);
        if (!status || status.status !== 'pending') return mfaJson({ error: 'no pending enrollment' }, 409);
        const counter = verifyTotpCode(status.secret, body?.code);
        if (counter === null) return mfaJson({ error: 'invalid code' }, 401);
        let backupCodes;
        try {
            backupCodes = await confirmTotpEnrollment(pool, identity, organizationId, status.credentialId, counter);
        } catch (error) {
            // Another tab can confirm between the status read and activation.
            // Its success must not be shown as a bad authenticator code.
            if ((error as { code?: string })?.code === '23514') {
                const current = await getTotpStatus(pool, identity, organizationId);
                if (current?.status === 'active') return mfaJson({ error: 'no pending enrollment' }, 409);
            }
            throw error;
        }
        if (!await issueMfaProof(context, status.credentialId)) return mfaJson({ error: 'unauthorized' }, 401);
        return mfaJson({ ok: true, backupCodes });
    } catch (error) { return mfaFailure(error); }
}

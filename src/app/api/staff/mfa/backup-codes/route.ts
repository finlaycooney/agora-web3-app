import { getTotpStatus, replaceBackupCodes, verifyTotpCode } from '@/lib/staff-mfa.server';
import { staffMfaContext, issueMfaProof, mfaJson, mfaFailure } from '@/lib/staff-mfa-http.server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const context = await staffMfaContext(request);
        if (context.denied) return context.denied;
        const { pool, identity, organizationId } = context;
        const body = await request.json().catch(() => ({}));
        const status = await getTotpStatus(pool, identity, organizationId);
        if (!status || status.status !== 'active') return mfaJson({ error: 'no active credential' }, 409);
        const counter = verifyTotpCode(status.secret, body?.code);
        if (counter === null || counter <= status.lastUsedCounter) return mfaJson({ error: 'invalid code' }, 401);
        const backupCodes = await replaceBackupCodes(pool, identity, organizationId, status.credentialId, counter);
        if (!await issueMfaProof(context, status.credentialId)) return mfaJson({ error: 'unauthorized' }, 401);
        return mfaJson({ ok: true, backupCodes });
    } catch (error) { return mfaFailure(error); }
}

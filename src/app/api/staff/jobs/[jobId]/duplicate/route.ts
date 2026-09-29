import {
    duplicateJobUnlisted,
    getJobWorkspace,
} from '@/lib/client-job-operations';
import {
    staffApiContext,
    staffErrorResponse,
    staffGateResponse,
} from '@/lib/staff-api.server';

export const runtime = 'nodejs';

const JSON_PRIVATE = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(
    request: Request,
    { params }: { params: Promise<{ jobId: string }> },
) {
    const context = await staffApiContext();
    const denied = staffGateResponse(context);
    if (denied) {
        return denied;
    }
    const sourceJobId = (await params).jobId;
    const body = await request.json().catch(() => ({}));
    try {
        const source = await getJobWorkspace(
            context.pool, context.identity, context.organizationId,
            { jobId: sourceJobId });
        const revision = [source?.draft, source?.published]
            .find((entry) => entry?.id === body?.sourceRevisionId);
        if (!revision) {
            return Response.json(
                { error: 'Source revision is unavailable.' },
                { status: 404, headers: JSON_PRIVATE },
            );
        }
        const result = await duplicateJobUnlisted(
            context.pool, context.identity, context.organizationId,
            {
                sourceRevisionId: body?.sourceRevisionId,
                expectedSourceVersion: body?.expectedSourceVersion,
                clientId: body?.clientId,
                jobId: body?.jobId,
                revisionId: body?.revisionId,
                operationId: body?.operationId,
            },
        );
        return Response.json({ ok: true, result }, { headers: JSON_PRIVATE });
    } catch (error) {
        const databaseError = error as { code?: string; message?: string } | null;
        if (databaseError?.code === '42883'
            && typeof databaseError.message === 'string'
            && /\bapp\.duplicate_job_v2\b/.test(databaseError.message)) {
            return Response.json(
                { error: 'Job duplication is temporarily unavailable. Please try again shortly.' },
                { status: 503, headers: JSON_PRIVATE },
            );
        }
        return staffErrorResponse(error);
    }
}

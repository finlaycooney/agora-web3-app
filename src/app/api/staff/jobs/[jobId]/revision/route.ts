import { randomUUID } from 'node:crypto';
import { beginJobRevision } from '@/lib/client-job-operations';
import {
    staffApiContext,
    staffErrorResponse,
    staffGateResponse,
} from '@/lib/staff-api.server';

export const runtime = 'nodejs';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ jobId: string }> },
) {
    const context = await staffApiContext();
    const denied = staffGateResponse(context);
    if (denied) {
        return denied;
    }
    const { jobId } = await params;
    const body = await request.json().catch(() => ({}));
    try {
        const result = await beginJobRevision(
            context.pool, context.identity, context.organizationId,
            {
                jobId,
                revisionId: randomUUID(),
                expectedJobVersion: body?.expectedJobVersion,
                operationId: randomUUID(),
            },
        );
        return Response.json({ ok: true, result });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

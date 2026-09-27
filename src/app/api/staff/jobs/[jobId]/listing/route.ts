import { randomUUID } from 'node:crypto';
import { setJobPublicListing } from '@/lib/client-job-operations';
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
        const result = await setJobPublicListing(
            context.pool, context.identity, context.organizationId,
            {
                jobId,
                listed: body?.listed,
                expectedVersion: body?.expectedVersion,
                operationId: randomUUID(),
            },
        );
        return Response.json({ ok: true, result });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

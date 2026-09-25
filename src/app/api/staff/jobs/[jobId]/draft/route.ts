import { randomUUID } from 'node:crypto';
import { saveJobDraft } from '@/lib/client-job-operations';
import {
    staffApiContext,
    staffErrorResponse,
    staffGateResponse,
} from '@/lib/staff-api.server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    const context = await staffApiContext();
    const denied = staffGateResponse(context);
    if (denied) {
        return denied;
    }
    const body = await request.json().catch(() => ({}));
    try {
        const result = await saveJobDraft(
            context.pool, context.identity, context.organizationId,
            {
                revisionId: body?.revisionId,
                expectedVersion: body?.expectedVersion,
                fields: body?.fields,
                operationId: randomUUID(),
            },
        );
        return Response.json({ ok: true, result });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

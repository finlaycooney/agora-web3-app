import { randomUUID } from 'node:crypto';
import { saveClient } from '@/lib/client-job-operations';
import {
    staffApiContext,
    staffErrorResponse,
    staffGateResponse,
} from '@/lib/staff-api.server';

export const runtime = 'nodejs';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ clientId: string }> },
) {
    const context = await staffApiContext();
    const denied = staffGateResponse(context);
    if (denied) {
        return denied;
    }
    const { clientId } = await params;
    const body = await request.json().catch(() => ({}));
    try {
        const result = await saveClient(
            context.pool, context.identity, context.organizationId,
            {
                clientId,
                expectedVersion: body?.expectedVersion ?? null,
                fields: body?.fields,
                operationId: randomUUID(),
            },
        );
        return Response.json({ ok: true, result });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

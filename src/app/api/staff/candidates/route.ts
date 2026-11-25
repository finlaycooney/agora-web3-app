import { randomUUID } from 'node:crypto';
import { addCandidateNote } from '@/lib/pipeline-operations';
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
    const action = typeof body?.action === 'string' ? body.action : 'addNote';
    try {
        if (action === 'addNote') {
            const result = await addCandidateNote(
                context.pool, context.identity, context.organizationId,
                {
                    candidateId: body?.candidateId,
                    body: body?.body,
                    operationId: randomUUID(),
                },
            );
            return Response.json({ ok: true, result });
        }
        return Response.json({ error: 'unknown action' }, { status: 400 });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

import { randomUUID } from 'node:crypto';
import { inviteStaffMember } from '@/lib/staff-operations';
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
        const result = await inviteStaffMember(
            context.pool, context.identity, context.organizationId,
            {
                userId: randomUUID(),
                membershipId: randomUUID(),
                displayName: body?.displayName,
                email: body?.email,
                roleId: body?.roleId,
                operationId: randomUUID(),
            },
        );
        return Response.json({ ok: true, result });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

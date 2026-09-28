import {
    createStaffTask,
    listStaffTasks,
    setStaffTaskCompleted,
} from '@/lib/workspace-operations';
import {
    staffApiContext,
    staffErrorResponse,
    staffGateResponse,
} from '@/lib/staff-api.server';

export const runtime = 'nodejs';

const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' };

const privateResponse = (response: Response) => {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};

export async function GET(request: Request) {
    let context;
    try {
        context = await staffApiContext();
    } catch {
        return Response.json(
            { error: 'staff context unavailable' },
            { status: 503, headers: PRIVATE_HEADERS },
        );
    }
    const denied = staffGateResponse(context);
    if (denied) {
        return privateResponse(denied);
    }
    const url = new URL(request.url);
    const completedParam = url.searchParams.get('completed');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    try {
        const result = await listStaffTasks(
            context.pool, context.identity, context.organizationId,
            {
                completed: completedParam === null
                    ? undefined
                    : completedParam === 'true'
                      ? true
                      : completedParam === 'false'
                        ? false
                        : (completedParam as unknown as boolean),
                category: url.searchParams.get('category') ?? undefined,
                limit: limitParam === null ? undefined : Number(limitParam),
                offset: offsetParam === null ? undefined : Number(offsetParam),
            },
        );
        return Response.json({ ok: true, result }, { headers: PRIVATE_HEADERS });
    } catch (error) {
        try {
            return privateResponse(staffErrorResponse(error));
        } catch {
            console.error(
                'staff task list failed',
                (error as { code?: string })?.code ?? 'UNKNOWN',
            );
            return Response.json(
                { error: 'task list unavailable' },
                { status: 503, headers: PRIVATE_HEADERS },
            );
        }
    }
}

export async function POST(request: Request) {
    let context;
    try {
        context = await staffApiContext();
    } catch {
        return Response.json(
            { error: 'staff context unavailable' },
            { status: 503, headers: PRIVATE_HEADERS },
        );
    }
    const denied = staffGateResponse(context);
    if (denied) {
        return privateResponse(denied);
    }
    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return Response.json(
            { error: 'invalid input' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const { action, ...input } = body;
    if (action !== 'create' && action !== 'setCompleted') {
        return Response.json(
            { error: 'unknown action' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    try {
        const result = action === 'create'
            ? await createStaffTask(
                context.pool, context.identity, context.organizationId, input)
            : await setStaffTaskCompleted(
                context.pool, context.identity, context.organizationId, input);
        return Response.json({ ok: true, result }, { headers: PRIVATE_HEADERS });
    } catch (error) {
        try {
            return privateResponse(staffErrorResponse(error));
        } catch {
            console.error(
                `staff task ${action} failed`,
                (error as { code?: string })?.code ?? 'UNKNOWN',
            );
            return Response.json(
                { error: 'task update unavailable' },
                { status: 503, headers: PRIVATE_HEADERS },
            );
        }
    }
}

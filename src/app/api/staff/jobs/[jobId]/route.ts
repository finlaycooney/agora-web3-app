import { getClient, getJobWorkspace } from '@/lib/client-job-operations';
import { staffApiContext, staffErrorResponse, staffGateResponse } from '@/lib/staff-api.server';

export const runtime = 'nodejs';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ jobId: string }> },
) {
    const context = await staffApiContext();
    const gate = staffGateResponse(context);
    if (gate) return gate;
    if (context.status !== 'ok') {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
        const { jobId } = await params;
        const workspace = await getJobWorkspace(
            context.pool, context.identity, context.organizationId, { jobId });
        const clientResult = await getClient(
            context.pool, context.identity, context.organizationId,
            { clientId: workspace.job.clientId });
        const client = clientResult?.client ?? clientResult;
        return Response.json({ ok: true, result: {
            job: workspace.job,
            draft: workspace.draft,
            published: workspace.published,
            client: client ? { name: client.name } : null,
        } }, { headers: { 'cache-control': 'private, no-store' } });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

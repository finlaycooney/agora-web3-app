import { createClient } from '@supabase/supabase-js';
import { getDocumentDownload } from '@/lib/pipeline-operations';
import {
    staffApiContext,
    staffErrorResponse,
    staffGateResponse,
} from '@/lib/staff-api.server';

export const runtime = 'nodejs';

const SIGNED_URL_TTL_SECONDS = 60;

// Issues a short-lived signed URL for a verified blob location. The procedure
// resolves coordinates under documents.download; the route signs and redirects.
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ documentId: string }> },
) {
    const context = await staffApiContext();
    const denied = staffGateResponse(context);
    if (denied) {
        return denied;
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return Response.json({ error: 'storage is not configured' }, { status: 503 });
    }
    const { documentId } = await params;
    try {
        const document = await getDocumentDownload(
            context.pool, context.identity, context.organizationId,
            { documentId },
        );
        if (!document) {
            return Response.json({ error: 'not found' }, { status: 404 });
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await supabase.storage
            .from(document.bucket)
            .createSignedUrl(document.objectKey, SIGNED_URL_TTL_SECONDS, {
                download: document.filename,
            });
        if (error || !data?.signedUrl) {
            return Response.json({ error: 'document unavailable' }, { status: 404 });
        }
        return Response.redirect(data.signedUrl, 302);
    } catch (error) {
        return staffErrorResponse(error);
    }
}

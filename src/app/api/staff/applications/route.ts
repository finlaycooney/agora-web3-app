import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
    importPublicApplication,
    transitionApplicationStage,
} from '@/lib/pipeline-operations';
import {
    staffApiContext,
    staffErrorResponse,
    staffGateResponse,
} from '@/lib/staff-api.server';

export const runtime = 'nodejs';

const CV_BUCKET = 'cv-submissions';
const IMPORT_LIMIT = 50;
const CV_MIME_BY_EXTENSION: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

interface LegacyApplicant {
    id: number;
    job_id: string | null;
    job_title: string | null;
    full_name: string;
    email: string;
    professional_url: string | null;
    technical_achievement: string | null;
    cv_url: string | null;
    ref_id: string;
    created_at: string;
}

type StaffContext = {
    pool: any;
    identity: any;
    organizationId: string;
};

// Fetches the CV object so the pipeline can register a verified blob. Returns
// null when the object is unreadable — the application still imports.
async function fetchCvDocument(supabase: any, cvUrl: string) {
    const extension = cvUrl.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = CV_MIME_BY_EXTENSION[extension];
    if (!mimeType) {
        return null;
    }
    const { data, error } = await supabase.storage.from(CV_BUCKET).download(cvUrl);
    if (error || !data) {
        return null;
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    return {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sizeBytes: bytes.length,
        mimeType,
        extension,
        bucket: CV_BUCKET,
        objectKey: cvUrl,
        filename: `cv.${extension}`,
    };
}

async function importSubmissions(context: StaffContext) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return Response.json(
            { error: 'intake storage is not configured' }, { status: 503 });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await supabase
        .from('applicants')
        .select(
            'id, job_id, job_title, full_name, email, professional_url,'
            + ' technical_achievement, cv_url, ref_id, created_at',
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(IMPORT_LIMIT);
    if (error) {
        throw Object.assign(new Error('legacy intake read failed'), { code: 'XX000' });
    }

    const results: { refId: string; outcome: string; detail?: string }[] = [];
    for (const row of (rows ?? []) as unknown as LegacyApplicant[]) {
        if (!row.job_id) {
            results.push({ refId: row.ref_id, outcome: 'skipped', detail: 'no job id' });
            continue;
        }
        const document = row.cv_url ? await fetchCvDocument(supabase, row.cv_url) : null;
        try {
            const result = await importPublicApplication(
                context.pool, context.identity, context.organizationId,
                {
                    jobSlug: row.job_id,
                    reference: row.ref_id,
                    fullName: row.full_name,
                    email: row.email,
                    professionalUrl: row.professional_url,
                    achievement: row.technical_achievement,
                    receivedAt: row.created_at,
                    document,
                    operationId: randomUUID(),
                },
            );
            if (result?.imported) {
                await supabase
                    .from('applicants')
                    .update({ status: 'imported' })
                    .eq('id', row.id);
                results.push({
                    refId: row.ref_id,
                    outcome: 'imported',
                    detail: document ? undefined : 'cv not found',
                });
            } else {
                results.push({ refId: row.ref_id, outcome: 'skipped', detail: result?.reason });
            }
        } catch (cause: any) {
            const detail = cause?.code === 'P0002' ? 'no matching job' : 'failed';
            results.push({ refId: row.ref_id, outcome: 'failed', detail });
        }
    }
    return Response.json({ ok: true, results });
}

export async function POST(request: Request) {
    const context = await staffApiContext();
    const denied = staffGateResponse(context);
    if (denied) {
        return denied;
    }
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : 'transitionStage';
    try {
        if (action === 'transitionStage') {
            const result = await transitionApplicationStage(
                context.pool, context.identity, context.organizationId,
                {
                    applicationId: body?.applicationId,
                    toStageId: body?.toStageId,
                    expectedVersion: body?.expectedVersion,
                    reason: body?.reason,
                    operationId: randomUUID(),
                },
            );
            return Response.json({ ok: true, result });
        }
        if (action === 'importSubmissions') {
            return await importSubmissions(context as StaffContext);
        }
        return Response.json({ error: 'unknown action' }, { status: 400 });
    } catch (error) {
        return staffErrorResponse(error);
    }
}

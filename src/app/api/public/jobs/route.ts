import { loadPublicJobs } from '@/lib/public-jobs.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    const { jobs, unavailable } = await loadPublicJobs();
    if (unavailable) {
        return Response.json(
            {
                code: 'JOBS_UNAVAILABLE',
                message: 'Job listings are temporarily unavailable. Please try again.',
            },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
    return Response.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
}

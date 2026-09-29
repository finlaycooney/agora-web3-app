import 'server-only';
import { JOBS } from '../data/jobs';
import { getIntakePool } from '@/lib/intake-db.server';
import { listPublicJobs } from '@/lib/intake-operations';
import { mapPublicJob } from '@/lib/public-jobs';

export async function loadPublicJobs() {
    const pool = getIntakePool();
    const organizationId = process.env.STAFF_ORGANIZATION_ID;

    // Without an intake connection the board falls back to the bundled static
    // listing — keeps local development and tests working without a database.
    if (!pool || !organizationId) {
        if (process.env.NODE_ENV === 'production') {
            return { jobs: [], unavailable: true };
        }
        return { jobs: JOBS, unavailable: false };
    }

    try {
        const result = await listPublicJobs(pool, organizationId);
        return {
            jobs: (result?.jobs ?? []).map(mapPublicJob),
            unavailable: false,
        };
    } catch (error) {
        console.error(
            'Public job listing failed:',
            error && typeof error === 'object' ? (error.code ?? 'UNKNOWN') : 'UNKNOWN',
        );
        return { jobs: [], unavailable: true };
    }
}

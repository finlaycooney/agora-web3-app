import JobsBoard from './jobs-board';
import { loadPublicJobs } from '@/lib/public-jobs.server';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
    const result = await loadPublicJobs();
    return <JobsBoard jobs={result.jobs} unavailable={result.unavailable} />;
}

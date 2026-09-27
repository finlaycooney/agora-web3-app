import { JOBS } from '../../data/jobs';
import JobsBoard from './jobs-board';
import { getIntakePool } from '@/lib/intake-db.server';
import { listPublicJobs } from '@/lib/intake-operations';

export const dynamic = 'force-dynamic';

const titleCase = (value) => String(value ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const salaryText = (compensation) => {
    const { min, max, currency, payPeriod } = compensation ?? {};
    if (min || max) {
        const range = min && max ? `${min} – ${max}` : (min ?? max);
        const period = payPeriod ? `/${titleCase(payPeriod).toLowerCase()}` : '';
        return `${range} ${currency ?? ''}${period}`.trim();
    }
    return 'Competitive';
};

const locationText = ({ locations, remoteRegions, workplaceMode }) => {
    const places = [
        ...(Array.isArray(locations) ? locations : []),
        ...(Array.isArray(remoteRegions) ? remoteRegions : []),
    ];
    const mode = workplaceMode ? `(${titleCase(workplaceMode)})` : '';
    if (places.length === 0) {
        return mode ? `${titleCase(workplaceMode)}` : 'Flexible';
    }
    return `${places.join(' · ')} ${mode}`.trim();
};

// Maps a published-revision projection onto the shape the board components
// already render. The projection is stealth-safe by construction.
const mapPublicJob = (row) => ({
    id: row.slug,
    title: row.title,
    salary: salaryText(row.compensation),
    location: locationText(row),
    type: titleCase(row.employmentType),
    description: row.descriptionText ?? '',
    responsibilities: null,
    tags: [],
    className: 'md:col-span-1',
    companyName: row.company?.name ?? null,
    applicationOpen: row.applicationOpen,
});

export default async function JobsPage() {
    const pool = getIntakePool();
    const organizationId = process.env.STAFF_ORGANIZATION_ID;

    // Without an intake connection the board falls back to the bundled static
    // listing — keeps local development and tests working without a database.
    let jobs = JOBS;
    if (pool && organizationId) {
        try {
            const result = await listPublicJobs(pool, organizationId);
            jobs = (result?.jobs ?? []).map(mapPublicJob);
        } catch (error) {
            console.error('Public job listing failed:', error);
            jobs = [];
        }
    }

    return <JobsBoard jobs={jobs} />;
}

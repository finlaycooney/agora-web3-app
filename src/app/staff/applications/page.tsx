import { listApplications } from '@/lib/pipeline-operations';
import { listJobs } from '@/lib/client-job-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { ApplicationsBrowser } from './applications-browser';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Applications · Agora staff' };

export default async function StaffApplicationsPage() {
    const gate = await requireStaffVerified();
    let applications: any[] | null = null;
    let jobs: any[] = [];
    try {
        const result = await listApplications(
            gate.pool, gate.identity, gate.organizationId, {});
        applications = result?.applications ?? [];
    } catch (error) {
        if (!(error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN')) {
            throw error;
        }
    }
    try {
        jobs = await listJobs(gate.pool, gate.identity, gate.organizationId, {});
    } catch (error) {
        if (!(error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN')) {
            throw error;
        }
    }

    return (
        <section className="mx-auto max-w-6xl px-6 py-10">
            {applications === null ? (
                <>
                    <h1 className="text-[26px] leading-8 font-medium">Applications</h1>
                    <p className="mt-6 text-sm text-muted-foreground">
                        Application review requires the applications.read permission.
                    </p>
                </>
            ) : (
                <ApplicationsBrowser
                    applications={applications}
                    jobs={jobs.map((job: any) => ({ id: job.id, title: job.title }))}
                />
            )}
        </section>
    );
}

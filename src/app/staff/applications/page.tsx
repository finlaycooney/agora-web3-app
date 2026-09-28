import { listApplications } from '@/lib/pipeline-operations';
import { listJobs } from '@/lib/client-job-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { PageHeader } from '@/components/staff-preview/shared';
import { Card, CardContent } from '@/components/staff-ui/card';
import { ApplicationsBrowser } from './applications-browser';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Applications · Agora staff' };

const LIST_LIMIT = 500;

export default async function StaffApplicationsPage() {
    const gate = await requireStaffVerified();
    let applications: any[] | null = null;
    let jobs: any[] = [];
    try {
        const result = await listApplications(
            gate.pool, gate.identity, gate.organizationId, { limit: LIST_LIMIT });
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

    if (applications === null) {
        return (
            <section className="mx-auto w-full max-w-7xl">
                <PageHeader
                    eyebrow="Workspace"
                    title="Applications"
                    description="Review candidates across your clients and open roles."
                />
                <Card className="mt-6">
                    <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                            Application review requires the applications.read permission.
                        </p>
                    </CardContent>
                </Card>
            </section>
        );
    }

    return (
        <section className="mx-auto w-full max-w-7xl">
            <ApplicationsBrowser
                applications={applications}
                jobs={jobs.map((job: any) => ({ id: job.id, title: job.title }))}
                capped={applications.length >= LIST_LIMIT}
            />
        </section>
    );
}

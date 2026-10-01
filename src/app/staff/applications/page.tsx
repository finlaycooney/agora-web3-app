import { listApplications } from '@/lib/pipeline-operations';
import { getClient, listJobs } from '@/lib/client-job-operations';
import { StaffAuthorizationError } from '@/lib/staff-authorization';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { PageHeader } from '@/components/staff-preview/shared';
import { Card, CardContent } from '@/components/staff-ui/card';
import { ApplicationsBrowser, type ApplicationRow } from './applications-browser';
import { uuidParam } from '../filter-params';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Applications · Agora staff' };

const LIST_LIMIT = 500;

export default async function StaffApplicationsPage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const gate = await requireStaffVerified();
    const params = await searchParams;
    const selectedClientId = uuidParam({
        get: (key) => typeof params[key] === 'string' ? params[key] as string : null,
    }, 'client');
    let applications: ApplicationRow[] | null = null;
    let jobs: { id: string; title: string; clientId: string; clientName: string }[] = [];
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

    // Jobs can supply labels even when they have no applications. Resolve an
    // explicitly selected empty client with the existing authorized read; never
    // trust a client name from the URL or expose another organization's name.
    const clients = new Map<string, string>([
        ...jobs.map((job) => [job.clientId, job.clientName] as [string, string]),
        ...applications.map((row) => [row.clientId, row.clientName] as [string, string]),
    ]);
    if (selectedClientId !== 'all' && !clients.has(selectedClientId)) {
        try {
            const result = await getClient(gate.pool, gate.identity, gate.organizationId,
                { clientId: selectedClientId });
            const client = result?.client ?? result;
            if (client?.name) clients.set(selectedClientId, client.name);
        } catch (error) {
            if (!(error instanceof StaffAuthorizationError && error.code === 'FORBIDDEN')
                && (error as { code?: string })?.code !== 'P0002') throw error;
        }
    }

    return (
        <section className="mx-auto w-full max-w-7xl">
            <ApplicationsBrowser
                applications={applications}
                clientOptions={Array.from(clients, ([id, name]) => ({ id, name }))}
                jobs={jobs.map((job) => ({ id: job.id, title: job.title }))}
                capped={applications.length >= LIST_LIMIT}
            />
        </section>
    );
}

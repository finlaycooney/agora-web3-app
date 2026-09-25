import { notFound, redirect } from 'next/navigation';
import { getJobWorkspace } from '@/lib/client-job-operations';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { JobForm } from '../../../workspace-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Edit draft · Agora staff' };

export default async function StaffJobEditPage(
    { params }: { params: Promise<{ jobId: string }> },
) {
    const gate = await requireStaffVerified();
    const { jobId } = await params;

    let workspace = null;
    try {
        workspace = await getJobWorkspace(
            gate.pool, gate.identity, gate.organizationId, { jobId });
    } catch {
        workspace = null;
    }
    if (!workspace?.job) {
        notFound();
    }
    if (!workspace.draft) {
        redirect(`/staff/jobs/${jobId}`);
    }

    const { job, draft } = workspace;
    return (
        <section className="mx-auto max-w-3xl px-6 py-12">
            <p className="text-sm uppercase tracking-widest text-foreground/50">{job.title}</p>
            <h1 className="mt-2 text-2xl font-semibold">Edit draft revision #{draft.revisionNumber}</h1>
            <JobForm
                clients={[]}
                jobId={job.id}
                revisionId={draft.id}
                expectedVersion={draft.version}
                initial={{
                    clientId: job.clientId,
                    title: draft.title,
                    employmentType: draft.employmentType,
                    workplaceMode: draft.workplaceMode,
                    locations: draft.locations ?? [],
                    remoteRegions: draft.remoteRegions ?? [],
                    compensationMin: draft.compensationMin,
                    compensationMax: draft.compensationMax,
                    currency: draft.currency,
                    payPeriod: draft.payPeriod,
                    descriptionText: draft.descriptionText ?? '',
                }}
            />
        </section>
    );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
    getJobWorkspace,
    previewJobPublic,
} from '@/lib/client-job-operations';
import { requireStaffVerified } from '@/lib/staff-gate.server';
import { NewRevisionButton, PublishButton } from '../../workspace-forms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Job · Agora staff' };

const detail = 'px-3 py-1.5 text-sm';
const detailLabel = `${detail} w-40 text-foreground/50`;

export default async function StaffJobPage(
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

    const { job, draft, published, publicationNeedsReview } = workspace;
    let preview = null;
    if (draft) {
        try {
            preview = await previewJobPublic(
                gate.pool, gate.identity, gate.organizationId,
                { revisionId: draft.id });
        } catch {
            preview = null;
        }
    }

    const row = (label: string, value: ReactNode) => (
        <div className="flex">
            <span className={detailLabel}>{label}</span>
            <span className={detail}>{value ?? '—'}</span>
        </div>
    );

    return (
        <section className="mx-auto max-w-4xl px-6 py-12">
            <div className="flex items-baseline justify-between">
                <h1 className="text-2xl font-semibold">{job.title}</h1>
                <span className="text-xs uppercase tracking-widest text-foreground/50">
                    {job.publicationState} · applications {job.applicationState}
                </span>
            </div>

            <div className="mt-8">
                <h2 className="text-sm uppercase tracking-widest text-foreground/50">Draft revision</h2>
                {draft ? (
                    <div className="mt-3 rounded-lg border border-foreground/10 p-4">
                        {row('Revision', `#${draft.revisionNumber} (v${draft.version})`)}
                        {row('Title', draft.title)}
                        {row('Employment', draft.employmentType)}
                        {row('Workplace', draft.workplaceMode)}
                        {row('Locations', draft.locations?.join(', ') || '—')}
                        <div className="mt-4 flex gap-3">
                            <Link
                                href={`/staff/jobs/${job.id}/edit`}
                                className="rounded-md border border-foreground/20 px-4 py-2 text-sm hover:opacity-70"
                            >
                                Edit draft
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className="mt-3 flex items-center gap-4 rounded-lg border border-foreground/10 p-4">
                        <p className="text-sm text-foreground/60">No open draft.</p>
                        <NewRevisionButton jobId={job.id} expectedJobVersion={job.version} />
                    </div>
                )}
            </div>

            {published && (
                <div className="mt-8">
                    <h2 className="text-sm uppercase tracking-widest text-foreground/50">Published revision</h2>
                    <div className="mt-3 rounded-lg border border-foreground/10 p-4">
                        {row('Revision', `#${published.revisionNumber}`)}
                        {row('Published as', published.publishedCompanyName)}
                        {row('Published at', published.publishedAt)}
                        {publicationNeedsReview && (
                            <p className="mt-3 text-sm text-amber-400">
                                The client public profile changed since publication — review before relying on this listing.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {preview && (
                <div className="mt-8">
                    <h2 className="text-sm uppercase tracking-widest text-foreground/50">Publish preview</h2>
                    <div className="mt-3 rounded-lg border border-foreground/10 p-4">
                        {row('Company shown publicly', preview.projection?.company?.name)}
                        {row('Public description', preview.projection?.company?.description)}
                        <div className="mt-4">
                            <PublishButton
                                jobId={job.id}
                                revisionId={draft.id}
                                expectedVersion={draft.version}
                                expectedClientVersion={preview.clientVersion}
                                reviewHash={preview.reviewHash}
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

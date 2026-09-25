import Link from 'next/link';
import { listJobs } from '@/lib/client-job-operations';
import { requireStaffVerified } from '@/lib/staff-gate.server';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Jobs · Agora staff' };

const th = 'px-3 py-2 text-left text-xs uppercase tracking-widest text-foreground/50';
const td = 'px-3 py-2.5 text-sm border-t border-foreground/10';

const STATES = ['all', 'draft', 'published', 'withdrawn', 'archived'] as const;

export default async function StaffJobsPage(
    { searchParams }: { searchParams: Promise<{ state?: string; owner?: string }> },
) {
    const gate = await requireStaffVerified();
    const params = await searchParams;
    const state = params.state && params.state !== 'all'
        && (STATES as readonly string[]).includes(params.state)
        ? params.state
        : null;
    const mine = params.owner === 'me' ? gate.principal.membership_id : null;
    const jobs = await listJobs(gate.pool, gate.identity, gate.organizationId, {
        publicationState: state,
        ownerMembershipId: mine,
    });

    return (
        <section className="mx-auto max-w-4xl px-6 py-12">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Jobs</h1>
                <Link
                    href="/staff/jobs/new"
                    className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-80"
                >
                    New job
                </Link>
            </div>
            <div className="mt-6 flex gap-3 text-sm">
                {STATES.map((value) => (
                    <Link
                        key={value}
                        href={`/staff/jobs?state=${value}${mine ? '&owner=me' : ''}`}
                        className={`rounded-full border px-3 py-1 ${
                            (state ?? 'all') === value
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-foreground/20 text-foreground/60 hover:opacity-70'
                        }`}
                    >
                        {value}
                    </Link>
                ))}
                <Link
                    href={mine
                        ? `/staff/jobs${state ? `?state=${state}` : ''}`
                        : `/staff/jobs?owner=me${state ? `&state=${state}` : ''}`}
                    className={`rounded-full border px-3 py-1 ${
                        mine
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-foreground/20 text-foreground/60 hover:opacity-70'
                    }`}
                >
                    Owned by me
                </Link>
            </div>
            {jobs.length === 0 ? (
                <p className="mt-10 text-sm text-foreground/60">No jobs match.</p>
            ) : (
                <table className="mt-8 w-full border-collapse">
                    <thead>
                        <tr>
                            <th className={th}>Title</th>
                            <th className={th}>Client</th>
                            <th className={th}>Publication</th>
                            <th className={th}>Applications</th>
                            <th className={th}>Draft</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job: any) => (
                            <tr key={job.id} className={job.publicationState === 'draft' ? 'opacity-60' : ''}>
                                <td className={td}>
                                    <Link href={`/staff/jobs/${job.id}`} className="underline underline-offset-4 hover:opacity-70">
                                        {job.title}
                                    </Link>
                                </td>
                                <td className={td}>
                                    {job.clientName}
                                    {job.clientIsStealth && (
                                        <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                                            stealth
                                        </span>
                                    )}
                                </td>
                                <td className={td}>{job.publicationState}</td>
                                <td className={td}>{job.applicationState}</td>
                                <td className={`${td} font-mono text-xs`}>
                                    {job.draftRevisionId ? 'yes' : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}

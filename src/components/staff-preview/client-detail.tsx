'use client';

import { Building2 } from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/staff-ui/table';

import { STAGE_TONES, type ApplicationRow } from './application-model';
import { CandidatePreviewLink } from './candidate-preview';
import {
    SOCIAL_PLATFORM_LABELS,
    employmentTypeLabel,
    formatReceivedDate,
    isJobOpen,
    jobLocationLabel,
    jobStatusLabel,
} from './demo-data';
import { JobPreviewLink } from './job-preview';
import { EmptyState, StatusBadge, TagPill } from './shared';
import type { BadgeTone, DemoClient, DemoJob } from './types';

export function ClientDetail({
    clientId,
    clients,
    jobs,
    rows,
}: {
    clientId: string;
    clients: DemoClient[];
    jobs: DemoJob[];
    rows: ApplicationRow[];
}) {
    const client = clients.find((entry) => entry.id === clientId);

    if (!client) {
        return (
            <div className="flex flex-col gap-6">
                <EmptyState
                    icon={Building2}
                    title="Client not found"
                    description="This client does not exist in the demo data."
                    action={
                        <Button variant="outline" asChild>
                            <a href="#/clients">View all clients</a>
                        </Button>
                    }
                />
            </div>
        );
    }

    const clientRows = rows.filter((row) => row.clientId === client.id);
    const clientJobs = jobs.filter((job) => job.clientId === client.id);
    const openJobs = clientJobs.filter((job) => isJobOpen(job));
    const interviewing = clientRows.filter((row) => row.stage === 'Interview').length;
    const recent = [...clientRows]
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || a.id.localeCompare(b.id))
        .slice(0, 5);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Client
                    </span>
                    <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        {client.industry} · {client.location}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="w-fit">
                            Owner · {client.owner}
                        </Badge>
                        {client.status === 'draft' ? (
                            <StatusBadge tone="warning">Draft client</StatusBadge>
                        ) : null}
                        {client.isStealth ? (
                            <Badge variant="outline" className="w-fit">
                                Identity hidden externally
                            </Badge>
                        ) : null}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {client.status === 'draft' ? (
                        <Button asChild>
                            <a href={`#/clients/${client.id}/edit`}>Finish draft</a>
                        </Button>
                    ) : (
                        <Button asChild>
                            <a href={`#/jobs/new?client=${client.id}`}>Add job</a>
                        </Button>
                    )}
                    <Button variant="outline" asChild>
                        <a href={`#/applications?client=${client.id}`}>View applications</a>
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <section
                    aria-labelledby="client-roles-heading"
                    className="flex flex-col gap-3 lg:col-span-2"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2
                            id="client-roles-heading"
                            className="text-base font-semibold text-foreground"
                        >
                            Roles
                        </h2>
                        {client.status === 'active' ? (
                            <Button variant="outline" size="sm" asChild>
                                <a href={`#/jobs/new?client=${client.id}`}>Add job</a>
                            </Button>
                        ) : null}
                    </div>
                    {clientJobs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {client.status === 'draft'
                                ? 'Draft clients cannot receive roles yet. Finish the client setup to add a job.'
                                : 'No roles for this client yet.'}
                        </p>
                    ) : (
                        clientJobs.map((job) => {
                            const jobRows = clientRows.filter((row) => row.jobId === job.id);
                            const status = jobStatusLabel(job);
                            return (
                                <div
                                    key={job.id}
                                    data-testid={`client-role-${job.id}`}
                                    className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="flex flex-col gap-0.5">
                                            <JobPreviewLink
                                                jobId={job.id}
                                                className="w-fit rounded-sm text-sm font-semibold text-foreground outline-none after:absolute after:inset-0 after:rounded-lg hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {job.title}
                                            </JobPreviewLink>
                                            <span className="text-xs text-muted-foreground">
                                                {jobLocationLabel(job)} ·{' '}
                                                {employmentTypeLabel(job.employmentType)}
                                            </span>
                                        </div>
                                        <div className="relative z-10 flex items-center gap-2">
                                            <StatusBadge
                                                tone={
                                                    (status === 'Open'
                                                        ? 'success'
                                                        : status === 'Draft'
                                                          ? 'secondary'
                                                          : 'outline') as BadgeTone
                                                }
                                            >
                                                {status}
                                            </StatusBadge>
                                            {job.draft ? (
                                                <TagPill>Draft changes</TagPill>
                                            ) : null}
                                            <a
                                                href={`#/applications?client=${client.id}&job=${job.id}`}
                                                className="w-fit rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {jobRows.length} application
                                                {jobRows.length === 1 ? '' : 's'}
                                            </a>
                                        </div>
                                    </div>
                                    <p className="line-clamp-2 text-sm text-muted-foreground">
                                        {job.summary}
                                    </p>
                                    <div className="relative z-10 flex flex-wrap items-center gap-4">
                                        <JobPreviewLink
                                            jobId={job.id}
                                            className="w-fit rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            View job description
                                        </JobPreviewLink>
                                        <a
                                            href={`#/applications?client=${client.id}&job=${job.id}`}
                                            className="w-fit rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            View applications for {job.title}
                                        </a>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </section>

                <Card className="h-fit">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Client details</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Contact
                            </span>
                            <span className="text-sm font-medium text-foreground">
                                {client.contactName ?? 'Not provided'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {client.contactEmail ?? 'No contact email yet'}
                            </span>
                            {client.telegramUsername ? (
                                <span className="text-xs text-muted-foreground">
                                    Telegram · @{client.telegramUsername}
                                </span>
                            ) : null}
                        </div>
                        {client.website ? (
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    Website
                                </span>
                                <a
                                    href={client.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-fit rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {client.website}
                                </a>
                            </div>
                        ) : null}
                        {client.socialLinks.length > 0 ? (
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    Social links
                                </span>
                                <ul className="flex flex-col gap-0.5">
                                    {client.socialLinks.map((link) => (
                                        <li key={link.url}>
                                            <a
                                                href={link.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="w-fit rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {SOCIAL_PLATFORM_LABELS[link.platform]} · {link.url}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {client.isStealth ? (
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    Anonymous description
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Shown externally instead of the company identity.
                                </span>
                                <p className="text-sm text-foreground">
                                    {client.anonymousDescription}
                                </p>
                            </div>
                        ) : null}
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Owner
                            </span>
                            <span className="text-sm text-foreground">{client.owner}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                                {
                                    label: 'Open roles',
                                    count: openJobs.length,
                                    href: `#/jobs?client=${client.id}`,
                                },
                                {
                                    label: 'Applications',
                                    count: clientRows.length,
                                    href: `#/applications?client=${client.id}`,
                                },
                                {
                                    label: 'Interviewing',
                                    count: interviewing,
                                    href: `#/applications?client=${client.id}&stage=Interview`,
                                },
                            ].map((metric) => (
                                <a
                                    key={metric.label}
                                    href={metric.href}
                                    className="flex flex-col gap-0.5 rounded-lg bg-secondary/40 px-2 py-2 outline-none transition-colors hover:bg-hover hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="text-[11px] text-muted-foreground">
                                        {metric.label}
                                    </span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {metric.count}
                                    </span>
                                </a>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <section
                className="mt-4 flex flex-col gap-4"
                aria-labelledby="client-recent-heading"
            >
                <h2
                    id="client-recent-heading"
                    className="text-base font-semibold text-foreground"
                >
                    Recent applications
                </h2>
                {recent.length === 0 ? (
                    <EmptyState
                        icon={Building2}
                        title="No visible applications for this client yet"
                        description="New applications for this client’s open roles will appear here."
                    />
                ) : (
                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Candidate</TableHead>
                                    <TableHead>Job</TableHead>
                                    <TableHead className="hidden md:table-cell">Stage</TableHead>
                                    <TableHead className="hidden md:table-cell">Received</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recent.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            <CandidatePreviewLink
                                                candidateId={row.candidateId}
                                                className="rounded-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {row.candidateName}
                                            </CandidatePreviewLink>
                                        </TableCell>
                                        <TableCell>{row.job}</TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <StatusBadge tone={STAGE_TONES[row.stage]}>
                                                {row.stage}
                                            </StatusBadge>
                                        </TableCell>
                                        <TableCell className="hidden text-muted-foreground md:table-cell">
                                            {formatReceivedDate(row.receivedAt)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>
        </div>
    );
}

'use client';

import { Briefcase } from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';

import type { ApplicationRow } from './application-model';
import {
    employmentTypeLabel,
    jobLocationLabel,
    jobStatusLabel,
} from './demo-data';
import { JobDescription } from './job-description';
import { EmptyState, PageHeader, StatusBadge, TagPill } from './shared';
import type { BadgeTone, DemoClient, DemoJob } from './types';

export function JobDetail({
    jobId,
    jobs,
    clients,
    applicationRows,
    onDuplicate,
}: {
    jobId: string;
    jobs: DemoJob[];
    clients: DemoClient[];
    applicationRows: ApplicationRow[];
    onDuplicate: (jobId: string) => void;
}) {
    const job = jobs.find((entry) => entry.id === jobId);

    if (!job) {
        return (
            <EmptyState
                icon={Briefcase}
                title="Job not found"
                description="This job is not part of the sample data."
                action={
                    <Button variant="outline" asChild>
                        <a href="#/jobs">All jobs</a>
                    </Button>
                }
            />
        );
    }

    const client = clients.find((entry) => entry.id === (job.draft?.clientId ?? job.clientId));
    const jobApplications = applicationRows.filter((row) => row.jobId === job.id);
    const status = jobStatusLabel(job);
    const shown = job.draft ?? job;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Jobs"
                title={shown.title || job.title}
                description={`${client?.name ?? job.clientId} · ${jobLocationLabel(shown)}`}
                actions={
                    <>
                        <Button variant="outline" onClick={() => onDuplicate(job.id)}>
                            Duplicate job
                        </Button>
                        <Button variant="outline" asChild>
                            <a href={`#/jobs/${job.id}/edit`}>Edit job</a>
                        </Button>
                        <Button asChild>
                            <a href={`#/applications?client=${job.clientId}&job=${job.id}`}>
                                View applications
                            </a>
                        </Button>
                    </>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
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
                {job.draft ? <TagPill>Draft changes pending publish</TagPill> : null}
                <TagPill>{employmentTypeLabel(shown.employmentType)}</TagPill>
                <TagPill>{jobLocationLabel(shown)}</TagPill>
                {client ? (
                    <>
                        <a
                            href={`#/clients/${client.id}`}
                            className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {client.name}
                        </a>
                        {client.isStealth ? (
                            <Badge variant="outline">Identity hidden externally</Badge>
                        ) : null}
                    </>
                ) : null}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <JobDescription
                        job={{ ...job, descriptionDocument: shown.descriptionDocument }}
                    />
                </div>

                <a
                    href={`#/applications?client=${job.clientId}&job=${job.id}`}
                    className="block h-fit rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Card className="transition-colors hover:border-primary/60">
                        <CardHeader>
                            <CardTitle>Applications</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-1">
                            <span className="text-2xl font-semibold text-foreground">
                                {jobApplications.length}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                application{jobApplications.length === 1 ? '' : 's'} for this role
                            </span>
                            <span className="mt-2 text-xs font-medium text-accent-foreground">
                                View applications →
                            </span>
                        </CardContent>
                    </Card>
                </a>
            </div>
        </div>
    );
}

'use client';

import { ArrowRight, ClipboardList } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';

import type { ApplicationRow } from './application-model';
import { isJobOpen } from './demo-data';
import { InitialsAvatar, PageHeader } from './shared';
import { TodoList } from './todo-list';
import type { Candidate, DemoClient, DemoJob } from './types';

function MetricLink({
    href,
    label,
    value,
}: {
    href: string;
    label: string;
    value: number;
}) {
    return (
        <a
            href={href}
            className="block rounded-lg outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
        >
            <Card className="h-full transition-colors hover:border-primary/60">
                <CardContent className="flex flex-col gap-1 p-5">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {label}
                    </span>
                    <span className="text-2xl font-semibold text-foreground">{value}</span>
                </CardContent>
            </Card>
        </a>
    );
}

export function WorkspaceOverview({
    candidates,
    rows,
    clients,
    jobs,
    completedTaskIDs,
    onToggleTaskComplete,
}: {
    candidates: Candidate[];
    rows: ApplicationRow[];
    clients: DemoClient[];
    jobs: DemoJob[];
    completedTaskIDs: string[];
    onToggleTaskComplete: (id: string, completed: boolean) => void;
}) {
    const openRoles = jobs.filter((job) => isJobOpen(job)).length;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Workspace"
                title="Overview"
                description="A snapshot of your recruiting pipeline for today."
            />
            <div className="grid gap-4 sm:grid-cols-3">
                <MetricLink
                    href="#/candidates?all=1"
                    label="Candidates"
                    value={candidates.length}
                />
                <MetricLink
                    href="#/applications?all=1"
                    label="Applications"
                    value={rows.length}
                />
                <MetricLink
                    href="#/jobs?all=1"
                    label="Open roles"
                    value={openRoles}
                />
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <TodoList
                        completedTaskIDs={completedTaskIDs}
                        onToggleComplete={onToggleTaskComplete}
                    />
                </div>
                <Card className="h-fit">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            Clients hiring
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {clients.map((client) => {
                            const clientOpenRoles = jobs.filter(
                                (job) => job.clientId === client.id && isJobOpen(job),
                            ).length;
                            const applications = rows.filter(
                                (row) => row.clientId === client.id,
                            ).length;
                            return (
                                <div
                                    key={client.id}
                                    className="relative flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <InitialsAvatar name={client.name} size="sm" />
                                        <div className="flex min-w-0 flex-col">
                                            <a
                                                href={`#/clients/${client.id}`}
                                                className="truncate rounded-sm text-sm font-medium text-foreground outline-none after:absolute after:inset-0 hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {client.name}
                                            </a>
                                            <span className="truncate text-xs text-muted-foreground">
                                                {client.industry} · {client.location}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                        <a
                                            href={`#/jobs?client=${client.id}`}
                                            className="relative z-10 rounded-sm text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {clientOpenRoles} open role
                                            {clientOpenRoles === 1 ? '' : 's'}
                                        </a>
                                        <a
                                            href={`#/applications?client=${client.id}`}
                                            className="relative z-10 rounded-sm text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {applications} application
                                            {applications === 1 ? '' : 's'}
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                        <a
                            href="#/clients"
                            className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            View all clients
                            <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </a>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

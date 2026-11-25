'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Briefcase, Search } from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import { Input } from '@/components/staff-ui/input';
import { Label } from '@/components/staff-ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/staff-ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/staff-ui/table';
import { cn } from '@/lib/utils';

import type { ApplicationRow } from './application-model';
import {
    employmentTypeLabel,
    jobLocationLabel,
    jobStatusLabel,
} from './demo-data';
import { JobPreviewLink, useJobPreview } from './job-preview';
import type { JobFilters } from './preview-navigation';
import { EmptyState, PageHeader, StatusBadge, TagPill } from './shared';
import type { BadgeTone, DemoClient, DemoJob } from './types';

export function JobsOverview({
    clients,
    jobs,
    applicationRows,
    filters,
    onFiltersChange,
}: {
    clients: DemoClient[];
    jobs: DemoJob[];
    applicationRows: ApplicationRow[];
    filters: JobFilters;
    onFiltersChange: (filters: JobFilters) => void;
}) {
    const jobPreview = useJobPreview();

    const clientName = (id: string) =>
        clients.find((client) => client.id === id)?.name ?? id;

    const applicationCount = (jobId: string) =>
        applicationRows.filter((row) => row.jobId === jobId).length;

    const normalizedQuery = filters.query.trim().toLowerCase();
    const filteredJobs = jobs.filter((job) => {
        if (filters.clientId !== 'all' && job.clientId !== filters.clientId) return false;
        if (
            filters.status !== 'all'
            && jobStatusLabel(job).toLowerCase() !== filters.status
        ) {
            return false;
        }
        if (normalizedQuery) {
            const haystack =
                `${job.title} ${jobLocationLabel(job)} ${clientName(job.clientId)}`.toLowerCase();
            if (!haystack.includes(normalizedQuery)) return false;
        }
        return true;
    });

    const direction = filters.sortDirection === 'asc' ? 1 : -1;
    const sortedJobs = filteredJobs.slice().sort((left, right) => {
        const comparison =
            filters.sortBy === 'title'
                ? left.title.localeCompare(right.title)
                : filters.sortBy === 'client'
                  ? clientName(left.clientId).localeCompare(clientName(right.clientId))
                  : filters.sortBy === 'location'
                    ? jobLocationLabel(left).localeCompare(jobLocationLabel(right))
                    : filters.sortBy === 'status'
                      ? jobStatusLabel(left).localeCompare(jobStatusLabel(right))
                      : applicationCount(left.id) - applicationCount(right.id);
        return comparison * direction || left.title.localeCompare(right.title);
    });

    const filtersActive =
        filters.query.trim() !== ''
        || filters.clientId !== 'all'
        || filters.status !== 'all';

    const clearFilters = () =>
        onFiltersChange({
            query: '',
            clientId: 'all',
            status: 'all',
            sortBy: 'title',
            sortDirection: 'asc',
        });

    const toggleSort = (key: JobFilters['sortBy']) => {
        onFiltersChange({
            ...filters,
            sortBy: key,
            sortDirection:
                filters.sortBy === key && filters.sortDirection === 'asc'
                    ? 'desc'
                    : 'asc',
        });
    };

    const sortableHead = (
        key: JobFilters['sortBy'],
        label: string,
        className?: string,
    ) => {
        const active = filters.sortBy === key;
        const Icon = active
            ? filters.sortDirection === 'asc'
                ? ArrowUp
                : ArrowDown
            : ArrowUpDown;
        return (
            <TableHead
                className={className}
                aria-sort={
                    active
                        ? filters.sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                        : 'none'
                }
            >
                <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={cn(
                        'inline-flex items-center gap-1 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                        active && 'text-foreground',
                    )}
                >
                    {label}
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            </TableHead>
        );
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Workspace"
                title="Jobs"
                description="Drafts and published roles across your clients."
                actions={
                    <Button asChild>
                        <a href="#/jobs/new">Add job</a>
                    </Button>
                }
            />

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-end">
                <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="job-search">Search</Label>
                    <div className="relative">
                        <Search
                            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="job-search"
                            className="pl-9"
                            placeholder="Search title, client or location…"
                            value={filters.query}
                            onChange={(event) =>
                                onFiltersChange({ ...filters, query: event.target.value })
                            }
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 md:w-56">
                    <Label htmlFor="job-client-filter">Client</Label>
                    <Select
                        value={filters.clientId}
                        onValueChange={(value) =>
                            onFiltersChange({ ...filters, clientId: value })
                        }
                    >
                        <SelectTrigger id="job-client-filter" aria-label="Filter jobs by client">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All clients</SelectItem>
                            {clients.map((client) => (
                                <SelectItem key={client.id} value={client.id}>
                                    {client.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5 md:w-40">
                    <Label htmlFor="job-status-filter">Status</Label>
                    <Select
                        value={filters.status}
                        onValueChange={(value) =>
                            onFiltersChange({
                                ...filters,
                                status: value as JobFilters['status'],
                            })
                        }
                    >
                        <SelectTrigger id="job-status-filter" aria-label="Filter jobs by status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {filtersActive ? (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        Clear filters
                    </Button>
                ) : null}
            </div>

            <p role="status" className="text-xs text-muted-foreground">
                {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'}
            </p>

            {filteredJobs.length === 0 ? (
                <EmptyState
                    icon={Briefcase}
                    title="No jobs match these filters"
                    description="Try a different search, or pick another client."
                    action={
                        filtersActive ? (
                            <Button variant="outline" onClick={clearFilters}>
                                Clear filters
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {sortableHead('title', 'Role')}
                                {sortableHead('client', 'Client')}
                                {sortableHead('location', 'Location', 'hidden md:table-cell')}
                                {sortableHead('status', 'Status')}
                                {sortableHead(
                                    'applications',
                                    'Applications',
                                    'hidden sm:table-cell',
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedJobs.map((job) => (
                                <TableRow
                                    key={job.id}
                                    data-testid={`job-row-${job.id}`}
                                    data-status={jobStatusLabel(job).toLowerCase()}
                                    className={cn(
                                        'cursor-pointer',
                                        job.publicationState === 'draft' && 'bg-muted',
                                    )}
                                    onClick={(event) => {
                                        if (
                                            (event.target as HTMLElement).closest(
                                                'a,button,input,label',
                                            )
                                        ) {
                                            return;
                                        }
                                        const trigger = (
                                            event.currentTarget as HTMLElement
                                        ).querySelector<HTMLElement>(
                                            'a[data-preview-trigger]',
                                        );
                                        jobPreview?.open(
                                            job.id,
                                            trigger ?? (event.currentTarget as HTMLElement),
                                        );
                                    }}
                                >
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <JobPreviewLink
                                                jobId={job.id}
                                                className="w-fit rounded-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {job.title}
                                            </JobPreviewLink>
                                            <span className="text-xs text-muted-foreground">
                                                {employmentTypeLabel(job.employmentType)}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <a
                                            href={`#/clients/${job.clientId}`}
                                            className="rounded-sm text-muted-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {clientName(job.clientId)}
                                        </a>
                                    </TableCell>
                                    <TableCell className="hidden text-muted-foreground md:table-cell">
                                        {jobLocationLabel(job)}
                                    </TableCell>
                                    <TableCell>
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <StatusBadge
                                                tone={
                                                    (jobStatusLabel(job) === 'Open'
                                                        ? 'success'
                                                        : jobStatusLabel(job) === 'Draft'
                                                          ? 'secondary'
                                                          : 'outline') as BadgeTone
                                                }
                                            >
                                                {jobStatusLabel(job)}
                                            </StatusBadge>
                                            {job.draft ? <TagPill>Draft changes</TagPill> : null}
                                        </span>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                        <a
                                            href={`#/applications?client=${job.clientId}&job=${job.id}`}
                                            className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {applicationCount(job.id)} application
                                            {applicationCount(job.id) === 1 ? '' : 's'}
                                        </a>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}

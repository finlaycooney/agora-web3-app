'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
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
import { filterApplicationRows } from '@/lib/application-filters';
import { flagParam, textParam, uuidParam } from '../filter-params';

export interface ApplicationRow {
    applicationId: string;
    candidateId: string;
    candidateName: string | null;
    jobId: string;
    jobTitle: string;
    clientId: string;
    clientName: string;
    stageId: string;
    stageKey: string;
    stageLabel: string;
    stageKind: string;
    stageIsInitial?: boolean;
    publicReference: string;
    receivedAt: string;
}

export interface ApplicationFiltersState {
    query: string;
    jobId: string;
    clientId: string;
    stage: string;
    review: boolean;
}

const KIND_TONE: Record<string, 'accent' | 'warning' | 'success' | 'restriction' | 'secondary'> = {
    active: 'accent',
    hired: 'success',
    rejected: 'restriction',
    withdrawn: 'secondary',
};

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
    });

function syncUrl(filters: ApplicationFiltersState) {
    const params = new URLSearchParams();
    if (filters.query.trim()) params.set('q', filters.query);
    if (filters.jobId !== 'all') params.set('job', filters.jobId);
    if (filters.clientId !== 'all') params.set('client', filters.clientId);
    if (filters.stage !== 'all') params.set('stage', filters.stage);
    if (filters.review) params.set('review', '1');
    const query = params.toString();
    window.history.replaceState(
        null, '', `/staff/applications${query ? `?${query}` : ''}`);
}

const parseFilters = (params: { get(name: string): string | null }): ApplicationFiltersState => ({
    query: textParam(params, 'q'),
    jobId: uuidParam(params, 'job'),
    clientId: uuidParam(params, 'client'),
    stage: params.get('stage') ?? 'all',
    review: flagParam(params, 'review'),
});

export function ApplicationsBrowser({
    applications,
    jobs,
    clientOptions = [],
    capped = false,
}: {
    applications: ApplicationRow[];
    jobs: { id: string; title: string }[];
    clientOptions?: { id: string; name: string }[];
    capped?: boolean;
}) {
    const searchParams = useSearchParams();
    const filters = parseFilters(searchParams);

    const update = (next: ApplicationFiltersState) => {
        syncUrl(next);
    };

    const scopedApplications = useMemo(
        () => filterApplicationRows(applications, filters, { includeStage: false }),
        [applications, filters],
    );

    const stages = useMemo(() => {
        const seen = new Map<string, { label: string; kind: string; count: number }>();
        for (const row of applications) {
            const existing = seen.get(row.stageKey);
            if (existing) {
                continue;
            } else {
                seen.set(row.stageKey, {
                    label: row.stageLabel, kind: row.stageKind, count: 0,
                });
            }
        }
        for (const row of scopedApplications) {
            const stage = seen.get(row.stageKey);
            if (stage) stage.count += 1;
        }
        return Array.from(seen.entries()).map(([key, value]) => ({ key, ...value }));
    }, [applications, scopedApplications]);

    const clients = useMemo(() => {
        const seen = new Map(clientOptions.map((client) => [client.id, client.name]));
        for (const row of applications) {
            if (!seen.has(row.clientId)) seen.set(row.clientId, row.clientName);
        }
        return Array.from(seen.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [applications, clientOptions]);

    const reviewSupported = applications.every(
        (row) => typeof row.stageIsInitial === 'boolean',
    );

    const visible = useMemo(() => filterApplicationRows(applications, filters),
        [applications, filters]);

    const filtersSet =
        filters.query.trim() !== ''
        || filters.jobId !== 'all'
        || filters.clientId !== 'all'
        || filters.stage !== 'all'
        || filters.review;

    const clearFilters = () =>
        update({ query: '', jobId: 'all', clientId: 'all', stage: 'all', review: false });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-accent-foreground uppercase">
                        Workspace
                    </p>
                    <h1 className="text-[26px] leading-8 font-medium text-foreground">
                        Applications
                    </h1>
                </div>
            </div>

            <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                role="group"
                aria-label="Stage filter cards"
            >
                <button
                    type="button"
                    aria-pressed={filters.stage === 'all'}
                    onClick={() => update({ ...filters, stage: 'all' })}
                    className={cn(
                        'flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        filters.stage === 'all'
                            ? 'border-ring bg-accent'
                            : 'hover:bg-hover',
                    )}
                >
                    <span className="text-sm text-muted-foreground">All applications</span>
                    <span className="text-[26px] leading-8 font-semibold text-foreground">
                        {scopedApplications.length}
                    </span>
                </button>
                {stages.map((stage) => (
                    <button
                        key={stage.key}
                        type="button"
                        aria-pressed={filters.stage === stage.key}
                        onClick={() =>
                            update({ ...filters, stage: stage.key })
                        }
                        className={cn(
                            'flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                            filters.stage === stage.key
                                ? 'border-ring bg-accent'
                                : 'hover:bg-hover',
                        )}
                    >
                        <span className="text-sm text-muted-foreground">{stage.label}</span>
                        <span className="text-[26px] leading-8 font-semibold text-foreground">
                            {stage.count}
                        </span>
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:flex-wrap md:items-end">
                <div className="flex flex-1 flex-col gap-1.5 md:min-w-56">
                    <Label htmlFor="application-search">Search</Label>
                    <div className="relative">
                        <Search
                            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="application-search"
                            className="pl-9"
                            placeholder="Search candidate, job or client…"
                            value={filters.query}
                            onChange={(event) =>
                                update({ ...filters, query: event.target.value })
                            }
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 md:w-56">
                    <Label htmlFor="job-filter">Job</Label>
                    <Select
                        value={filters.jobId}
                        onValueChange={(value) => update({ ...filters, jobId: value })}
                    >
                        <SelectTrigger id="job-filter" aria-label="Filter by job">
                            <SelectValue placeholder="All jobs">
                                {filters.jobId === 'all' ? 'All jobs'
                                    : jobs.find((job) => job.id === filters.jobId)?.title
                                        ?? applications.find((row) => row.jobId === filters.jobId)?.jobTitle
                                        ?? 'Unavailable job'}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All jobs</SelectItem>
                            {jobs.map((job) => (
                                <SelectItem key={job.id} value={job.id}>
                                    {job.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5 md:w-56">
                    <Label htmlFor="client-filter">Client</Label>
                    <Select
                        value={filters.clientId}
                        onValueChange={(value) => update({ ...filters, clientId: value })}
                    >
                        <SelectTrigger id="client-filter" aria-label="Filter by client">
                            <SelectValue placeholder="All clients">
                                {filters.clientId === 'all' ? 'All clients'
                                    : clients.find((client) => client.id === filters.clientId)?.name ?? 'Unavailable client'}
                            </SelectValue>
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
                <Button
                    variant="outline"
                    size="sm"
                    aria-pressed={filters.review}
                    onClick={() =>
                        update({ ...filters, review: !filters.review })
                    }
                >
                    Awaiting review
                </Button>
                {filtersSet ? (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X aria-hidden="true" />
                        Clear filters
                    </Button>
                ) : null}
            </div>

            {filters.review && !reviewSupported ? (
                <p role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    Review-stage filtering needs a database update — showing all
                    applications instead.
                </p>
            ) : null}

            <span role="status" className="text-xs text-muted-foreground">
                {visible.length} application{visible.length === 1 ? '' : 's'}
                {capped
                    ? ' · Showing the latest 500 applications; filters apply to loaded records'
                    : ''}
            </span>

            {visible.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
                    <p className="text-sm font-medium text-foreground">No applications found</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        {applications.length === 0
                            ? 'Applications appear here once candidates are linked to jobs.'
                            : 'Try clearing the filters.'}
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Candidate</TableHead>
                                <TableHead>Job</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Stage</TableHead>
                                <TableHead>Received</TableHead>
                                <TableHead>Reference</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visible.map((row) => (
                                <TableRow key={row.applicationId}>
                                    <TableCell>
                                        <a
                                            href={`/staff/candidates/${row.candidateId}`}
                                            className="font-medium text-foreground underline-offset-4 hover:underline"
                                        >
                                            {row.candidateName ?? 'Unnamed'}
                                        </a>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        <a
                                            href={`/staff/jobs/${row.jobId}`}
                                            className="underline-offset-4 hover:underline"
                                        >
                                            {row.jobTitle}
                                        </a>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        <a
                                            href={`/staff/clients/${row.clientId}`}
                                            className="underline-offset-4 hover:underline"
                                        >
                                            {row.clientName}
                                        </a>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={KIND_TONE[row.stageKind] ?? 'secondary'}>
                                            {row.stageLabel}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {formatDate(row.receivedAt)}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                        {row.publicReference}
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

'use client';

import { CircleAlert, LayoutGrid, Search, Table2, X } from 'lucide-react';

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
import { cn } from '@/lib/utils';

import { ApplicationResults } from './application-results';
import {
    baseApplicationRows,
    dateRangeInvalid,
    stageCounts,
    visibleApplicationRows,
    type ApplicationFilters,
    type ApplicationRow,
} from './application-model';
import { DEMO_TODAY, DEMO_USER, OWNERS, formatReceivedDate } from './demo-data';
import { PageHeader } from './shared';
import type { ApplicationStage, DemoClient, DemoJob } from './types';

function filtersNeedClear(filters: ApplicationFilters): boolean {
    return (
        filters.query.trim() !== ''
        || filters.clientId !== 'all'
        || filters.jobId !== 'all'
        || filters.stage !== 'all'
        || filters.owner !== 'all'
        || filters.dateRange !== 'all'
        || filters.from !== ''
        || filters.to !== ''
    );
}

export function ApplicationList({
    rows,
    clients,
    jobs,
    filters,
    onFiltersChange,
}: {
    rows: ApplicationRow[];
    clients: DemoClient[];
    jobs: DemoJob[];
    filters: ApplicationFilters;
    onFiltersChange: (filters: ApplicationFilters) => void;
}) {
    const baseRows = baseApplicationRows(rows, filters);
    const visibleRows = visibleApplicationRows(baseRows, filters);
    const counts = stageCounts(baseRows);
    const invalidRange = dateRangeInvalid(filters);

    const update = (patch: Partial<ApplicationFilters>) =>
        onFiltersChange({ ...filters, ...patch });

    const clearFilters = () =>
        onFiltersChange({
            ...filters,
            query: '',
            clientId: 'all',
            jobId: 'all',
            stage: 'all',
            owner: 'all',
            dateRange: 'all',
            from: '',
            to: '',
        });

    const scopedClient =
        filters.clientId === 'all'
            ? null
            : (clients.find((c) => c.id === filters.clientId) ?? null);
    const clientLabel = filters.clientId === 'all' ? null : (scopedClient?.name ?? filters.clientId);
    const scopedJob =
        filters.jobId === 'all'
            ? null
            : (jobs.find((j) => j.id === filters.jobId) ?? null);
    const jobLabel = filters.jobId === 'all' ? null : (scopedJob?.title ?? filters.jobId);

    const stageCard = (
        value: 'all' | ApplicationStage,
        label: string,
        count: number,
        countClass: string,
    ) => {
        const active = filters.stage === value;
        return (
            <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ stage: value })}
                className={cn(
                    'flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'border-ring bg-accent' : 'hover:border-input hover:bg-hover',
                )}
            >
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={cn('text-[26px] leading-8 font-semibold', countClass)}>
                    {count}
                </span>
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Workspace"
                title={clientLabel ? `Applications · ${clientLabel}` : 'Applications'}
                description={
                    jobLabel
                        ? `${jobLabel}${clientLabel ? ` · ${clientLabel}` : ''}`
                        : clientLabel
                          ? `All applications for ${clientLabel}.`
                          : 'Review candidates across your clients and open roles.'
                }
                actions={
                    scopedClient ? (
                        <Button variant="outline" asChild>
                            <a href={`#/clients/${scopedClient.id}`}>View client</a>
                        </Button>
                    ) : undefined
                }
            />
            <p className="-mt-4 text-xs text-muted-foreground">
                Sample timeline: {formatReceivedDate(DEMO_TODAY)}
            </p>

            {clientLabel ? (
                <section
                    aria-label="Current application context"
                    className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                            Client context
                        </span>
                        <span className="text-base font-semibold text-foreground">
                            {clientLabel}
                        </span>
                        {jobLabel ? (
                            <span className="text-sm text-muted-foreground">
                                Job · {jobLabel}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {scopedClient ? (
                            <Button variant="outline" size="sm" asChild>
                                <a href={`#/clients/${scopedClient.id}`}>Open client</a>
                            </Button>
                        ) : null}
                        {scopedJob ? (
                            <Button variant="outline" size="sm" asChild>
                                <a href={`#/jobs/${scopedJob.id}`}>Open job</a>
                            </Button>
                        ) : null}
                    </div>
                </section>
            ) : null}

            <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                role="group"
                aria-label="Stage filter cards"
            >
                {stageCard('all', 'All applications', counts.all, 'text-foreground')}
                {stageCard('New', 'New', counts.New, 'text-accent-foreground')}
                {stageCard('Reviewing', 'Reviewing', counts.Reviewing, 'text-warning-foreground')}
                {stageCard('Interview', 'Interview', counts.Interview, 'text-[#7c3aed]')}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex flex-1 flex-col gap-1.5">
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
                                onChange={(event) => update({ query: event.target.value })}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5 md:w-44">
                        <Label htmlFor="client-filter">Client</Label>
                        <Select
                            value={filters.clientId}
                            onValueChange={(value) => update({ clientId: value, jobId: 'all' })}
                        >
                            <SelectTrigger id="client-filter" aria-label="Filter by client">
                                <SelectValue placeholder="All clients" />
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
                    <div className="flex flex-col gap-1.5 md:w-44">
                        <Label htmlFor="owner-filter">Owner</Label>
                        <Select
                            value={filters.owner}
                            onValueChange={(value) => update({ owner: value })}
                        >
                            <SelectTrigger id="owner-filter" aria-label="Filter by owner">
                                <SelectValue placeholder="All owners" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All owners</SelectItem>
                                <SelectItem value="mine">Mine · {DEMO_USER}</SelectItem>
                                {OWNERS.map((owner) => (
                                    <SelectItem key={owner} value={owner}>
                                        {owner}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5 md:w-40">
                        <Label htmlFor="date-filter">Received</Label>
                        <Select
                            value={filters.dateRange}
                            onValueChange={(value) =>
                                update({
                                    dateRange: value as ApplicationFilters['dateRange'],
                                    ...(value === 'custom' ? {} : { from: '', to: '' }),
                                })
                            }
                        >
                            <SelectTrigger id="date-filter" aria-label="Filter by received date">
                                <SelectValue placeholder="All dates" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All dates</SelectItem>
                                <SelectItem value="7d">Last 7 days</SelectItem>
                                <SelectItem value="30d">Last 30 days</SelectItem>
                                <SelectItem value="custom">Custom range</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {filtersNeedClear(filters) ? (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>
                            <X aria-hidden="true" />
                            Clear filters
                        </Button>
                    ) : null}
                </div>
                {filters.dateRange === 'custom' ? (
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="date-from">From</Label>
                            <Input
                                id="date-from"
                                type="date"
                                className="w-40"
                                value={filters.from}
                                onChange={(event) => update({ from: event.target.value })}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="date-to">To</Label>
                            <Input
                                id="date-to"
                                type="date"
                                className="w-40"
                                value={filters.to}
                                onChange={(event) => update({ to: event.target.value })}
                            />
                        </div>
                    </div>
                ) : null}
                {invalidRange ? (
                    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                        <CircleAlert className="h-4 w-4" aria-hidden="true" />
                        The From date is after the To date — adjust the custom range.
                    </p>
                ) : null}
            </div>

            {clientLabel || jobLabel ? (
                <div className="flex flex-wrap items-center gap-2">
                    {clientLabel ? (
                        <Badge variant="accent" className="gap-1">
                            Client: {clientLabel}
                            <button
                                type="button"
                                aria-label={`Remove client filter ${clientLabel}`}
                                className="rounded-full outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => update({ clientId: 'all', jobId: 'all' })}
                            >
                                <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    ) : null}
                    {jobLabel ? (
                        <Badge variant="accent" className="gap-1">
                            Job: {jobLabel}
                            <button
                                type="button"
                                aria-label={`Remove job filter ${jobLabel}`}
                                className="rounded-full outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => update({ jobId: 'all' })}
                            >
                                <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <span role="status" className="text-xs text-muted-foreground">
                    {invalidRange
                        ? 'Fix the date range to see results'
                        : `${visibleRows.length} application${visibleRows.length === 1 ? '' : 's'}`}
                </span>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <Label htmlFor="group-by" className="text-xs text-muted-foreground">
                            Group by
                        </Label>
                        <Select
                            value={filters.groupBy}
                            onValueChange={(value) =>
                                update({ groupBy: value as ApplicationFilters['groupBy'] })
                            }
                        >
                            <SelectTrigger id="group-by" aria-label="Group by" className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="client">Client</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div
                        className="flex items-center rounded-lg border border-border"
                        role="group"
                        aria-label="Results view"
                    >
                        <button
                            type="button"
                            aria-pressed={filters.view === 'table'}
                            onClick={() => update({ view: 'table' })}
                            className={cn(
                                'flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                filters.view === 'table'
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-hover',
                            )}
                        >
                            <Table2 className="h-4 w-4" aria-hidden="true" />
                            Table
                        </button>
                        <button
                            type="button"
                            aria-pressed={filters.view === 'cards'}
                            onClick={() => update({ view: 'cards' })}
                            className={cn(
                                'flex items-center gap-1.5 rounded-r-lg border-l border-border px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                filters.view === 'cards'
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-hover',
                            )}
                        >
                            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                            Cards
                        </button>
                    </div>
                </div>
            </div>

            {invalidRange ? null : (
                <ApplicationResults
                    rows={visibleRows}
                    view={filters.view}
                    groupBy={filters.groupBy}
                    onClearFilters={clearFilters}
                />
            )}
        </div>
    );
}

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Briefcase, Search, X } from 'lucide-react';

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
import { EmptyState, PageHeader, StatusBadge, TagPill } from '@/components/staff-preview/shared';
import { cn } from '@/lib/utils';
import { flagParam, optionParam, textParam, uuidParam } from '../filter-params';

export interface JobRow {
    id: string;
    clientId: string;
    clientName: string;
    clientIsStealth: boolean;
    title: string;
    publicationState: string;
    applicationState: string;
    ownerMembershipId: string | null;
    draftRevisionId: string | null;
    createdAt: string;
}

type SortKey = 'title' | 'client' | 'publication';
type SortDirection = 'asc' | 'desc';

export interface JobFiltersState {
    query: string;
    clientId: string;
    state: string;
    intake: string;
    mine: boolean;
    sortBy: SortKey;
    sortDirection: SortDirection;
}

const STATE_OPTIONS = [
    { value: 'all', label: 'All publications' },
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
    { value: 'withdrawn', label: 'Withdrawn' },
    { value: 'archived', label: 'Archived' },
];

const INTAKE_OPTIONS = [
    { value: 'all', label: 'All intake' },
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
];

const publicationTone = (state: string) =>
    state === 'published' ? 'success' : state === 'draft' ? 'secondary' : 'outline';

function syncUrl(filters: JobFiltersState) {
    const params = new URLSearchParams();
    if (filters.query.trim()) params.set('q', filters.query);
    if (filters.clientId !== 'all') params.set('client', filters.clientId);
    if (filters.state !== 'all') params.set('state', filters.state);
    if (filters.intake !== 'all') params.set('intake', filters.intake);
    if (filters.mine) params.set('mine', '1');
    if (filters.sortBy !== 'title') params.set('sort', filters.sortBy);
    if (filters.sortDirection !== 'asc') params.set('dir', filters.sortDirection);
    const query = params.toString();
    window.history.replaceState(
        null, '', `/staff/jobs${query ? `?${query}` : ''}`);
}

const STATE_VALUES = STATE_OPTIONS.map((option) => option.value);
const INTAKE_VALUES = INTAKE_OPTIONS.map((option) => option.value);
const SORT_VALUES: SortKey[] = ['title', 'client', 'publication'];

const parseFilters = (params: { get(name: string): string | null }): JobFiltersState => ({
    query: textParam(params, 'q'),
    clientId: uuidParam(params, 'client'),
    state: optionParam(params, 'state', STATE_VALUES, 'all'),
    intake: optionParam(params, 'intake', INTAKE_VALUES, 'all'),
    mine: flagParam(params, 'mine') || params.get('owner') === 'me',
    sortBy: optionParam(params, 'sort', SORT_VALUES, 'title'),
    sortDirection: params.get('dir') === 'desc' ? 'desc' : 'asc',
});

export function JobsBrowser({
    jobs,
    clients,
    currentMembershipId,
    canCreate,
    capped,
}: {
    jobs: JobRow[];
    clients: { id: string; name: string }[];
    currentMembershipId: string;
    canCreate: boolean;
    capped: boolean;
}) {
    const searchParams = useSearchParams();
    const filters = parseFilters(searchParams);

    const update = (next: JobFiltersState) => {
        syncUrl(next);
    };

    const filteredJobs = useMemo(() => {
        const needle = filters.query.trim().toLowerCase();
        return jobs.filter((job) => {
            if (filters.clientId !== 'all' && job.clientId !== filters.clientId) return false;
            if (filters.state !== 'all' && job.publicationState !== filters.state) return false;
            if (filters.intake !== 'all' && job.applicationState !== filters.intake) return false;
            if (filters.mine && job.ownerMembershipId !== currentMembershipId) return false;
            if (needle) {
                const haystack = `${job.title} ${job.clientName}`.toLowerCase();
                if (!haystack.includes(needle)) return false;
            }
            return true;
        });
    }, [jobs, filters, currentMembershipId]);

    const direction = filters.sortDirection === 'asc' ? 1 : -1;
    const sortedJobs = filteredJobs.slice().sort((left, right) => {
        const comparison =
            filters.sortBy === 'client'
                ? left.clientName.localeCompare(right.clientName)
                : filters.sortBy === 'publication'
                  ? left.publicationState.localeCompare(right.publicationState)
                  : left.title.localeCompare(right.title);
        return comparison * direction || left.title.localeCompare(right.title);
    });

    const filtersActive =
        filters.query.trim() !== ''
        || filters.clientId !== 'all'
        || filters.state !== 'all'
        || filters.intake !== 'all'
        || filters.mine;

    const clearFilters = () =>
        update({ ...filters, query: '', clientId: 'all', state: 'all', intake: 'all', mine: false });

    const toggleSort = (key: SortKey) => {
        update({
            ...filters,
            sortBy: key,
            sortDirection:
                filters.sortBy === key && filters.sortDirection === 'asc'
                    ? 'desc'
                    : 'asc',
        });
    };

    const sortableHead = (key: SortKey, label: string, className?: string) => {
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
                    canCreate ? (
                        <Button asChild>
                            <Link href="/staff/jobs/new">Add job</Link>
                        </Button>
                    ) : undefined
                }
            />

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:flex-wrap md:items-end">
                <div className="flex flex-1 flex-col gap-1.5 md:min-w-56">
                    <Label htmlFor="job-search">Search</Label>
                    <div className="relative">
                        <Search
                            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="job-search"
                            className="pl-9"
                            placeholder="Search title or client…"
                            value={filters.query}
                            onChange={(event) =>
                                update({ ...filters, query: event.target.value })
                            }
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 md:w-56">
                    <Label htmlFor="job-client-filter">Client</Label>
                    <Select
                        value={filters.clientId}
                        onValueChange={(value) =>
                            update({ ...filters, clientId: value })
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
                <div className="flex flex-col gap-1.5 md:w-44">
                    <Label htmlFor="job-state-filter">Publication</Label>
                    <Select
                        value={filters.state}
                        onValueChange={(value) => update({ ...filters, state: value })}
                    >
                        <SelectTrigger id="job-state-filter" aria-label="Filter by publication state">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5 md:w-36">
                    <Label htmlFor="job-intake-filter">Intake</Label>
                    <Select
                        value={filters.intake}
                        onValueChange={(value) => update({ ...filters, intake: value })}
                    >
                        <SelectTrigger id="job-intake-filter" aria-label="Filter by intake state">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {INTAKE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    aria-pressed={filters.mine}
                    onClick={() => update({ ...filters, mine: !filters.mine })}
                >
                    Owned by me
                </Button>
                {filtersActive ? (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X aria-hidden="true" />
                        Clear filters
                    </Button>
                ) : null}
            </div>

            <p role="status" className="text-xs text-muted-foreground">
                {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'}
                {capped
                    ? ' · Showing the latest 500 jobs; filters apply to loaded records'
                    : ''}
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
                                {sortableHead('title', 'Title')}
                                {sortableHead('client', 'Client')}
                                {sortableHead('publication', 'Publication')}
                                <TableHead>Intake</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedJobs.map((job) => (
                                <TableRow
                                    key={job.id}
                                    className={cn(
                                        job.publicationState === 'draft' && 'bg-muted',
                                    )}
                                >
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <Link
                                                href={`/staff/jobs/${job.id}`}
                                                className="w-fit rounded-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {job.title}
                                            </Link>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Link
                                            href={`/staff/clients/${job.clientId}`}
                                            className="rounded-sm text-muted-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {job.clientName}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <StatusBadge tone={publicationTone(job.publicationState)}>
                                                {job.publicationState}
                                            </StatusBadge>
                                            {job.draftRevisionId ? (
                                                <TagPill>Draft changes</TagPill>
                                            ) : null}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">
                                            {job.applicationState}
                                        </Badge>
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

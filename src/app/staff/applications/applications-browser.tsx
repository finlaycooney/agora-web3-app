'use client';

import { useMemo, useState } from 'react';
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

interface ApplicationRow {
    applicationId: string;
    candidateId: string;
    candidateName: string | null;
    jobId: string;
    jobTitle: string;
    clientName: string;
    stageKey: string;
    stageLabel: string;
    stageKind: string;
    publicReference: string;
    receivedAt: string;
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

export function ApplicationsBrowser({
    applications,
    jobs,
}: {
    applications: ApplicationRow[];
    jobs: { id: string; title: string }[];
}) {
    const [query, setQuery] = useState('');
    const [jobId, setJobId] = useState('all');
    const [stageKey, setStageKey] = useState('all');

    const stages = useMemo(() => {
        const seen = new Map<string, { label: string; kind: string; count: number }>();
        for (const row of applications) {
            const existing = seen.get(row.stageKey);
            if (existing) {
                existing.count += 1;
            } else {
                seen.set(row.stageKey, {
                    label: row.stageLabel, kind: row.stageKind, count: 1,
                });
            }
        }
        return Array.from(seen.entries()).map(([key, value]) => ({ key, ...value }));
    }, [applications]);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return applications.filter((row) => {
            if (jobId !== 'all' && row.jobId !== jobId) return false;
            if (stageKey !== 'all' && row.stageKey !== stageKey) return false;
            if (needle) {
                const haystack = `${row.candidateName ?? ''} ${row.jobTitle} ${row.clientName} ${row.publicReference}`.toLowerCase();
                if (!haystack.includes(needle)) return false;
            }
            return true;
        });
    }, [applications, query, jobId, stageKey]);

    const filtersSet = query.trim() !== '' || jobId !== 'all' || stageKey !== 'all';

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
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        Review candidates across your clients and open roles.
                    </p>
                </div>
            </div>

            <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                role="group"
                aria-label="Stage filter cards"
            >
                <button
                    type="button"
                    aria-pressed={stageKey === 'all'}
                    onClick={() => setStageKey('all')}
                    className={cn(
                        'flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        stageKey === 'all' ? 'border-ring bg-accent' : 'hover:bg-hover',
                    )}
                >
                    <span className="text-sm text-muted-foreground">All applications</span>
                    <span className="text-[26px] leading-8 font-semibold text-foreground">
                        {applications.length}
                    </span>
                </button>
                {stages.map((stage) => (
                    <button
                        key={stage.key}
                        type="button"
                        aria-pressed={stageKey === stage.key}
                        onClick={() => setStageKey(stage.key)}
                        className={cn(
                            'flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                            stageKey === stage.key ? 'border-ring bg-accent' : 'hover:bg-hover',
                        )}
                    >
                        <span className="text-sm text-muted-foreground">{stage.label}</span>
                        <span className="text-[26px] leading-8 font-semibold text-foreground">
                            {stage.count}
                        </span>
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-end">
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
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 md:w-56">
                    <Label htmlFor="job-filter">Job</Label>
                    <Select value={jobId} onValueChange={setJobId}>
                        <SelectTrigger id="job-filter" aria-label="Filter by job">
                            <SelectValue placeholder="All jobs" />
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
                {filtersSet ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setQuery('');
                            setJobId('all');
                            setStageKey('all');
                        }}
                    >
                        <X aria-hidden="true" />
                        Clear filters
                    </Button>
                ) : null}
            </div>

            <span role="status" className="text-xs text-muted-foreground">
                {visible.length} application{visible.length === 1 ? '' : 's'}
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
                                    {row.jobTitle}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {row.clientName}
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
            )}
        </div>
    );
}

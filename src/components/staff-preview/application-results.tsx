'use client';

import { Briefcase } from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import { Card, CardContent } from '@/components/staff-ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/staff-ui/table';

import { formatReceivedDate } from './demo-data';
import { CandidatePreviewLink } from './candidate-preview';
import { STAGE_TONES, type ApplicationRow } from './application-model';
import { EmptyState, InitialsAvatar, StatusBadge } from './shared';

function ApplicationTable({ rows }: { rows: ApplicationRow[] }) {
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead className="hidden md:table-cell">Client</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead className="hidden md:table-cell">Received</TableHead>
                        <TableHead className="hidden lg:table-cell">Owner</TableHead>
                        <TableHead className="hidden xl:table-cell">Source</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.id}>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <InitialsAvatar name={row.candidateName} size="sm" />
                                    <CandidatePreviewLink
                                        candidateId={row.candidateId}
                                        className="rounded-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {row.candidateName}
                                    </CandidatePreviewLink>
                                </div>
                            </TableCell>
                            <TableCell>{row.job}</TableCell>
                            <TableCell className="hidden md:table-cell">
                                <a
                                    href={`#/clients/${row.clientId}`}
                                    className="rounded-sm text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {row.client}
                                </a>
                            </TableCell>
                            <TableCell>
                                <StatusBadge tone={STAGE_TONES[row.stage]}>{row.stage}</StatusBadge>
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground md:table-cell">
                                {formatReceivedDate(row.receivedAt)}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground lg:table-cell">
                                {row.owner}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground xl:table-cell">
                                {row.source}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function ApplicationCards({ rows }: { rows: ApplicationRow[] }) {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
                <Card key={row.id} className="relative" data-testid={`application-card-${row.id}`}>
                    <CardContent className="flex flex-col gap-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <InitialsAvatar name={row.candidateName} />
                                <CandidatePreviewLink
                                    candidateId={row.candidateId}
                                    className="truncate rounded-sm text-sm font-semibold text-foreground outline-none after:absolute after:inset-0 hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {row.candidateName}
                                </CandidatePreviewLink>
                            </div>
                            <StatusBadge tone={STAGE_TONES[row.stage]}>{row.stage}</StatusBadge>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <a
                                href={`#/jobs/${row.jobId}`}
                                className="relative z-10 w-fit rounded-sm text-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {row.job}
                            </a>
                            <a
                                href={`#/clients/${row.clientId}`}
                                className="relative z-10 w-fit rounded-sm text-xs text-muted-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {row.client}
                            </a>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                                {row.candidateLocation} · {row.owner} · {row.source}
                            </span>
                            <span>Received {formatReceivedDate(row.receivedAt)}</span>
                        </div>
                        <Button variant="outline" size="sm" className="relative z-10 w-fit" asChild>
                            <a href={`#/candidates/${row.candidateId}`}>View candidate</a>
                        </Button>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export function ApplicationResults({
    rows,
    view,
    groupBy,
    onClearFilters,
}: {
    rows: ApplicationRow[];
    view: 'table' | 'cards';
    groupBy: 'none' | 'client';
    onClearFilters: () => void;
}) {
    if (rows.length === 0) {
        return (
            <EmptyState
                icon={Briefcase}
                title="No applications match these filters"
                description="Try a different search, or clear the filters to see everything."
                action={
                    <Button variant="outline" onClick={onClearFilters}>
                        Clear filters
                    </Button>
                }
            />
        );
    }

    if (groupBy === 'client') {
        const groups = new Map<string, { client: string; clientId: string; rows: ApplicationRow[] }>();
        for (const row of rows) {
            const group = groups.get(row.clientId);
            if (group) group.rows.push(row);
            else groups.set(row.clientId, { client: row.client, clientId: row.clientId, rows: [row] });
        }
        const ordered = Array.from(groups.values()).sort((a, b) =>
            a.client.localeCompare(b.client),
        );
        return (
            <div className="flex flex-col gap-6">
                {ordered.map((group) => (
                    <section key={group.clientId} className="flex flex-col gap-3">
                        <h2 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
                            <a
                                href={`#/clients/${group.clientId}`}
                                className="rounded-sm outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {group.client}
                            </a>
                            <span className="text-xs font-normal text-muted-foreground">
                                {group.rows.length} application{group.rows.length === 1 ? '' : 's'}
                            </span>
                        </h2>
                        {view === 'cards' ? (
                            <ApplicationCards rows={group.rows} />
                        ) : (
                            <ApplicationTable rows={group.rows} />
                        )}
                    </section>
                ))}
            </div>
        );
    }

    return view === 'cards' ? (
        <ApplicationCards rows={rows} />
    ) : (
        <ApplicationTable rows={rows} />
    );
}

'use client';

import { Building2, LayoutGrid, Search, Table2, X } from 'lucide-react';

import { Badge } from '@/components/staff-ui/badge';
import { Button } from '@/components/staff-ui/button';
import { Card, CardContent } from '@/components/staff-ui/card';
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
import { ClientPreviewLink, useClientPreview } from './client-preview';
import { isJobOpen } from './demo-data';
import type { ClientStatusFilter } from './preview-navigation';
import { EmptyState, InitialsAvatar, PageHeader, StatusBadge } from './shared';
import type { DemoClient, DemoJob } from './types';

export function ClientsOverview({
    clients,
    jobs,
    rows,
    query,
    onQueryChange,
    status,
    onStatusChange,
    view,
    onViewChange,
}: {
    clients: DemoClient[];
    jobs: DemoJob[];
    rows: ApplicationRow[];
    query: string;
    onQueryChange: (query: string) => void;
    status: ClientStatusFilter;
    onStatusChange: (status: ClientStatusFilter) => void;
    view: 'cards' | 'table';
    onViewChange: (view: 'cards' | 'table') => void;
}) {
    const clientPreview = useClientPreview();
    const term = query.trim().toLowerCase();
    const filteredClients = clients.filter((client) => {
        if (status !== 'all' && client.status !== status) return false;
        if (!term) return true;
        return `${client.name} ${client.industry} ${client.owner}`
            .toLowerCase()
            .includes(term);
    });

    const filtersActive = term !== '' || status !== 'all';
    const clearFilters = () => {
        onQueryChange('');
        onStatusChange('all');
    };

    const clientMetrics = (client: DemoClient) => {
        const openRoles = jobs.filter(
            (job) => job.clientId === client.id && isJobOpen(job),
        ).length;
        const clientRows = rows.filter((row) => row.clientId === client.id);
        const interviewing = clientRows.filter((row) => row.stage === 'Interview').length;
        return { openRoles, applications: clientRows.length, interviewing };
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Workspace"
                title="Clients"
                description="Your client relationships and hiring activity."
                actions={
                    <Button asChild>
                        <a href="#/clients/new">Add client</a>
                    </Button>
                }
            />

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-end">
                <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="client-search">Search clients</Label>
                    <div className="relative">
                        <Search
                            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="client-search"
                            className="pl-9"
                            placeholder="Search name, industry or owner…"
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 md:w-44">
                    <Label htmlFor="client-status-filter">Status</Label>
                    <Select
                        value={status}
                        onValueChange={(value) => onStatusChange(value as ClientStatusFilter)}
                    >
                        <SelectTrigger id="client-status-filter" aria-label="Filter clients by status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {filtersActive ? (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X aria-hidden="true" />
                        Clear filters
                    </Button>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-xs text-muted-foreground">
                    {filteredClients.length} client{filteredClients.length === 1 ? '' : 's'}
                </p>
                <div
                    className="flex items-center rounded-lg border border-border"
                    role="group"
                    aria-label="Clients view"
                >
                    <button
                        type="button"
                        aria-pressed={view === 'cards'}
                        onClick={() => onViewChange('cards')}
                        className={cn(
                            'flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                            view === 'cards'
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-hover',
                        )}
                    >
                        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                        Cards
                    </button>
                    <button
                        type="button"
                        aria-pressed={view === 'table'}
                        onClick={() => onViewChange('table')}
                        className={cn(
                            'flex items-center gap-1.5 rounded-r-lg border-l border-border px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                            view === 'table'
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-hover',
                        )}
                    >
                        <Table2 className="h-4 w-4" aria-hidden="true" />
                        Table
                    </button>
                </div>
            </div>

            {filteredClients.length === 0 ? (
                <EmptyState
                    icon={Building2}
                    title="No clients found"
                    description="Try a different name, industry, owner or status."
                    action={
                        filtersActive ? (
                            <Button variant="outline" onClick={clearFilters}>
                                Clear filters
                            </Button>
                        ) : undefined
                    }
                />
            ) : view === 'table' ? (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Client</TableHead>
                                <TableHead className="hidden md:table-cell">Industry</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden sm:table-cell">Owner</TableHead>
                                <TableHead className="hidden lg:table-cell">Open roles</TableHead>
                                <TableHead className="hidden lg:table-cell">Applications</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClients.map((client) => {
                                const metrics = clientMetrics(client);
                                return (
                                    <TableRow
                                        key={client.id}
                                        data-testid={`client-row-${client.id}`}
                                        data-status={client.status}
                                        className={cn(
                                            'cursor-pointer',
                                            client.status === 'draft' && 'bg-muted',
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
                                            clientPreview?.open(
                                                client.id,
                                                trigger ?? (event.currentTarget as HTMLElement),
                                            );
                                        }}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <InitialsAvatar name={client.name} size="sm" />
                                                <div className="flex min-w-0 flex-col">
                                                    <ClientPreviewLink
                                                        clientId={client.id}
                                                        className="w-fit rounded-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        {client.name}
                                                    </ClientPreviewLink>
                                                    <span className="text-xs text-muted-foreground">
                                                        {client.location}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden text-muted-foreground md:table-cell">
                                            {client.industry}
                                        </TableCell>
                                        <TableCell>
                                            <span className="flex flex-wrap items-center gap-1.5">
                                                <StatusBadge
                                                    tone={
                                                        client.status === 'draft'
                                                            ? 'secondary'
                                                            : 'success'
                                                    }
                                                >
                                                    {client.status === 'draft'
                                                        ? 'Draft'
                                                        : 'Active'}
                                                </StatusBadge>
                                                {client.isStealth ? (
                                                    <Badge variant="outline">Stealth</Badge>
                                                ) : null}
                                            </span>
                                        </TableCell>
                                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                                            {client.owner}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell">
                                            <a
                                                href={`#/jobs?client=${client.id}`}
                                                className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {metrics.openRoles} open
                                            </a>
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell">
                                            <a
                                                href={`#/applications?client=${client.id}`}
                                                className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {metrics.applications} application
                                                {metrics.applications === 1 ? '' : 's'}
                                            </a>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredClients.map((client) => {
                        const metrics = clientMetrics(client);
                        const metricLink = (href: string, label: string, value: number) => (
                            <a
                                href={href}
                                className="relative z-10 flex flex-col items-center gap-0.5 rounded-lg bg-secondary/40 px-2 py-2 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="text-[11px] text-muted-foreground">{label}</span>
                                <span className="text-sm font-semibold text-foreground">
                                    {value}
                                </span>
                            </a>
                        );
                        return (
                            <Card
                                key={client.id}
                                className={cn(
                                    'relative',
                                    client.status === 'draft' && 'bg-muted',
                                )}
                                data-testid={`client-card-${client.id}`}
                            >
                                <CardContent className="flex flex-col gap-4 p-5">
                                    <div className="flex items-center gap-3">
                                        <InitialsAvatar name={client.name} />
                                        <div className="flex min-w-0 flex-col">
                                            <a
                                                href={`#/clients/${client.id}`}
                                                className="truncate rounded-sm text-sm font-semibold text-foreground outline-none after:absolute after:inset-0 hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {client.name}
                                            </a>
                                            <span className="text-xs text-muted-foreground">
                                                {client.industry} · {client.location}
                                            </span>
                                        </div>
                                        <div className="relative z-10 ml-auto flex w-fit flex-col items-end gap-1">
                                            {client.status === 'draft' ? (
                                                <StatusBadge tone="secondary">Draft</StatusBadge>
                                            ) : null}
                                            {client.isStealth ? (
                                                <Badge variant="outline">
                                                    Identity hidden externally
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        {metricLink(
                                            `#/jobs?client=${client.id}`,
                                            'Open roles',
                                            metrics.openRoles,
                                        )}
                                        {metricLink(
                                            `#/applications?client=${client.id}`,
                                            'Applications',
                                            metrics.applications,
                                        )}
                                        {metricLink(
                                            `#/applications?client=${client.id}&stage=Interview`,
                                            'Interviewing',
                                            metrics.interviewing,
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            Owner · {client.owner}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {client.status === 'draft' ? (
                                                <a
                                                    href={`#/clients/${client.id}/edit`}
                                                    className="relative z-10 rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    Finish draft
                                                </a>
                                            ) : null}
                                            <a
                                                href={`#/clients/${client.id}`}
                                                className="relative z-10 rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                View client
                                            </a>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

'use client';

import {
    createContext,
    useContext,
    useLayoutEffect,
    useRef,
    useState,
    type AnchorHTMLAttributes,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    type RefObject,
} from 'react';

import { Badge } from '@/components/staff-ui/badge';
import { Button } from '@/components/staff-ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from '@/components/staff-ui/sheet';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/staff-ui/table';

import type { ApplicationRow } from './application-model';
import { STAGE_TONES } from './application-model';
import {
    SOCIAL_PLATFORM_LABELS,
    isJobOpen,
    jobLocationLabel,
    jobStatusLabel,
} from './demo-data';
import { JobPreviewLink } from './job-preview';
import { CandidatePreviewLink } from './candidate-preview';
import { InitialsAvatar, StatusBadge, TagPill } from './shared';
import type { BadgeTone, DemoClient, DemoJob } from './types';

interface ClientPreviewActions {
    open: (id: string, trigger: HTMLElement) => void;
}

const ClientPreviewContext = createContext<ClientPreviewActions | null>(null);

export function useClientPreview(): ClientPreviewActions | null {
    return useContext(ClientPreviewContext);
}

export function ClientPreviewLink({
    clientId,
    children,
    onClick,
    ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { clientId: string }) {
    const preview = useClientPreview();
    return (
        <a
            href={`#/clients/${clientId}`}
            data-preview-trigger={`client:${clientId}`}
            onClick={(event) => {
                if (
                    preview
                    && event.button === 0
                    && !event.metaKey
                    && !event.ctrlKey
                    && !event.shiftKey
                    && !event.altKey
                ) {
                    event.preventDefault();
                    preview.open(clientId, event.currentTarget);
                }
                onClick?.(event);
            }}
            {...props}
        >
            {children}
        </a>
    );
}

export function ClientPreviewProvider({
    preview,
    onOpenRequest,
    onClose,
    onNavigate,
    bodyRef,
    triggerRef,
    clients,
    jobs,
    rows,
    children,
}: {
    preview: { id: string; scrollTop: number } | null;
    onOpenRequest: (id: string, trigger: HTMLElement) => void;
    onClose: () => void;
    onNavigate: (hash: string) => void;
    bodyRef?: (element: HTMLDivElement | null) => void;
    triggerRef: RefObject<HTMLElement | null>;
    clients: DemoClient[];
    jobs: DemoJob[];
    rows: ApplicationRow[];
    children: ReactNode;
}) {
    const [lastClient, setLastClient] = useState<DemoClient | null>(null);
    const client = preview ? clients.find((entry) => entry.id === preview.id) : undefined;
    if (client && client !== lastClient) {
        setLastClient(client);
    }
    const displayClient = client ?? lastClient;
    const innerBodyRef = useRef<HTMLDivElement | null>(null);
    const previewId = preview?.id;
    const previewScrollTop = preview?.scrollTop ?? 0;
    useLayoutEffect(() => {
        if (innerBodyRef.current && previewScrollTop > 0) {
            innerBodyRef.current.scrollTop = previewScrollTop;
        }
    }, [previewId, previewScrollTop]);

    const onPreviewLinkClick = (event: ReactMouseEvent<HTMLElement>) => {
        if (
            event.defaultPrevented
            || event.button !== 0
            || event.metaKey
            || event.ctrlKey
            || event.shiftKey
            || event.altKey
        ) {
            return;
        }
        const anchor = (event.target as HTMLElement).closest('a[href]');
        const href = anchor?.getAttribute('href');
        if (!href?.startsWith('#/')) return;
        event.preventDefault();
        onNavigate(href);
    };

    const clientJobs = displayClient
        ? jobs.filter((job) => job.clientId === displayClient.id)
        : [];
    const clientRows = displayClient
        ? rows.filter((row) => row.clientId === displayClient.id)
        : [];
    const openRoles = clientJobs.filter((job) => isJobOpen(job));

    return (
        <ClientPreviewContext.Provider
            value={{ open: (id, trigger) => onOpenRequest(id, trigger) }}
        >
            {children}
            <Sheet
                open={preview !== null}
                onOpenChange={(open) => {
                    if (!open) onClose();
                }}
            >
                <SheetContent
                    side="right"
                    className="w-full max-w-full gap-0 p-0 sm:max-w-[min(760px,70vw)]"
                    onClick={onPreviewLinkClick}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const trigger = triggerRef.current;
                        if (trigger?.isConnected) {
                            trigger.focus();
                            return;
                        }
                        const fallback = displayClient
                            ? document.querySelector<HTMLElement>(
                                  `[data-preview-trigger="client:${displayClient.id}"]`,
                              )
                            : null;
                        if (fallback?.isConnected) {
                            fallback.focus();
                            return;
                        }
                        const heading = document.querySelector<HTMLElement>('main h1');
                        if (heading) {
                            heading.setAttribute('tabindex', '-1');
                            heading.focus();
                        }
                    }}
                >
                    {displayClient ? (
                        <>
                            <div className="sticky top-0 border-b border-border bg-card">
                                <div className="flex items-center justify-between gap-3 px-5 pt-4 pr-12">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <InitialsAvatar name={displayClient.name} />
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <SheetTitle className="truncate text-base">
                                                {displayClient.name}
                                            </SheetTitle>
                                            <SheetDescription className="truncate">
                                                {displayClient.industry} · {displayClient.location}
                                            </SheetDescription>
                                        </div>
                                    </div>
                                    <Button size="sm" asChild>
                                        <a href={`#/clients/${displayClient.id}`}>
                                            Open full client
                                        </a>
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 px-5 pb-3 pt-3">
                                    {displayClient.status === 'draft' ? (
                                        <Button size="sm" variant="outline" asChild>
                                            <a href={`#/clients/${displayClient.id}/edit`}>
                                                Finish draft
                                            </a>
                                        </Button>
                                    ) : (
                                        <Button size="sm" variant="outline" asChild>
                                            <a href={`#/jobs/new?client=${displayClient.id}`}>
                                                Add job
                                            </a>
                                        </Button>
                                    )}
                                    <Button size="sm" variant="outline" asChild>
                                        <a href={`#/applications?client=${displayClient.id}`}>
                                            View applications
                                        </a>
                                    </Button>
                                </div>
                            </div>
                            <div
                                ref={(element) => {
                                    innerBodyRef.current = element;
                                    bodyRef?.(element);
                                }}
                                className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
                            >
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge
                                            tone={
                                                displayClient.status === 'draft'
                                                    ? 'secondary'
                                                    : 'success'
                                            }
                                        >
                                            {displayClient.status === 'draft'
                                                ? 'Draft client'
                                                : 'Active client'}
                                        </StatusBadge>
                                        <TagPill>Owner · {displayClient.owner}</TagPill>
                                        {displayClient.isStealth ? (
                                            <Badge variant="outline">
                                                Identity hidden externally
                                            </Badge>
                                        ) : null}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        {[
                                            ['Open roles', openRoles.length, `#/jobs?client=${displayClient.id}`],
                                            [
                                                'Applications',
                                                clientRows.length,
                                                `#/applications?client=${displayClient.id}`,
                                            ],
                                            [
                                                'Interviewing',
                                                clientRows.filter((row) => row.stage === 'Interview').length,
                                                `#/applications?client=${displayClient.id}&stage=Interview`,
                                            ],
                                        ].map(([label, value, href]) => (
                                            <a
                                                key={label}
                                                href={href as string}
                                                className="flex flex-col gap-0.5 rounded-lg bg-secondary/50 px-2 py-2 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <span className="text-[11px] text-muted-foreground">
                                                    {label}
                                                </span>
                                                <span className="text-sm font-semibold text-foreground">
                                                    {value}
                                                </span>
                                            </a>
                                        ))}
                                    </div>

                                    <section className="flex flex-col gap-3">
                                        <h2 className="text-sm font-semibold text-foreground">
                                            Client details
                                        </h2>
                                        <dl className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <dt className="text-xs text-muted-foreground">
                                                    Contact
                                                </dt>
                                                <dd className="text-sm text-foreground">
                                                    {displayClient.contactName ?? 'Not provided'}
                                                </dd>
                                                <dd className="text-xs text-muted-foreground">
                                                    {displayClient.contactEmail ?? 'No contact email'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-muted-foreground">
                                                    Website
                                                </dt>
                                                <dd className="text-sm text-foreground">
                                                    {displayClient.website ?? 'Not provided'}
                                                </dd>
                                            </div>
                                        </dl>
                                        {displayClient.socialLinks.length > 0 ? (
                                            <ul className="flex flex-wrap gap-2">
                                                {displayClient.socialLinks.map((link) => (
                                                    <li key={link.url}>
                                                        <a
                                                            href={link.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                        >
                                                            {SOCIAL_PLATFORM_LABELS[link.platform]}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        {displayClient.isStealth ? (
                                            <p className="rounded-lg bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                                                {displayClient.anonymousDescription}
                                            </p>
                                        ) : null}
                                    </section>

                                    <section className="flex flex-col gap-3">
                                        <h2 className="text-sm font-semibold text-foreground">
                                            Roles
                                        </h2>
                                        {clientJobs.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">
                                                {displayClient.status === 'draft'
                                                    ? 'Draft clients cannot receive roles yet.'
                                                    : 'No roles for this client yet.'}
                                            </p>
                                        ) : (
                                            <div className="overflow-hidden rounded-lg border border-border bg-card">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Role</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead className="hidden sm:table-cell">
                                                                Location
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {clientJobs.map((job) => (
                                                            <TableRow
                                                                key={job.id}
                                                                className={
                                                                    job.publicationState === 'draft'
                                                                        ? 'bg-muted'
                                                                        : undefined
                                                                }
                                                            >
                                                                <TableCell>
                                                                    <JobPreviewLink
                                                                        jobId={job.id}
                                                                        className="rounded-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                                    >
                                                                        {job.title}
                                                                    </JobPreviewLink>
                                                                </TableCell>
                                                                <TableCell>
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
                                                                </TableCell>
                                                                <TableCell className="hidden text-muted-foreground sm:table-cell">
                                                                    {jobLocationLabel(job)}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </section>

                                    <section className="flex flex-col gap-3">
                                        <h2 className="text-sm font-semibold text-foreground">
                                            Recent applications
                                        </h2>
                                        {clientRows.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">
                                                No applications for this client yet.
                                            </p>
                                        ) : (
                                            <div className="overflow-hidden rounded-lg border border-border bg-card">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Candidate</TableHead>
                                                            <TableHead>Job</TableHead>
                                                            <TableHead>Stage</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {clientRows.slice(0, 5).map((row) => (
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
                                                                <TableCell>
                                                                    <StatusBadge tone={STAGE_TONES[row.stage]}>
                                                                        {row.stage}
                                                                    </StatusBadge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <SheetTitle className="sr-only">Client preview</SheetTitle>
                            <SheetDescription className="sr-only">
                                The selected client is no longer available.
                            </SheetDescription>
                            <p className="px-5 py-8 text-sm text-muted-foreground">
                                This client is no longer available.
                            </p>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </ClientPreviewContext.Provider>
    );
}

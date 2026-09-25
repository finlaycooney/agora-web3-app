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

import { Button } from '@/components/staff-ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from '@/components/staff-ui/sheet';

import { Badge } from '@/components/staff-ui/badge';

import {
    employmentTypeLabel,
    jobLocationLabel,
    jobStatusLabel,
} from './demo-data';
import { JobDescription } from './job-description';
import { StatusBadge, TagPill } from './shared';
import type { BadgeTone, DemoClient, DemoJob } from './types';

interface JobPreviewActions {
    open: (id: string, trigger: HTMLElement) => void;
}

const JobPreviewContext = createContext<JobPreviewActions | null>(null);

export function useJobPreview(): JobPreviewActions | null {
    return useContext(JobPreviewContext);
}

export function JobPreviewLink({
    jobId,
    children,
    onClick,
    ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { jobId: string }) {
    const preview = useJobPreview();
    return (
        <a
            href={`#/jobs/${jobId}`}
            data-preview-trigger={`job:${jobId}`}
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
                    preview.open(jobId, event.currentTarget);
                }
                onClick?.(event);
            }}
            {...props}
        >
            {children}
        </a>
    );
}

export function JobPreviewProvider({
    preview,
    onOpenRequest,
    onClose,
    onNavigate,
    bodyRef,
    triggerRef,
    jobs,
    clients,
    children,
}: {
    preview: { id: string; scrollTop: number } | null;
    onOpenRequest: (id: string, trigger: HTMLElement) => void;
    onClose: () => void;
    onNavigate: (hash: string) => void;
    bodyRef?: (element: HTMLDivElement | null) => void;
    triggerRef: RefObject<HTMLElement | null>;
    jobs: DemoJob[];
    clients: DemoClient[];
    children: ReactNode;
}) {
    const [lastJob, setLastJob] = useState<DemoJob | null>(null);
    const job = preview ? jobs.find((entry) => entry.id === preview.id) : undefined;
    if (job && job !== lastJob) {
        setLastJob(job);
    }
    const displayJob = job ?? lastJob;
    const shown = displayJob ? (displayJob.draft ?? displayJob) : null;
    const client = shown
        ? clients.find((entry) => entry.id === shown.clientId)
        : undefined;
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

    return (
        <JobPreviewContext.Provider
            value={{
                open: (id, trigger) => onOpenRequest(id, trigger),
            }}
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
                    className="w-full max-w-full gap-0 p-0 sm:max-w-[min(900px,75vw)]"
                    onClick={onPreviewLinkClick}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const trigger = triggerRef.current;
                        if (trigger?.isConnected) {
                            trigger.focus();
                            return;
                        }
                        const fallback = displayJob
                            ? document.querySelector<HTMLElement>(
                                  `[data-preview-trigger="job:${displayJob.id}"]`,
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
                    {displayJob && shown ? (
                        <>
                            <div className="sticky top-0 border-b border-border bg-card">
                                <div className="flex items-center justify-between gap-3 px-5 pt-4 pr-12">
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <SheetTitle className="truncate text-base">
                                            {shown.title || displayJob.title}
                                        </SheetTitle>
                                        <SheetDescription className="truncate">
                                            {client?.name ?? shown.clientId} ·{' '}
                                            {jobLocationLabel(shown)}
                                        </SheetDescription>
                                    </div>
                                    <Button size="sm" asChild>
                                        <a href={`#/jobs/${displayJob.id}`}>Open full job</a>
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 px-5 pb-3 pt-3">
                                    <Button size="sm" variant="outline" asChild>
                                        <a href={`#/jobs/${displayJob.id}/edit`}>Edit job</a>
                                    </Button>
                                    <Button size="sm" variant="outline" asChild>
                                        <a
                                            href={`#/applications?client=${shown.clientId}&job=${displayJob.id}`}
                                        >
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
                                                (jobStatusLabel(displayJob) === 'Open'
                                                    ? 'success'
                                                    : jobStatusLabel(displayJob) === 'Draft'
                                                      ? 'secondary'
                                                      : 'outline') as BadgeTone
                                            }
                                        >
                                            {jobStatusLabel(displayJob)}
                                        </StatusBadge>
                                        {displayJob.draft ? (
                                            <TagPill>Draft changes</TagPill>
                                        ) : null}
                                        <TagPill>
                                            {employmentTypeLabel(shown.employmentType)}
                                        </TagPill>
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
                                                    <Badge variant="outline">
                                                        Identity hidden externally
                                                    </Badge>
                                                ) : null}
                                            </>
                                        ) : null}
                                    </div>
                                    <JobDescription
                                        job={{
                                            ...displayJob,
                                            descriptionDocument: shown.descriptionDocument,
                                        }}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <SheetTitle className="sr-only">Job preview</SheetTitle>
                            <SheetDescription className="sr-only">
                                The selected job is no longer available.
                            </SheetDescription>
                            <p className="px-5 py-8 text-sm text-muted-foreground">
                                This job is no longer available.
                            </p>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </JobPreviewContext.Provider>
    );
}

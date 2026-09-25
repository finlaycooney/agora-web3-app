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
import { Lock, ShieldAlert } from 'lucide-react';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/staff-ui/tabs';

import { STAGE_TONES } from './application-model';
import { CandidateDocuments } from './candidate-documents';
import { NoteComposer, NotesList } from './candidate-notes';
import { CandidateNotesPreview } from './candidate-notes-preview';
import { CandidateSummary } from './candidate-summary';
import { formatReceivedDate } from './demo-data';
import type { CandidateTab } from './preview-navigation';
import { InitialsAvatar, StatusBadge } from './shared';
import type { Candidate, PrivacyCase } from './types';

interface CandidatePreviewActions {
    open: (id: string, trigger: HTMLElement) => void;
}

const CandidatePreviewContext = createContext<CandidatePreviewActions | null>(null);

export function useCandidatePreview(): CandidatePreviewActions | null {
    return useContext(CandidatePreviewContext);
}

export function CandidatePreviewLink({
    candidateId,
    children,
    onClick,
    ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { candidateId: string }) {
    const preview = useCandidatePreview();
    return (
        <a
            href={`#/candidates/${candidateId}`}
            data-preview-trigger={`candidate:${candidateId}`}
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
                    preview.open(candidateId, event.currentTarget);
                }
                onClick?.(event);
            }}
            {...props}
        >
            {children}
        </a>
    );
}

function PreviewTabs({
    candidate,
    tab,
    onTabChange,
    onAddNote,
}: {
    candidate: Candidate;
    tab: CandidateTab;
    onTabChange: (tab: CandidateTab) => void;
    onAddNote: (id: string, body: string) => void;
}) {
    const [statusMessage, setStatusMessage] = useState('');
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const openNotes = (focusComposer: boolean) => {
        onTabChange('notes');
        if (focusComposer) {
            window.setTimeout(() => noteRef.current?.focus(), 0);
        }
    };
    return (
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as CandidateTab)}>
            <TabsList aria-label="Candidate preview sections" className="grid grid-cols-2 sm:flex">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="applications">
                    Applications
                    <Badge variant="secondary">{candidate.applications.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="documents">
                    Documents
                    <Badge variant="secondary">{candidate.documents.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="notes">
                    Notes
                    <Badge variant="secondary">{candidate.notes.length}</Badge>
                </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_250px]">
                    <CandidateSummary candidate={candidate} />
                    <CandidateNotesPreview
                        notes={candidate.notes}
                        onViewAll={() => openNotes(false)}
                        onAdd={() => openNotes(true)}
                    />
                </div>
            </TabsContent>
            <TabsContent value="applications">
                {candidate.applications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No applications yet for this candidate.
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Stage</TableHead>
                                    <TableHead className="hidden sm:table-cell">Received</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {candidate.applications.map((application) => (
                                    <TableRow key={application.id}>
                                        <TableCell>
                                            <a
                                                href={`#/jobs/${application.jobId}`}
                                                className="rounded-sm font-medium text-foreground outline-none hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {application.job}
                                            </a>
                                        </TableCell>
                                        <TableCell>{application.client}</TableCell>
                                        <TableCell>
                                            <StatusBadge tone={STAGE_TONES[application.stage]}>
                                                {application.stage}
                                            </StatusBadge>
                                        </TableCell>
                                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                                            {formatReceivedDate(application.receivedAt)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </TabsContent>
            <TabsContent value="documents">
                <CandidateDocuments candidate={candidate} />
            </TabsContent>
            <TabsContent value="notes">
                <div className="flex flex-col gap-4">
                    <NoteComposer
                        ref={noteRef}
                        onSave={(body) => {
                            onAddNote(candidate.id, body);
                            setStatusMessage('Demo note saved.');
                        }}
                    />
                    <p
                        role="status"
                        aria-live="polite"
                        className={
                            statusMessage
                                ? 'text-xs font-medium text-success-foreground'
                                : 'sr-only'
                        }
                    >
                        {statusMessage || 'Demo changes saved.'}
                    </p>
                    <NotesList notes={candidate.notes} />
                </div>
            </TabsContent>
        </Tabs>
    );
}

export function CandidatePreviewProvider({
    candidates,
    privacyCases,
    onAddNote,
    preview,
    onOpenRequest,
    onClose,
    onTabChange,
    onNavigate,
    bodyRef,
    triggerRef,
    children,
}: {
    candidates: Candidate[];
    privacyCases: PrivacyCase[];
    onAddNote: (id: string, body: string) => void;
    preview: { id: string; tab: CandidateTab; scrollTop: number } | null;
    onOpenRequest: (id: string, trigger: HTMLElement) => void;
    onClose: () => void;
    onTabChange: (tab: CandidateTab) => void;
    onNavigate: (hash: string) => void;
    bodyRef?: (element: HTMLDivElement | null) => void;
    triggerRef: RefObject<HTMLElement | null>;
    children: ReactNode;
}) {
    const [lastCandidate, setLastCandidate] = useState<Candidate | null>(null);
    const candidate = preview
        ? candidates.find((entry) => entry.id === preview.id)
        : undefined;
    if (candidate && candidate !== lastCandidate) {
        setLastCandidate(candidate);
    }
    const displayCandidate = candidate ?? lastCandidate;
    const privacyCase = preview
        ? privacyCases.find((entry) => entry.subjectId === preview.id)
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
        <CandidatePreviewContext.Provider
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
                        const fallback = displayCandidate
                            ? document.querySelector<HTMLElement>(
                                  `[data-preview-trigger="candidate:${displayCandidate.id}"]`,
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
                    {displayCandidate ? (
                        <>
                            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4 pr-12">
                                <div className="flex min-w-0 items-center gap-3">
                                    <InitialsAvatar name={displayCandidate.name} />
                                    <div className="flex min-w-0 flex-col">
                                        <SheetTitle className="truncate text-base">
                                            {displayCandidate.name}
                                        </SheetTitle>
                                        <SheetDescription className="truncate">
                                            {displayCandidate.restricted
                                                ? `Record ${displayCandidate.id}`
                                                : `${displayCandidate.headline} · ${displayCandidate.location}`}
                                        </SheetDescription>
                                    </div>
                                </div>
                                {!displayCandidate.restricted ? (
                                    <Button size="sm" asChild>
                                        <a href={`#/candidates/${displayCandidate.id}`}>
                                            Open full profile
                                        </a>
                                    </Button>
                                ) : null}
                            </div>
                            <div
                                ref={(element) => {
                                    innerBodyRef.current = element;
                                    bodyRef?.(element);
                                }}
                                className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
                            >
                                {displayCandidate.restricted ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge tone="restriction">Restricted</StatusBadge>
                                            <span className="text-xs text-muted-foreground">
                                                Record {displayCandidate.id}
                                            </span>
                                        </div>
                                        <div className="flex items-start gap-3 rounded-lg border border-restriction/60 bg-restriction/40 p-4">
                                            <ShieldAlert
                                                className="mt-0.5 h-4 w-4 shrink-0 text-restriction-foreground"
                                                aria-hidden="true"
                                            />
                                            <p className="text-sm text-restriction-foreground/90">
                                                Staff access to this record is restricted. Notes,
                                                contact details and documents are hidden in this
                                                preview.
                                            </p>
                                        </div>
                                        {privacyCase ? (
                                            <Button variant="outline" className="w-fit" asChild>
                                                <a href="#/privacy">
                                                    <Lock aria-hidden="true" />
                                                    Open privacy case {privacyCase.reference}
                                                </a>
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <PreviewTabs
                                        key={displayCandidate.id}
                                        candidate={displayCandidate}
                                        tab={preview?.tab ?? 'overview'}
                                        onTabChange={onTabChange}
                                        onAddNote={onAddNote}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <SheetTitle className="sr-only">Candidate preview</SheetTitle>
                            <SheetDescription className="sr-only">
                                The selected candidate is no longer available.
                            </SheetDescription>
                            <p className="px-5 py-8 text-sm text-muted-foreground">
                                This candidate is no longer available.
                            </p>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </CandidatePreviewContext.Provider>
    );
}

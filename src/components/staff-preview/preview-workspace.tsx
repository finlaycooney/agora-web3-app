'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    APPLICATION_STAGES,
    DEFAULT_APPLICATION_FILTERS,
    flattenApplicationRows,
    type ApplicationFilters,
} from './application-model';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/staff-ui/dialog';
import { Button } from '@/components/staff-ui/button';
import { EMPTY_JOB_DOCUMENT } from '@/lib/client-job-contracts.js';

import { ApplicationList } from './application-list';
import { CandidateDetail } from './candidate-detail';
import { CandidateList, type CandidateFilters } from './candidate-list';
import { CandidatePreviewProvider } from './candidate-preview';
import {
    ClientEditor,
    type ClientDraftInput,
    type ClientInput,
    type EditorGuard,
} from './client-editor';
import { ClientDetail } from './client-detail';
import { ClientPreviewProvider } from './client-preview';
import { ClientsOverview } from './clients-overview';
import {
    DEMO_TODAY,
    DEMO_USER,
    OWNERS,
    createDemoCandidates,
    createDemoClients,
    createDemoJobs,
    createDemoPrivacyCases,
    isJobOpen,
} from './demo-data';
import { ImportWizard } from './import-wizard';
import { JobDetail } from './job-detail';
import { JobEditor } from './job-editor';
import { JobPreviewProvider } from './job-preview';
import { JobsOverview } from './jobs-overview';
import {
    CANDIDATE_TABS,
    canonicalParent,
    parseHash,
    type CandidateTab,
    type ClientStatusFilter,
    type JobFilters,
    type PreviewRoute,
    type RecordPreview,
    type ViewSnapshot,
} from './preview-navigation';
import { PrivacyCases } from './privacy-cases';
import { usePreviewHistory } from './use-preview-history';
import { WorkspaceOverview } from './workspace-overview';
import { WorkspaceShell, type NotificationItem } from './workspace-shell';
import type {
    ApplicationStage,
    Candidate,
    CandidateApplication,
    DemoClient,
    DemoJob,
    JobFields,
    JobRevision,
    PreviewScreen,
} from './types';

const DEFAULT_CANDIDATE_FILTERS: CandidateFilters = {
    query: '',
    owner: 'all',
    tag: 'all',
    tab: 'all',
    page: 1,
};

const DEFAULT_JOB_FILTERS: JobFilters = {
    query: '',
    clientId: 'all',
    status: 'all',
    sortBy: 'title',
    sortDirection: 'asc',
};

function applicationFiltersFromQuery(
    query: URLSearchParams,
    current: ApplicationFilters,
    jobs: DemoJob[],
): ApplicationFilters | null {
    const clientParam = query.get('client');
    const jobParam = query.get('job');
    const stageParam = query.get('stage');
    const ownerParam = query.get('owner');
    if (
        clientParam === null
        && jobParam === null
        && stageParam === null
        && ownerParam === null
    ) {
        return null;
    }
    const next: ApplicationFilters = {
        ...DEFAULT_APPLICATION_FILTERS,
        view: current.view,
        groupBy: current.groupBy,
    };
    if (clientParam) next.clientId = clientParam;
    if (jobParam) {
        const job = jobs.find((entry) => entry.id === jobParam);
        if (job && (next.clientId === 'all' || job.clientId === next.clientId)) {
            next.jobId = job.id;
            if (next.clientId === 'all') next.clientId = job.clientId;
        }
    }
    if (stageParam && APPLICATION_STAGES.includes(stageParam as ApplicationStage)) {
        next.stage = stageParam as ApplicationStage;
    }
    if (ownerParam === 'mine' || OWNERS.includes(ownerParam ?? '')) {
        next.owner = ownerParam;
    }
    return next;
}

const SCREEN_LABELS: Record<PreviewScreen, string> = {
    overview: 'Overview',
    applications: 'Applications',
    candidates: 'Candidates',
    candidate: 'Candidate',
    jobs: 'Jobs',
    job: 'Job',
    jobEditor: 'Job editor',
    clients: 'Clients',
    client: 'Client',
    clientEditor: 'Client editor',
    import: 'Import candidates',
    privacy: 'Candidate data requests',
};

function nextBigInt(value: string): string {
    try {
        return String(BigInt(value) + BigInt(1));
    } catch {
        return '1';
    }
}

function newRecordId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

const createDefaultSnapshot = (): ViewSnapshot => ({
    candidateFilters: DEFAULT_CANDIDATE_FILTERS,
    selectedCandidateIds: [],
    applicationFilters: DEFAULT_APPLICATION_FILTERS,
    jobFilters: DEFAULT_JOB_FILTERS,
    clientQuery: '',
    clientStatus: 'all',
    clientView: 'cards',
    candidateTab: 'overview',
    preview: null,
    scrollY: 0,
});

export function PreviewWorkspace() {
    const [route, setRoute] = useState<PreviewRoute>({
        screen: 'candidates',
        query: new URLSearchParams(),
    });
    const [candidates, setCandidates] = useState<Candidate[]>(() => createDemoCandidates());
    const [clients, setClients] = useState<DemoClient[]>(() => createDemoClients());
    const [jobs, setJobs] = useState<DemoJob[]>(() => createDemoJobs());
    const [privacyCases] = useState(() => createDemoPrivacyCases());
    const [candidateFilters, setCandidateFilters] = useState<CandidateFilters>(
        DEFAULT_CANDIDATE_FILTERS,
    );
    const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
    const [applicationFilters, setApplicationFilters] = useState<ApplicationFilters>(
        DEFAULT_APPLICATION_FILTERS,
    );
    const [jobFilters, setJobFilters] = useState<JobFilters>(DEFAULT_JOB_FILTERS);
    const [clientQuery, setClientQuery] = useState('');
    const [clientStatus, setClientStatus] = useState<ClientStatusFilter>('all');
    const [clientView, setClientView] = useState<'cards' | 'table'>('cards');
    const [candidateTab, setCandidateTab] = useState<CandidateTab>('overview');
    const [preview, setPreview] = useState<RecordPreview>(null);
    const [readNotifications, setReadNotifications] = useState<string[]>([]);
    const [completedTaskIDs, setCompletedTaskIDs] = useState<string[]>([]);
    const [revision, setRevision] = useState(0);
    const [navId, setNavId] = useState(0);
    const [pendingNav, setPendingNav] = useState<
        { kind: 'navigate'; hash: string } | { kind: 'back' } | null
    >(null);

    const triggerRef = useRef<HTMLElement | null>(null);
    const candidateBodyRef = useRef<HTMLDivElement | null>(null);
    const jobBodyRef = useRef<HTMLDivElement | null>(null);
    const clientBodyRef = useRef<HTMLDivElement | null>(null);
    const guardRef = useRef<EditorGuard | null>(null);
    const registerGuard = useCallback((guard: EditorGuard | null) => {
        guardRef.current = guard;
    }, []);
    const viewRef = useRef({
        route,
        candidates,
        clients,
        jobs,
        candidateFilters,
        selectedCandidateIds,
        applicationFilters,
        jobFilters,
        clientQuery,
        clientStatus,
        clientView,
        candidateTab,
        preview,
    });
    useEffect(() => {
        viewRef.current = {
            route,
            candidates,
            clients,
            jobs,
            candidateFilters,
            selectedCandidateIds,
            applicationFilters,
            jobFilters,
            clientQuery,
            clientStatus,
            clientView,
            candidateTab,
            preview,
        };
    });

    const labelForHash = (hash: string): string => {
        const parsed = parseHash(hash);
        if (parsed.screen === 'candidate') {
            return (
                viewRef.current.candidates.find((c) => c.id === parsed.candidateId)?.name
                ?? 'Candidate'
            );
        }
        if (parsed.screen === 'client') {
            return (
                viewRef.current.clients.find((c) => c.id === parsed.clientId)?.name ?? 'Client'
            );
        }
        if (parsed.screen === 'job') {
            return viewRef.current.jobs.find((j) => j.id === parsed.jobId)?.title ?? 'Job';
        }
        if (parsed.screen === 'jobEditor') {
            if (!parsed.jobId) return 'New job';
            const title = viewRef.current.jobs.find((j) => j.id === parsed.jobId)?.title;
            return title ? `Edit ${title}` : 'Job editor';
        }
        return SCREEN_LABELS[parsed.screen];
    };

    const captureSnapshot = (): ViewSnapshot => {
        const v = viewRef.current;
        const previewSnapshot: RecordPreview = v.preview
            ? v.preview.kind === 'candidate'
                ? {
                      kind: 'candidate',
                      id: v.preview.id,
                      tab: v.preview.tab,
                      scrollTop:
                          candidateBodyRef.current?.scrollTop ?? v.preview.scrollTop,
                  }
                : v.preview.kind === 'job'
                  ? {
                        kind: 'job',
                        id: v.preview.id,
                        scrollTop: jobBodyRef.current?.scrollTop ?? v.preview.scrollTop,
                    }
                  : {
                        kind: 'client',
                        id: v.preview.id,
                        scrollTop:
                            clientBodyRef.current?.scrollTop ?? v.preview.scrollTop,
                    }
            : null;
        return {
            candidateFilters: v.candidateFilters,
            selectedCandidateIds: v.selectedCandidateIds,
            applicationFilters: v.applicationFilters,
            jobFilters: v.jobFilters,
            clientQuery: v.clientQuery,
            clientStatus: v.clientStatus,
            clientView: v.clientView,
            candidateTab: v.candidateTab,
            preview: previewSnapshot,
            scrollY: window.scrollY,
        };
    };

    const applyRoute = (hash: string, applyFilters: boolean) => {
        const parsed = parseHash(hash);
        setRoute(parsed);
        setNavId((value) => value + 1);
        if (!applyFilters) return;
        if (parsed.query.get('all')) {
            if (parsed.screen === 'candidates') {
                setCandidateFilters(DEFAULT_CANDIDATE_FILTERS);
            }
            if (parsed.screen === 'applications') {
                setApplicationFilters(DEFAULT_APPLICATION_FILTERS);
            }
            if (parsed.screen === 'jobs') setJobFilters(DEFAULT_JOB_FILTERS);
            if (parsed.screen === 'clients') {
                setClientQuery('');
                setClientStatus('all');
            }
        } else {
            if (parsed.screen === 'applications') {
                setApplicationFilters(
                    (current) =>
                        applicationFiltersFromQuery(
                            parsed.query,
                            current,
                            viewRef.current.jobs,
                        ) ?? current,
                );
            }
            if (parsed.screen === 'jobs') {
                const clientParam = parsed.query.get('client');
                const statusParam = parsed.query.get('status');
                if (clientParam || statusParam) {
                    setJobFilters({
                        ...DEFAULT_JOB_FILTERS,
                        clientId: clientParam ?? 'all',
                        status:
                            statusParam === 'draft'
                            || statusParam === 'open'
                            || statusParam === 'closed'
                                ? statusParam
                                : 'all',
                    });
                }
            }
        }
        if (parsed.screen === 'candidate') {
            const tabParam = parsed.query.get('tab');
            setCandidateTab(
                CANDIDATE_TABS.includes(tabParam as CandidateTab)
                    ? (tabParam as CandidateTab)
                    : 'overview',
            );
        }
    };

    const focusMainHeading = () => {
        const heading = document.querySelector<HTMLElement>('main h1');
        if (heading) {
            heading.setAttribute('tabindex', '-1');
            heading.focus();
        }
    };

    const {
        ready,
        restoring,
        backLabel,
        navigate,
        back: goBack,
        reset: resetHistory,
        onInternalLinkClick,
    } = usePreviewHistory({
        capture: captureSnapshot,
        enter: (hash) => {
            setPreview(null);
            applyRoute(hash, true);
        },
        restore: (hash, snapshot) => {
            setCandidateFilters(snapshot.candidateFilters);
            setSelectedCandidateIds(snapshot.selectedCandidateIds);
            setApplicationFilters(snapshot.applicationFilters);
            setJobFilters(snapshot.jobFilters);
            setClientQuery(snapshot.clientQuery);
            setClientStatus(snapshot.clientStatus);
            setClientView(snapshot.clientView);
            setCandidateTab(snapshot.candidateTab);
            setPreview(snapshot.preview);
            applyRoute(hash, false);
        },
        labelForHash,
        fallback: () => canonicalParent(viewRef.current.route.screen),
        intercept: (hash) => {
            if (!guardRef.current?.isDirty()) return false;
            setPendingNav({ kind: 'navigate', hash });
            return true;
        },
        restoreScroll: (snapshot) => {
            window.scrollTo(0, snapshot.scrollY);
            if (
                snapshot.preview?.kind === 'candidate'
                && candidateBodyRef.current
            ) {
                candidateBodyRef.current.scrollTop = snapshot.preview.scrollTop;
            }
            if (snapshot.preview?.kind === 'job' && jobBodyRef.current) {
                jobBodyRef.current.scrollTop = snapshot.preview.scrollTop;
            }
            if (snapshot.preview?.kind === 'client' && clientBodyRef.current) {
                clientBodyRef.current.scrollTop = snapshot.preview.scrollTop;
            }
        },
    });

    const initialNavRef = useRef(true);
    useEffect(() => {
        if (!ready) return;
        if (initialNavRef.current) {
            initialNavRef.current = false;
            return;
        }
        if (restoring) return;
        window.scrollTo(0, 0);
        requestAnimationFrame(() => {
            if (document.activeElement === document.body) focusMainHeading();
        });
    }, [navId, ready, restoring]);

    // In-app navigation and the contextual Back control are guarded by the
    // active editor's dirty state. Browser Back/Forward (popstate) bypasses
    // this guard; unsaved editor state is then discarded like a reload.
    const requestNavigate = (hash: string) => {
        if (guardRef.current?.isDirty()) {
            setPendingNav({ kind: 'navigate', hash });
            return;
        }
        navigate(hash);
    };

    const requestBack = () => {
        if (guardRef.current?.isDirty()) {
            setPendingNav({ kind: 'back' });
            return;
        }
        goBack();
    };

    const resolvePendingNav = () => {
        const pending = pendingNav;
        setPendingNav(null);
        if (!pending) return;
        if (pending.kind === 'back') {
            goBack();
        } else {
            navigate(pending.hash);
        }
    };

    const createClient = (input: ClientInput, clientId?: string): string => {
        if (clientId) {
            setClients((current) =>
                current.map((client) =>
                    client.id === clientId && client.status === 'draft'
                        ? {
                              ...client,
                              status: 'active',
                              name: input.name,
                              contactName: input.contactName,
                              contactEmail: input.contactEmail,
                              telegramUsername: input.telegramUsername,
                              website: input.website,
                              socialLinks: input.socialLinks,
                              isStealth: input.isStealth,
                              anonymousDescription: input.anonymousDescription,
                          }
                        : client,
                ),
            );
            return clientId;
        }
        const id = newRecordId('client');
        setClients((current) => [
            ...current,
            {
                id,
                name: input.name,
                industry: 'General',
                location: 'Not specified',
                owner: DEMO_USER,
                status: 'active',
                contactName: input.contactName,
                contactEmail: input.contactEmail,
                telegramUsername: input.telegramUsername,
                website: input.website,
                socialLinks: input.socialLinks,
                isStealth: input.isStealth,
                anonymousDescription: input.anonymousDescription,
            },
        ]);
        return id;
    };

    const saveClientDraft = (input: ClientDraftInput, clientId?: string): string => {
        const draftFields = {
            name: input.name,
            industry: 'General',
            location: 'Not specified',
            owner: DEMO_USER,
            status: 'draft' as const,
            contactName: input.contactName,
            contactEmail: input.contactEmail,
            telegramUsername: input.telegramUsername,
            website: input.website,
            socialLinks: input.socialLinks,
            isStealth: input.isStealth ?? false,
            anonymousDescription: input.anonymousDescription,
        };
        if (clientId) {
            setClients((current) =>
                current.map((client) =>
                    client.id === clientId && client.status === 'draft'
                        ? { ...client, ...draftFields }
                        : client,
                ),
            );
            return clientId;
        }
        const id = newRecordId('client');
        setClients((current) => [...current, { id, ...draftFields }]);
        return id;
    };

    const saveJobDraft = (
        jobId: string | null,
        clientId: string,
        fields: JobFields,
    ): string => {
        if (!jobId) {
            const id = newRecordId('job');
            setJobs((current) => [
                ...current,
                {
                    id,
                    clientId,
                    ...fields,
                    publicationState: 'draft',
                    applicationState: 'open',
                    jobVersion: '0',
                    revisionId: newRecordId('rev'),
                    revisionVersion: '1',
                    draft: null,
                    summary: '',
                    responsibilities: [],
                    requirements: [],
                },
            ]);
            return id;
        }
        setJobs((current) =>
            current.map((job) => {
                if (job.id !== jobId) return job;
                if (job.publicationState === 'draft') {
                    return {
                        ...job,
                        clientId,
                        ...fields,
                        revisionVersion: nextBigInt(job.revisionVersion),
                    };
                }
                const draft: JobRevision = {
                    clientId,
                    ...fields,
                    revisionId: job.draft?.revisionId ?? newRecordId('rev'),
                    revisionVersion: nextBigInt(job.draft?.revisionVersion ?? '0'),
                };
                return { ...job, draft };
            }),
        );
        return jobId;
    };

    const publishJob = (
        jobId: string | null,
        clientId: string,
        fields: JobFields,
    ): string => {
        if (!jobId) {
            const id = newRecordId('job');
            setJobs((current) => [
                ...current,
                {
                    id,
                    clientId,
                    ...fields,
                    publicationState: 'published',
                    applicationState: 'open',
                    jobVersion: '1',
                    revisionId: newRecordId('rev'),
                    revisionVersion: '1',
                    draft: null,
                    summary: '',
                    responsibilities: [],
                    requirements: [],
                },
            ]);
            return id;
        }
        setJobs((current) =>
            current.map((job) => {
                if (job.id !== jobId) return job;
                return {
                    ...job,
                    clientId,
                    ...fields,
                    publicationState: 'published',
                    applicationState: 'open',
                    jobVersion: nextBigInt(job.jobVersion),
                    revisionId: job.draft?.revisionId ?? job.revisionId,
                    revisionVersion:
                        job.draft?.revisionVersion ?? nextBigInt(job.revisionVersion),
                    draft: null,
                };
            }),
        );
        return jobId;
    };

    const duplicateJob = (jobId: string): string | null => {
        const source = viewRef.current.jobs.find((job) => job.id === jobId);
        if (!source) return null;
        const basis = source.draft ?? source;
        const id = newRecordId('job');
        const fields: JobFields = {
            title: basis.title,
            employmentType: basis.employmentType,
            workplaceMode: basis.workplaceMode,
            locations: [...basis.locations],
            remoteRegions: [...basis.remoteRegions],
            compensationMin: basis.compensationMin,
            compensationMax: basis.compensationMax,
            currency: basis.currency,
            payPeriod: basis.payPeriod,
            bonuses: basis.bonuses.map((bonus) => ({ ...bonus })),
            descriptionDocument:
                structuredClone(basis.descriptionDocument) ?? EMPTY_JOB_DOCUMENT,
        };
        setJobs((current) => [
            ...current,
            {
                id,
                clientId: basis.clientId,
                ...fields,
                publicationState: 'draft',
                applicationState: 'open',
                jobVersion: '0',
                revisionId: newRecordId('rev'),
                revisionVersion: '1',
                draft: null,
                summary: source.summary,
                responsibilities: [...source.responsibilities],
                requirements: [...source.requirements],
            },
        ]);
        return id;
    };

    const duplicateJobAndOpen = (jobId: string) => {
        const id = duplicateJob(jobId);
        if (id) requestNavigate(`#/jobs/${id}/edit`);
    };

    const openCandidatePreview = (id: string, trigger: HTMLElement) => {
        triggerRef.current = trigger;
        setPreview({ kind: 'candidate', id, tab: 'overview', scrollTop: 0 });
    };

    const openJobPreview = (id: string, trigger: HTMLElement) => {
        triggerRef.current = trigger;
        setPreview({ kind: 'job', id, scrollTop: 0 });
    };

    const openClientPreview = (id: string, trigger: HTMLElement) => {
        triggerRef.current = trigger;
        setPreview({ kind: 'client', id, scrollTop: 0 });
    };

    const applicationRows = useMemo(() => flattenApplicationRows(candidates), [candidates]);

    const addCandidates = (items: Candidate[]) =>
        setCandidates((current) => [...items, ...current]);

    const addCandidateApplication = (
        candidateId: string,
        jobId: string,
    ): CandidateApplication | null => {
        const candidate = viewRef.current.candidates.find(
            (entry) => entry.id === candidateId,
        );
        const job = viewRef.current.jobs.find((entry) => entry.id === jobId);
        if (
            !candidate
            || candidate.restricted
            || !job
            || !isJobOpen(job)
            || candidate.applications.some((application) => application.jobId === job.id)
        ) {
            return null;
        }
        const client = viewRef.current.clients.find((entry) => entry.id === job.clientId);
        const application: CandidateApplication = {
            id: newRecordId('app'),
            jobId: job.id,
            clientId: job.clientId,
            job: job.title,
            client: client?.name ?? job.clientId,
            stage: 'New',
            receivedAt: DEMO_TODAY,
            owner: DEMO_USER,
            source: 'Manual',
        };
        setCandidates((current) =>
            current.map((entry) =>
                entry.id === candidateId
                && !entry.restricted
                && !entry.applications.some((existing) => existing.jobId === job.id)
                    ? { ...entry, applications: [application, ...entry.applications] }
                    : entry,
            ),
        );
        return application;
    };

    const updateCandidate = (
        id: string,
        fields: Pick<Candidate, 'name' | 'headline' | 'location' | 'email' | 'owner'>,
    ) =>
        setCandidates((current) =>
            current.map((candidate) =>
                candidate.id === id && !candidate.restricted
                    ? { ...candidate, ...fields }
                    : candidate,
            ),
        );

    const addNote = (id: string, body: string) =>
        setCandidates((current) =>
            current.map((candidate) =>
                candidate.id === id && !candidate.restricted
                    ? {
                          ...candidate,
                          notes: [
                              {
                                  id: crypto.randomUUID(),
                                  body,
                                  author: DEMO_USER,
                                  createdLabel: 'Just now',
                              },
                              ...candidate.notes,
                          ],
                      }
                    : candidate,
            ),
        );

    const setCandidateTags = (id: string, tags: string[]) =>
        setCandidates((current) =>
            current.map((candidate) =>
                candidate.id === id && !candidate.restricted
                    ? { ...candidate, tags }
                    : candidate,
            ),
        );

    const addTagToCandidates = (ids: string[], tag: string) =>
        setCandidates((current) =>
            current.map((candidate) =>
                ids.includes(candidate.id)
                && !candidate.restricted
                && !candidate.tags.includes(tag)
                    ? { ...candidate, tags: [...candidate.tags, tag] }
                    : candidate,
            ),
        );

    const resetPreview = () => {
        setCandidates(createDemoCandidates());
        setClients(createDemoClients());
        setJobs(createDemoJobs());
        setCandidateFilters(DEFAULT_CANDIDATE_FILTERS);
        setSelectedCandidateIds([]);
        setApplicationFilters(DEFAULT_APPLICATION_FILTERS);
        setJobFilters(DEFAULT_JOB_FILTERS);
        setClientQuery('');
        setClientStatus('all');
        setClientView('cards');
        setCandidateTab('overview');
        setReadNotifications([]);
        setCompletedTaskIDs([]);
        setPreview(null);
        setPendingNav(null);
        setRevision((value) => value + 1);
        resetHistory('#/candidates', createDefaultSnapshot());
    };

    const toggleTaskComplete = (id: string, completed: boolean) =>
        setCompletedTaskIDs((current) =>
            completed
                ? current.includes(id)
                    ? current
                    : [...current, id]
                : current.filter((existing) => existing !== id),
        );

    const markNotificationRead = (id: string) =>
        setReadNotifications((current) => (current.includes(id) ? current : [...current, id]));

    const notifications: NotificationItem[] = [
        {
            id: 'new-applications',
            title: 'New applications to review',
            description: 'Unreviewed applications across your clients',
            href: '#/applications?stage=New',
            count: readNotifications.includes('new-applications')
                ? 0
                : applicationRows.filter((row) => row.stage === 'New').length,
        },
        {
            id: 'interviews',
            title: 'Interviews in progress',
            description: 'Applications currently at interview stage',
            href: '#/applications?stage=Interview',
            count: readNotifications.includes('interviews')
                ? 0
                : applicationRows.filter((row) => row.stage === 'Interview').length,
        },
        {
            id: 'data-requests',
            title: 'Candidate data requests',
            description: 'Access or correction requests from candidates',
            href: '#/privacy',
            count: readNotifications.includes('data-requests') ? 0 : privacyCases.length,
        },
    ];

    if (!ready) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
                Loading preview…
            </div>
        );
    }

    const selectedCandidate =
        route.screen === 'candidate'
            ? candidates.find((candidate) => candidate.id === route.candidateId)
            : undefined;
    const selectedClient =
        route.screen === 'client'
            ? clients.find((client) => client.id === route.clientId)
            : undefined;
    const selectedJob =
        route.screen === 'job' || route.screen === 'jobEditor'
            ? jobs.find((job) => job.id === route.jobId)
            : undefined;
    const unknownClientFilter =
        applicationFilters.clientId !== 'all'
        && !clients.some((client) => client.id === applicationFilters.clientId);

    const back = backLabel
        ? { label: backLabel, onBack: requestBack }
        : route.screen === 'overview'
          ? null
          : {
                label: `Back to ${canonicalParent(route.screen).label}`,
                onBack: requestBack,
            };

    return (
        <div onClick={onInternalLinkClick}>
            <CandidatePreviewProvider
                candidates={candidates}
                privacyCases={privacyCases}
                onAddNote={addNote}
                preview={
                    preview?.kind === 'candidate'
                        ? { id: preview.id, tab: preview.tab, scrollTop: preview.scrollTop }
                        : null
                }
                onOpenRequest={openCandidatePreview}
                onClose={() => setPreview(null)}
                onNavigate={requestNavigate}
                onTabChange={(tab) =>
                    setPreview((current) =>
                        current?.kind === 'candidate' ? { ...current, tab } : current,
                    )
                }
                bodyRef={(element) => {
                    candidateBodyRef.current = element;
                }}
                triggerRef={triggerRef}
            >
                <JobPreviewProvider
                    preview={
                        preview?.kind === 'job'
                            ? { id: preview.id, scrollTop: preview.scrollTop }
                            : null
                    }
                    onOpenRequest={openJobPreview}
                    onClose={() => setPreview(null)}
                    onNavigate={requestNavigate}
                    bodyRef={(element) => {
                        jobBodyRef.current = element;
                    }}
                    triggerRef={triggerRef}
                    jobs={jobs}
                    clients={clients}
                >
                    <ClientPreviewProvider
                        preview={
                            preview?.kind === 'client'
                                ? { id: preview.id, scrollTop: preview.scrollTop }
                                : null
                        }
                        onOpenRequest={openClientPreview}
                        onClose={() => setPreview(null)}
                        onNavigate={requestNavigate}
                        bodyRef={(element) => {
                            clientBodyRef.current = element;
                        }}
                        triggerRef={triggerRef}
                        clients={clients}
                        jobs={jobs}
                        rows={applicationRows}
                    >
                        <WorkspaceShell
                            screen={route.screen}
                        candidateName={selectedCandidate?.name}
                        clientName={selectedClient?.name}
                        jobName={selectedJob?.title}
                        notifications={notifications}
                        onNotificationRead={markNotificationRead}
                        onReset={resetPreview}
                        back={back}
                    >
                        {route.screen === 'overview' ? (
                            <WorkspaceOverview
                                candidates={candidates}
                                rows={applicationRows}
                                clients={clients}
                                jobs={jobs}
                                completedTaskIDs={completedTaskIDs}
                                onToggleTaskComplete={toggleTaskComplete}
                            />
                        ) : null}
                        {route.screen === 'candidates' ? (
                            <CandidateList
                                key={`candidates-${revision}`}
                                candidates={candidates}
                                filters={candidateFilters}
                                onFiltersChange={setCandidateFilters}
                                selectedIds={selectedCandidateIds}
                                onSelectedIdsChange={setSelectedCandidateIds}
                                onAddCandidate={(candidate) => addCandidates([candidate])}
                                onAddTagToCandidates={addTagToCandidates}
                            />
                        ) : null}
                        {route.screen === 'candidate' ? (
                            <CandidateDetail
                                key={`${route.candidateId}-${route.query.get('tab') ?? ''}-${revision}`}
                                candidate={selectedCandidate}
                                initialTab={route.query.get('tab') ?? undefined}
                                tab={candidateTab}
                                onTabChange={setCandidateTab}
                                suppressInitialFocus={restoring}
                                privacyCase={privacyCases.find(
                                    (privacyCase) => privacyCase.subjectId === route.candidateId,
                                )}
                                jobs={jobs}
                                clients={clients}
                                onAddApplication={addCandidateApplication}
                                onUpdateCandidate={updateCandidate}
                                onAddNote={addNote}
                                onSetTags={setCandidateTags}
                            />
                        ) : null}
                        {route.screen === 'applications' ? (
                            <div className="flex flex-col gap-4">
                                {unknownClientFilter ? (
                                    <p role="alert" className="text-sm text-destructive">
                                        Unknown client filter “{applicationFilters.clientId}”.
                                        Clear filters to see all applications.
                                    </p>
                                ) : null}
                                <ApplicationList
                                    rows={applicationRows}
                                    clients={clients}
                                    jobs={jobs}
                                    filters={applicationFilters}
                                    onFiltersChange={setApplicationFilters}
                                />
                            </div>
                        ) : null}
                        {route.screen === 'jobs' ? (
                            <JobsOverview
                                key={`jobs-${revision}`}
                                clients={clients}
                                jobs={jobs}
                                applicationRows={applicationRows}
                                filters={jobFilters}
                                onFiltersChange={setJobFilters}
                            />
                        ) : null}
                        {route.screen === 'job' ? (
                            <JobDetail
                                key={`job-${route.jobId}-${revision}`}
                                jobId={route.jobId ?? ''}
                                jobs={jobs}
                                clients={clients}
                                applicationRows={applicationRows}
                                onDuplicate={duplicateJobAndOpen}
                            />
                        ) : null}
                        {route.screen === 'jobEditor' ? (
                            <JobEditor
                                key={`job-editor-${route.jobId ?? 'new'}-${revision}`}
                                jobId={route.jobId ?? null}
                                presetClientId={route.query.get('client')}
                                clients={clients.filter((client) => client.status === 'active')}
                                jobs={jobs}
                                onSaveDraft={saveJobDraft}
                                onPublish={publishJob}
                                onDuplicate={duplicateJob}
                                onNavigate={requestNavigate}
                                registerGuard={registerGuard}
                            />
                        ) : null}
                        {route.screen === 'clients' ? (
                            <ClientsOverview
                                key={`clients-${revision}`}
                                clients={clients}
                                jobs={jobs}
                                rows={applicationRows}
                                query={clientQuery}
                                onQueryChange={setClientQuery}
                                status={clientStatus}
                                onStatusChange={setClientStatus}
                                view={clientView}
                                onViewChange={setClientView}
                            />
                        ) : null}
                        {route.screen === 'client' ? (
                            <ClientDetail
                                key={`client-${route.clientId}-${revision}`}
                                clientId={route.clientId ?? ''}
                                clients={clients}
                                jobs={jobs}
                                rows={applicationRows}
                            />
                        ) : null}
                        {route.screen === 'clientEditor' ? (
                            route.clientId
                            && !clients.some((client) => client.id === route.clientId) ? (
                                <p role="alert" className="text-sm text-destructive">
                                    Client not found.
                                </p>
                            ) : (
                                <ClientEditor
                                    key={`client-${route.clientId ?? 'new'}-${revision}`}
                                    client={clients.find((client) => client.id === route.clientId)}
                                    onCreateClient={createClient}
                                    onSaveClientDraft={saveClientDraft}
                                    onNavigate={requestNavigate}
                                    registerGuard={registerGuard}
                                />
                            )
                        ) : null}
                        {route.screen === 'import' ? (
                            <ImportWizard
                                key={`import-${revision}-${navId}`}
                                existingCandidates={candidates}
                                onImport={addCandidates}
                            />
                        ) : null}
                        {route.screen === 'privacy' ? (
                            <PrivacyCases
                                key={`privacy-${revision}`}
                                cases={privacyCases}
                                candidates={candidates}
                            />
                        ) : null}
                        </WorkspaceShell>
                    </ClientPreviewProvider>
                </JobPreviewProvider>
            </CandidatePreviewProvider>

            <Dialog
                open={pendingNav !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingNav(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unsaved changes</DialogTitle>
                        <DialogDescription>
                            You have unsaved changes in this editor. Save a draft before leaving,
                            or discard them.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button variant="outline" onClick={() => setPendingNav(null)}>
                            Keep editing
                        </Button>
                        <Button variant="secondary" onClick={resolvePendingNav}>
                            Discard and continue
                        </Button>
                        <Button
                            onClick={() => {
                                const saved = guardRef.current?.saveDraft() ?? false;
                                if (saved) {
                                    resolvePendingNav();
                                } else {
                                    setPendingNav(null);
                                }
                            }}
                        >
                            Save and continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

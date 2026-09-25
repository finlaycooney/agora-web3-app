'use client';

import type { ApplicationFilters } from './application-model';
import type { CandidateFilters } from './candidate-list';
import type { PreviewScreen } from './types';

export type CandidateTab = 'overview' | 'applications' | 'documents' | 'notes';

export const CANDIDATE_TABS: CandidateTab[] = [
    'overview',
    'applications',
    'documents',
    'notes',
];

export type RecordPreview =
    | { kind: 'candidate'; id: string; tab: CandidateTab; scrollTop: number }
    | { kind: 'job'; id: string; scrollTop: number }
    | { kind: 'client'; id: string; scrollTop: number }
    | null;

export type JobSortKey = 'title' | 'client' | 'location' | 'status' | 'applications';
export type SortDirection = 'asc' | 'desc';

export interface JobFilters {
    query: string;
    clientId: string;
    status: 'all' | 'draft' | 'open' | 'closed';
    sortBy: JobSortKey;
    sortDirection: SortDirection;
}

export type ClientStatusFilter = 'all' | 'draft' | 'active';

export interface ViewSnapshot {
    candidateFilters: CandidateFilters;
    selectedCandidateIds: string[];
    applicationFilters: ApplicationFilters;
    jobFilters: JobFilters;
    clientQuery: string;
    clientStatus: ClientStatusFilter;
    clientView: 'cards' | 'table';
    candidateTab: CandidateTab;
    preview: RecordPreview;
    scrollY: number;
}

export interface HistoryEntry {
    id: string;
    hash: string;
    label: string;
    previousId: string | null;
    snapshot: ViewSnapshot;
}

export interface PreviewRoute {
    screen: PreviewScreen;
    candidateId?: string;
    clientId?: string;
    jobId?: string;
    query: URLSearchParams;
}

export function parseHash(hash: string): PreviewRoute {
    const raw = hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = raw.split('?');
    const query = new URLSearchParams(queryPart ?? '');
    const segments = pathPart.split('/').filter(Boolean);
    const head = segments[0];
    if (head === 'candidates' && segments[1]) {
        return { screen: 'candidate', candidateId: segments[1], query };
    }
    if (head === 'clients' && segments[1] === 'new') {
        return { screen: 'clientEditor', query };
    }
    if (head === 'clients' && segments[1] && segments[2] === 'edit') {
        return { screen: 'clientEditor', clientId: segments[1], query };
    }
    if (head === 'clients' && segments[1]) {
        return { screen: 'client', clientId: segments[1], query };
    }
    if (head === 'jobs' && segments[1] === 'new') {
        return { screen: 'jobEditor', query };
    }
    if (head === 'jobs' && segments[1] && segments[2] === 'edit') {
        return { screen: 'jobEditor', jobId: segments[1], query };
    }
    if (head === 'jobs' && segments[1]) {
        return { screen: 'job', jobId: segments[1], query };
    }
    if (head === 'applications') return { screen: 'applications', query };
    if (head === 'import') return { screen: 'import', query };
    if (head === 'privacy') return { screen: 'privacy', query };
    if (head === 'overview') return { screen: 'overview', query };
    if (head === 'clients') return { screen: 'clients', query };
    if (head === 'jobs') return { screen: 'jobs', query };
    return { screen: 'candidates', query };
}

export function canonicalParent(screen: PreviewScreen): { hash: string; label: string } {
    if (screen === 'candidate') return { hash: '#/candidates', label: 'Candidates' };
    if (screen === 'job' || screen === 'jobEditor') return { hash: '#/jobs', label: 'Jobs' };
    if (screen === 'client' || screen === 'clientEditor') {
        return { hash: '#/clients', label: 'Clients' };
    }
    return { hash: '#/overview', label: 'Overview' };
}

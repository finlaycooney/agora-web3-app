import { DEMO_TODAY, DEMO_USER } from './demo-data';
import type { ApplicationStage, BadgeTone, Candidate, CandidateSource } from './types';

export interface ApplicationFilters {
    query: string;
    clientId: string;
    jobId: string;
    stage: 'all' | ApplicationStage;
    owner: string;
    dateRange: 'all' | '7d' | '30d' | 'custom';
    from: string;
    to: string;
    groupBy: 'none' | 'client';
    view: 'table' | 'cards';
}

export const DEFAULT_APPLICATION_FILTERS: ApplicationFilters = {
    query: '',
    clientId: 'all',
    jobId: 'all',
    stage: 'all',
    owner: 'all',
    dateRange: 'all',
    from: '',
    to: '',
    groupBy: 'none',
    view: 'table',
};

export const APPLICATION_STAGES: ApplicationStage[] = ['New', 'Reviewing', 'Interview'];

export const STAGE_TONES: Record<ApplicationStage, BadgeTone> = {
    New: 'accent',
    Reviewing: 'warning',
    Interview: 'success',
};

export interface ApplicationRow {
    id: string;
    jobId: string;
    clientId: string;
    job: string;
    client: string;
    stage: ApplicationStage;
    receivedAt: string;
    candidateId: string;
    candidateName: string;
    candidateLocation: string;
    owner: string;
    source: CandidateSource;
}

export function flattenApplicationRows(candidates: Candidate[]): ApplicationRow[] {
    return candidates
        .filter((candidate) => !candidate.restricted)
        .flatMap((candidate) =>
            candidate.applications.map((application) => ({
                ...application,
                candidateId: candidate.id,
                candidateName: candidate.name,
                candidateLocation: candidate.location,
                owner: application.owner ?? candidate.owner,
                source: application.source ?? candidate.source,
            })),
        );
}

function isoDaysBefore(iso: string, days: number): string {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
}

export function dateRangeInvalid(filters: ApplicationFilters): boolean {
    return (
        filters.dateRange === 'custom'
        && filters.from !== ''
        && filters.to !== ''
        && filters.from > filters.to
    );
}

function inDateRange(receivedAt: string, filters: ApplicationFilters): boolean {
    if (filters.dateRange === '7d') {
        return receivedAt >= isoDaysBefore(DEMO_TODAY, 6) && receivedAt <= DEMO_TODAY;
    }
    if (filters.dateRange === '30d') {
        return receivedAt >= isoDaysBefore(DEMO_TODAY, 29) && receivedAt <= DEMO_TODAY;
    }
    if (filters.dateRange === 'custom') {
        if (filters.from !== '' && receivedAt < filters.from) return false;
        if (filters.to !== '' && receivedAt > filters.to) return false;
    }
    return true;
}

function sortRows(rows: ApplicationRow[]): ApplicationRow[] {
    return rows
        .slice()
        .sort(
            (a, b) =>
                b.receivedAt.localeCompare(a.receivedAt) || a.id.localeCompare(b.id),
        );
}

export function baseApplicationRows(
    rows: ApplicationRow[],
    filters: ApplicationFilters,
): ApplicationRow[] {
    const query = filters.query.trim().toLowerCase();
    return sortRows(
        rows.filter((row) => {
            if (filters.clientId !== 'all' && row.clientId !== filters.clientId) return false;
            if (filters.jobId !== 'all' && row.jobId !== filters.jobId) return false;
            if (filters.owner === 'mine' && row.owner !== DEMO_USER) return false;
            if (
                filters.owner !== 'all'
                && filters.owner !== 'mine'
                && row.owner !== filters.owner
            ) {
                return false;
            }
            if (!inDateRange(row.receivedAt, filters)) return false;
            if (query) {
                const haystack = `${row.candidateName} ${row.job} ${row.client}`.toLowerCase();
                if (!haystack.includes(query)) return false;
            }
            return true;
        }),
    );
}

export function visibleApplicationRows(
    baseRows: ApplicationRow[],
    filters: ApplicationFilters,
): ApplicationRow[] {
    if (filters.stage === 'all') return baseRows;
    return baseRows.filter((row) => row.stage === filters.stage);
}

export function stageCounts(
    baseRows: ApplicationRow[],
): Record<'all' | ApplicationStage, number> {
    const counts: Record<'all' | ApplicationStage, number> = {
        all: baseRows.length,
        New: 0,
        Reviewing: 0,
        Interview: 0,
    };
    for (const row of baseRows) {
        counts[row.stage] += 1;
    }
    return counts;
}

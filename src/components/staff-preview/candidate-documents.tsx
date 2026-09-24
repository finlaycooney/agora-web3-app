'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

import { Label } from '@/components/staff-ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/staff-ui/select';

import { CandidateSummary } from './candidate-summary';
import { EmptyState, StatusBadge } from './shared';
import type { BadgeTone, Candidate, CandidateDocument } from './types';

const DOCUMENT_TONES: Record<CandidateDocument['state'], BadgeTone> = {
    Available: 'success',
    Scanning: 'warning',
    Restricted: 'restriction',
    Unavailable: 'secondary',
};

function defaultDocument(candidate: Candidate): CandidateDocument | undefined {
    const availableCV = candidate.documents.find(
        (d) => d.state === 'Available' && d.name.startsWith('CV'),
    );
    const cvs = candidate.documents.filter((d) => d.name.startsWith('CV'));
    return availableCV ?? cvs[0] ?? candidate.documents[0];
}

function SampleCv({ candidate }: { candidate: Candidate }) {
    return (
        <div className="mx-auto flex w-full max-w-[780px] flex-col gap-5 border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Sample CV · synthetic design preview
            </p>
            <div className="flex flex-col gap-1 border-b border-border pb-4">
                <p className="text-xl font-semibold text-foreground">{candidate.name}</p>
                <p className="text-sm text-accent-foreground">{candidate.headline}</p>
                <p className="text-xs text-muted-foreground">{candidate.location}</p>
            </div>
            <CandidateSummary candidate={candidate} compact />
        </div>
    );
}

export function CandidateDocuments({ candidate }: { candidate: Candidate }) {
    const [selectedId, setSelectedId] = useState<string | null>(
        () => defaultDocument(candidate)?.id ?? null,
    );
    const selected =
        candidate.documents.find((d) => d.id === selectedId) ?? defaultDocument(candidate);

    if (candidate.documents.length === 0) {
        return (
            <EmptyState
                icon={FileText}
                title="No documents"
                description="Documents such as CVs would appear here once added."
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">{selected?.name}</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                            Version {selected?.version}
                        </span>
                        {selected ? (
                            <StatusBadge tone={DOCUMENT_TONES[selected.state]}>
                                {selected.state}
                            </StatusBadge>
                        ) : null}
                    </div>
                </div>
                {candidate.documents.length > 1 ? (
                    <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center">
                        <Label htmlFor="document-version" className="text-xs text-muted-foreground">
                            Document version
                        </Label>
                        <Select
                            value={selected?.id}
                            onValueChange={(value) => setSelectedId(value)}
                        >
                            <SelectTrigger
                                id="document-version"
                                aria-label="Document version"
                                className="w-full min-w-0 sm:w-64"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {candidate.documents.map((document) => (
                                    <SelectItem key={document.id} value={document.id}>
                                        {document.name} · v{document.version}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
            </div>

            <div
                role="region"
                aria-label="CV preview"
                className="rounded-lg border border-border bg-muted p-4 sm:p-6"
            >
                {selected?.state === 'Available' && selected.name.startsWith('CV') ? (
                    <SampleCv candidate={candidate} />
                ) : (
                    <div className="flex flex-col items-start gap-3 p-4">
                        {selected ? (
                            <StatusBadge tone={DOCUMENT_TONES[selected.state]}>
                                {selected.state}
                            </StatusBadge>
                        ) : null}
                        <p className="text-sm text-muted-foreground">
                            {selected?.state === 'Available'
                                ? 'Document preview not included in this sample.'
                                : selected?.state === 'Scanning'
                                  ? 'This document is still being scanned. A preview is not available yet.'
                                  : selected?.state === 'Restricted'
                                    ? 'This document is restricted and cannot be previewed.'
                                    : 'This document is unavailable in the demo data.'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Document viewing is illustrative in this design preview.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

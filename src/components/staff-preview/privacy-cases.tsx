'use client';

import { useState } from 'react';
import { Check, CircleDashed, Eye, Hourglass, Lock, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/staff-ui/dialog';
import { Separator } from '@/components/staff-ui/separator';
import { cn } from '@/lib/utils';

import { EmptyState, PageHeader, StatusBadge } from './shared';
import type { BadgeTone, Candidate, PrivacyCase } from './types';

function caseStatusTone(status: PrivacyCase['status']): BadgeTone {
    return status === 'In progress' ? 'warning' : 'secondary';
}

function CaseDetail({ privacyCase, subject }: { privacyCase: PrivacyCase; subject?: Candidate }) {
    const [recordsOpen, setRecordsOpen] = useState(false);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{privacyCase.reference}</CardTitle>
                    <StatusBadge tone="accent">{privacyCase.kind}</StatusBadge>
                    <StatusBadge tone={caseStatusTone(privacyCase.status)}>
                        {privacyCase.status}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground">Due: {privacyCase.due}</span>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-muted-foreground">Subject</p>
                    {subject ? (
                        <a
                            href={`#/candidates/${subject.id}`}
                            className="w-fit rounded-sm text-sm font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {subject.name}
                        </a>
                    ) : (
                        <span className="text-sm text-foreground">Unknown subject</span>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Case progress
                    </p>
                    <ol className="flex flex-col gap-0">
                        {privacyCase.steps.map((step, index) => (
                            <li key={step.label} className="flex items-start gap-3">
                                <div className="flex flex-col items-center">
                                    <span
                                        className={cn(
                                            'flex h-6 w-6 items-center justify-center rounded-full border',
                                            step.state === 'done'
                                                ? 'border-success-foreground/30 bg-success text-success-foreground'
                                                : step.state === 'current'
                                                  ? 'border-accent-foreground/40 bg-accent text-accent-foreground'
                                                  : 'border-border bg-card text-muted-foreground',
                                        )}
                                    >
                                        {step.state === 'done' ? (
                                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        ) : step.state === 'current' ? (
                                            <Hourglass className="h-3 w-3" aria-hidden="true" />
                                        ) : (
                                            <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
                                        )}
                                    </span>
                                    {index < privacyCase.steps.length - 1 ? (
                                        <span aria-hidden="true" className="h-4 w-px bg-border" />
                                    ) : null}
                                </div>
                                <span
                                    className={cn(
                                        'pt-0.5 text-sm',
                                        step.state === 'pending'
                                            ? 'text-muted-foreground'
                                            : 'font-medium text-foreground',
                                    )}
                                >
                                    {step.label}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Timeline
                    </p>
                    <ul className="flex flex-col gap-3">
                        {privacyCase.timeline.map((entry) => (
                            <li key={entry.label} className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium text-foreground">
                                    {entry.label}
                                </span>
                                <span className="text-xs text-muted-foreground">{entry.detail}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="flex flex-col gap-3">
                    {privacyCase.pendingBlocks.map((block) => (
                        <div
                            key={block.title}
                            className="flex items-start gap-3 rounded-lg border border-warning-foreground/30 bg-warning/50 p-4"
                        >
                            <Lock
                                className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground"
                                aria-hidden="true"
                            />
                            <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-warning-foreground">
                                    {block.title}
                                </p>
                                <p className="text-sm text-warning-foreground/90">{block.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setRecordsOpen(true)}>
                        <Eye aria-hidden="true" />
                        View reviewed records
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        Record identifiers only — restricted details stay hidden.
                    </p>
                </div>
            </CardContent>

            <Dialog open={recordsOpen} onOpenChange={setRecordsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reviewed records</DialogTitle>
                        <DialogDescription>
                            Minimal identifiers reviewed under {privacyCase.reference}. Restricted
                            record contents are not shown.
                        </DialogDescription>
                    </DialogHeader>
                    {privacyCase.reviewedRecords.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No records have been reviewed for this case yet.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {privacyCase.reviewedRecords.map((recordId) => (
                                <li
                                    key={recordId}
                                    className="rounded-lg border border-border px-3 py-2 font-mono text-xs text-foreground"
                                >
                                    {recordId}
                                </li>
                            ))}
                        </ul>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}

export function PrivacyCases({
    cases,
    candidates,
}: {
    cases: PrivacyCase[];
    candidates: Candidate[];
}) {
    const [selectedId, setSelectedId] = useState(cases[0]?.id ?? '');
    const selected = cases.find((privacyCase) => privacyCase.id === selectedId) ?? cases[0];

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                eyebrow="Workspace"
                title="Candidate data requests"
                description="Requests from candidates to access, correct or restrict their personal information."
            />
            {cases.length === 0 ? (
                <EmptyState
                    icon={ShieldCheck}
                    title="No privacy cases"
                    description="Demo privacy cases would appear here."
                />
            ) : (
                <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                    <div className="flex flex-col gap-3" aria-label="Privacy cases">
                        {cases.map((privacyCase) => {
                            const subject = candidates.find((c) => c.id === privacyCase.subjectId);
                            const isSelected = selected?.id === privacyCase.id;
                            return (
                                <button
                                    key={privacyCase.id}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => setSelectedId(privacyCase.id)}
                                    className={cn(
                                        'flex flex-col gap-2 rounded-lg border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                        isSelected
                                            ? 'border-accent-foreground/40 bg-accent/50'
                                            : 'border-border bg-card hover:bg-hover',
                                    )}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-foreground">
                                            {privacyCase.reference}
                                        </span>
                                        <StatusBadge tone={caseStatusTone(privacyCase.status)}>
                                            {privacyCase.status}
                                        </StatusBadge>
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {privacyCase.kind} · Subject: {subject?.name ?? 'Unknown'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {privacyCase.due}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {selected ? (
                        <CaseDetail
                            privacyCase={selected}
                            subject={candidates.find((c) => c.id === selected.subjectId)}
                        />
                    ) : null}
                </div>
            )}
        </div>
    );
}

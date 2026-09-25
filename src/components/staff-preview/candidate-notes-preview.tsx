'use client';

import { MessageSquareText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/staff-ui/card';

import type { CandidateNote } from './types';

export function CandidateNotesPreview({
    notes,
    onViewAll,
    onAdd,
}: {
    notes: CandidateNote[];
    onViewAll: () => void;
    onAdd: () => void;
}) {
    const latest = notes[0];
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                    />
                    Latest note
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {latest ? (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">
                                {latest.author}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {latest.createdLabel}
                            </span>
                        </div>
                        <p className="line-clamp-3 text-sm text-foreground">{latest.body}</p>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">No notes yet</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                        type="button"
                        onClick={onViewAll}
                        className="w-fit rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        View all notes ({notes.length})
                    </button>
                    <button
                        type="button"
                        onClick={onAdd}
                        className="w-fit rounded-sm text-xs font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Add note
                    </button>
                </div>
            </CardContent>
        </Card>
    );
}

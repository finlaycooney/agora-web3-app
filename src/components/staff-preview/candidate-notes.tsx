'use client';

import { forwardRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/staff-ui/button';
import { Card, CardContent } from '@/components/staff-ui/card';
import { Label } from '@/components/staff-ui/label';
import { Textarea } from '@/components/staff-ui/textarea';

import { EmptyState, RequiredMark } from './shared';
import type { CandidateNote } from './types';

const MAX_NOTE_LENGTH = 1000;

export const NoteComposer = forwardRef<
    HTMLTextAreaElement,
    { onSave: (body: string) => void }
>(function NoteComposer({ onSave }, ref) {
    const [body, setBody] = useState('');

    const save = () => {
        const trimmed = body.trim();
        if (trimmed === '') return;
        onSave(trimmed);
        setBody('');
    };

    return (
        <Card>
            <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="note-body">Add a note <RequiredMark /></Label>
                    <Textarea
                        id="note-body"
                        required
                        aria-required="true"
                        ref={ref}
                        value={body}
                        maxLength={MAX_NOTE_LENGTH}
                        placeholder="Write an internal note for the team…"
                        onChange={(event) => setBody(event.target.value)}
                    />
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        {body.length}/{MAX_NOTE_LENGTH}
                    </span>
                    <Button size="sm" disabled={body.trim() === ''} onClick={save}>
                        Save note
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
});

export function NotesList({ notes }: { notes: CandidateNote[] }) {
    if (notes.length === 0) {
        return (
            <EmptyState
                icon={MessageSquare}
                title="No notes yet"
                description="Notes are shared with the team and stay in this preview only."
            />
        );
    }
    return (
        <ul className="flex flex-col gap-3">
            {notes.map((note) => (
                <li key={note.id}>
                    <Card>
                        <CardContent className="flex flex-col gap-2 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-foreground">{note.author}</span>
                                <span className="text-xs text-muted-foreground">{note.createdLabel}</span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap text-foreground">{note.body}</p>
                        </CardContent>
                    </Card>
                </li>
            ))}
        </ul>
    );
}

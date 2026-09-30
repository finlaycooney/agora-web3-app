'use client';

import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';

import { Button } from '@/components/staff-ui/button';

export interface CandidateDocumentRecord {
    documentId: string;
    filename: string;
    purpose?: string;
    lifecycle: string;
    scanState: string;
    sizeBytes: number;
    receivedAt: string;
}

export function RealCandidateDocuments({
    documents,
    canView,
}: {
    documents: CandidateDocumentRecord[];
    canView: boolean;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [text, setText] = useState<string | null>(null);
    const [error, setError] = useState('');
    const selected = documents.find((document) => document.documentId === selectedId);
    const isPdf = selected?.filename.toLowerCase().endsWith('.pdf');
    const isDocx = selected?.filename.toLowerCase().endsWith('.docx');
    const selectedDocxId = isDocx ? selectedId : null;
    const canOpen = (document: CandidateDocumentRecord) => canView
        && document.lifecycle === 'active'
        && document.scanState !== 'infected';

    useEffect(() => {
        if (!selectedDocxId) return;
        const controller = new AbortController();
        fetch(`/api/staff/documents/${selectedDocxId}?view=text`, {
            signal: controller.signal,
            cache: 'no-store',
        }).then(async (response) => {
            if (!response.ok) throw new Error('This document could not be previewed.');
            const payload = await response.json();
            setText(payload.text || 'No readable text was found in this document.');
        }).catch(() => {
            if (!controller.signal.aborted) setError('This document could not be previewed.');
        });
        return () => controller.abort();
    }, [selectedDocxId]);

    if (documents.length === 0) {
        return <p className="text-sm text-muted-foreground">No documents on file.</p>;
    }

    return <div className="space-y-4">
        <div className="divide-y divide-border rounded-md border border-border">
            {documents.map((document) => <div key={document.documentId}
                className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    {canOpen(document) ? <button type="button"
                        onClick={() => {
                            setText(null);
                            setError('');
                            setSelectedId(document.documentId);
                        }}
                        aria-pressed={selectedId === document.documentId}
                        className="max-w-full truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                        {document.filename}
                    </button> : <span className="block truncate text-sm font-medium">
                        {document.filename}
                    </span>}
                    <p className="text-xs text-muted-foreground">
                        {Math.round(document.sizeBytes / 1024)} KB
                        {document.scanState !== 'clean' ? ` · Scan: ${document.scanState}` : ''}
                    </p>
                </div>
                {canOpen(document) ? <Button size="icon" variant="ghost" asChild>
                    <a href={`/api/staff/documents/${document.documentId}`}
                        aria-label={`Download ${document.filename}`} title={`Download ${document.filename}`}>
                        <Download className="h-4 w-4" />
                    </a>
                </Button> : null}
            </div>)}
        </div>
        {selected ? <section aria-label={`Preview of ${selected.filename}`}
            className="min-w-0 overflow-hidden rounded-md border border-border">
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
                {selected.filename}
            </div>
            {isPdf ? <iframe title={`Preview of ${selected.filename}`}
                src={`/api/staff/documents/${selected.documentId}?view=inline`}
                referrerPolicy="no-referrer"
                className="h-[min(70vh,720px)] w-full bg-white" />
                : isDocx ? <div className="max-h-[min(70vh,720px)] overflow-auto px-4 py-5">
                    {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
                        : text === null ? <p role="status" className="text-sm text-muted-foreground">
                            Loading document…</p>
                            : <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
                                {text}
                            </pre>}
                </div> : <p className="px-4 py-5 text-sm text-muted-foreground">
                    Preview is available for PDF and DOCX files.
                </p>}
        </section> : null}
    </div>;
}

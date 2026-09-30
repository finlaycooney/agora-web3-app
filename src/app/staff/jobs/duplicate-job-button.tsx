'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/staff-ui/button';

export function DuplicateJobButton({
    sourceJobId,
    clientId,
    sourceRevisionId,
    expectedSourceVersion,
}: {
    sourceJobId: string;
    clientId: string;
    sourceRevisionId: string;
    expectedSourceVersion: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busyRef = useRef(false);
    const idsRef = useRef<{
        jobId: string;
        revisionId: string;
        operationId: string;
    } | null>(null);
    return (
        <span className="inline-flex flex-wrap items-center gap-3">
            <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                    if (busyRef.current) return;
                    busyRef.current = true;
                    setBusy(true);
                    setError(null);
                    let navigating = false;
                    try {
                        idsRef.current ??= {
                            jobId: crypto.randomUUID(),
                            revisionId: crypto.randomUUID(),
                            operationId: crypto.randomUUID(),
                        };
                        const response = await fetch(
                            `/api/staff/jobs/${sourceJobId}/duplicate`,
                            {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                    sourceRevisionId,
                                    expectedSourceVersion,
                                    clientId,
                                    ...idsRef.current,
                                }),
                            },
                        );
                        const payload = await response.json().catch(() => ({}));
                        if (!response.ok) {
                            throw new Error(
                                response.status === 409
                                    ? 'This job changed. Reload and try again.'
                                    : response.status === 401 || response.status === 428
                                      ? 'Your session expired. Sign in again.'
                                      : response.status === 403
                                        ? 'You do not have permission to duplicate jobs.'
                                        : payload?.error
                                          ?? 'Could not duplicate this job.',
                            );
                        }
                        const newJobId = payload?.result?.jobId;
                        if (
                            payload?.ok !== true
                            || payload?.result?.status !== 'draft'
                            || typeof newJobId !== 'string'
                            || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                                .test(newJobId)
                            || newJobId !== idsRef.current.jobId
                            || newJobId === sourceJobId
                        ) {
                            throw new Error(
                                'The duplicate was not confirmed. Reload and try again.');
                        }
                        window.dispatchEvent(new Event('staff-workspace-updated'));
                        router.push(`/staff/jobs/${newJobId}/edit`);
                        navigating = true;
                    } catch (caught) {
                        setError(
                            caught instanceof Error
                                ? caught.message
                                : 'Could not duplicate this job.');
                    } finally {
                        if (!navigating) {
                            busyRef.current = false;
                            setBusy(false);
                        }
                    }
                }}
            >
                {busy ? 'Duplicating…' : 'Duplicate job'}
            </Button>
            {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
        </span>
    );
}

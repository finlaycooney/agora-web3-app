'use client';

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
} from 'react';

import type { HistoryEntry, ViewSnapshot } from './preview-navigation';

interface AgoraMarker {
    sessionId: string;
    id: string;
}

function markerFromState(state: unknown): AgoraMarker | null {
    if (state && typeof state === 'object' && 'agoraPreview' in state) {
        const marker = (state as { agoraPreview?: unknown }).agoraPreview;
        if (
            marker
            && typeof marker === 'object'
            && typeof (marker as AgoraMarker).sessionId === 'string'
            && typeof (marker as AgoraMarker).id === 'string'
        ) {
            return marker as AgoraMarker;
        }
    }
    return null;
}

export function usePreviewHistory({
    capture,
    enter,
    restore,
    labelForHash,
    fallback,
    restoreScroll,
    intercept,
}: {
    capture: () => ViewSnapshot;
    enter: (hash: string) => void;
    restore: (hash: string, snapshot: ViewSnapshot) => void;
    labelForHash: (hash: string) => string;
    fallback: () => { hash: string; label: string };
    restoreScroll: (snapshot: ViewSnapshot) => void;
    // Returning true takes over an internal-link navigation (e.g. an unsaved
    // changes guard). Popstate/browser Back cannot be intercepted safely, so
    // callers must treat this as in-app navigation only.
    intercept?: (hash: string) => boolean;
}) {
    const [ready, setReady] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [backLabel, setBackLabel] = useState<string | null>(null);

    const entriesRef = useRef(new Map<string, HistoryEntry>());
    const activeIdRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const navGenRef = useRef(0);
    const callbacksRef = useRef({
        capture,
        enter,
        restore,
        labelForHash,
        fallback,
        restoreScroll,
        intercept,
    });
    useLayoutEffect(() => {
        callbacksRef.current = {
            capture,
            enter,
            restore,
            labelForHash,
            fallback,
            restoreScroll,
            intercept,
        };
    });

    const activateEntry = (id: string) => {
        activeIdRef.current = id;
        const entry = entriesRef.current.get(id);
        const previous = entry?.previousId
            ? entriesRef.current.get(entry.previousId)
            : undefined;
        setBackLabel(
            previous?.snapshot.preview
                ? `Back to ${previous.snapshot.preview.kind === 'job'
                      ? 'Job'
                      : previous.snapshot.preview.kind === 'client'
                        ? 'Client'
                        : 'Candidate'} preview`
                : previous
                  ? `Back to ${previous.label}`
                  : null,
        );
    };

    const refreshActiveSnapshot = () => {
        const activeId = activeIdRef.current;
        if (activeId) {
            const entry = entriesRef.current.get(activeId);
            if (entry) entry.snapshot = callbacksRef.current.capture();
        }
    };

    const scheduleRestoreScroll = (snapshot: ViewSnapshot) => {
        const gen = ++navGenRef.current;
        const id = activeIdRef.current;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (gen !== navGenRef.current || id !== activeIdRef.current) return;
                callbacksRef.current.restoreScroll(snapshot);
            });
        });
    };

    const navigate = (hash: string) => {
        const current = window.location.hash || '#/candidates';
        if (hash === current) {
            navGenRef.current += 1;
            setRestoring(false);
            callbacksRef.current.enter(hash);
            return;
        }
        refreshActiveSnapshot();
        const id = crypto.randomUUID();
        entriesRef.current.set(id, {
            id,
            hash,
            label: callbacksRef.current.labelForHash(hash),
            previousId: activeIdRef.current,
            snapshot: callbacksRef.current.capture(),
        });
        activateEntry(id);
        history.pushState(
            { ...(history.state ?? {}), agoraPreview: { sessionId: sessionIdRef.current, id } },
            '',
            hash,
        );
        navGenRef.current += 1;
        setRestoring(false);
        callbacksRef.current.enter(hash);
    };

    const back = () => {
        const activeId = activeIdRef.current;
        const entry = activeId ? entriesRef.current.get(activeId) : undefined;
        if (entry?.previousId && entriesRef.current.has(entry.previousId)) {
            history.back();
            return;
        }
        const hash = callbacksRef.current.fallback().hash;
        if (hash === (window.location.hash || '#/candidates')) return;
        const id = activeIdRef.current ?? crypto.randomUUID();
        entriesRef.current.set(id, {
            id,
            hash,
            label: callbacksRef.current.labelForHash(hash),
            previousId: null,
            snapshot: callbacksRef.current.capture(),
        });
        activateEntry(id);
        navGenRef.current += 1;
        history.replaceState(
            { ...(history.state ?? {}), agoraPreview: { sessionId: sessionIdRef.current, id } },
            '',
            hash,
        );
        setRestoring(false);
        callbacksRef.current.enter(hash);
    };

    const reset = (hash: string, snapshot: ViewSnapshot) => {
        entriesRef.current.clear();
        sessionIdRef.current = crypto.randomUUID();
        const id = crypto.randomUUID();
        entriesRef.current.set(id, {
            id,
            hash,
            label: callbacksRef.current.labelForHash(hash),
            previousId: null,
            snapshot,
        });
        activateEntry(id);
        navGenRef.current += 1;
        history.replaceState(
            { ...(history.state ?? {}), agoraPreview: { sessionId: sessionIdRef.current, id } },
            '',
            hash,
        );
        setRestoring(false);
        callbacksRef.current.enter(hash);
    };

    const onInternalLinkClick = (event: ReactMouseEvent<HTMLDivElement>) => {
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
        if (!anchor) return;
        const element = anchor as HTMLAnchorElement;
        if (element.target || element.hasAttribute('download')) return;
        const href = element.getAttribute('href');
        if (!href || !href.startsWith('#/')) return;
        event.preventDefault();
        if (callbacksRef.current.intercept?.(href)) return;
        navigate(href);
    };

    useEffect(() => {
        if (!sessionIdRef.current) {
            sessionIdRef.current = crypto.randomUUID();
        }
        if (!window.location.hash) {
            window.location.hash = '#/candidates';
        }
        if (!activeIdRef.current) {
            const hash = window.location.hash;
            const id = crypto.randomUUID();
            entriesRef.current.set(id, {
                id,
                hash,
                label: callbacksRef.current.labelForHash(hash),
                previousId: null,
                snapshot: callbacksRef.current.capture(),
            });
            activateEntry(id);
            history.replaceState(
                {
                    ...(history.state ?? {}),
                    agoraPreview: { sessionId: sessionIdRef.current, id },
                },
                '',
                hash,
            );
            callbacksRef.current.enter(hash);
        }

        const registerFresh = (hash: string, previousId: string | null) => {
            refreshActiveSnapshot();
            const id = crypto.randomUUID();
            entriesRef.current.set(id, {
                id,
                hash,
                label: callbacksRef.current.labelForHash(hash),
                previousId,
                snapshot: callbacksRef.current.capture(),
            });
            activateEntry(id);
            history.replaceState(
                {
                    ...(history.state ?? {}),
                    agoraPreview: { sessionId: sessionIdRef.current, id },
                },
                '',
                hash,
            );
            navGenRef.current += 1;
            setRestoring(false);
            callbacksRef.current.enter(hash);
        };

        const onPopState = () => {
            const marker = markerFromState(history.state);
            const hash = window.location.hash || '#/candidates';
            const session = sessionIdRef.current;
            if (marker && marker.sessionId === session && marker.id === activeIdRef.current) {
                return;
            }
            const entry =
                marker && marker.sessionId === session
                    ? entriesRef.current.get(marker.id)
                    : undefined;
            if (marker && entry && entry.hash === hash) {
                refreshActiveSnapshot();
                activateEntry(marker.id);
                setRestoring(true);
                callbacksRef.current.restore(entry.hash, entry.snapshot);
                scheduleRestoreScroll(entry.snapshot);
                return;
            }
            registerFresh(
                hash,
                marker && marker.sessionId !== session ? null : activeIdRef.current,
            );
        };

        const onHashChange = () => {
            const marker = markerFromState(history.state);
            const hash = window.location.hash || '#/candidates';
            if (
                marker
                && marker.sessionId === sessionIdRef.current
                && marker.id === activeIdRef.current
                && entriesRef.current.get(marker.id)?.hash === hash
            ) {
                return;
            }
            registerFresh(hash, activeIdRef.current);
        };

        window.addEventListener('popstate', onPopState);
        window.addEventListener('hashchange', onHashChange);
        const frame = requestAnimationFrame(() => setReady(true));
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('popstate', onPopState);
            window.removeEventListener('hashchange', onHashChange);
        };
    }, []);

    return {
        ready,
        restoring,
        backLabel,
        navigate,
        back,
        reset,
        onInternalLinkClick,
    };
}

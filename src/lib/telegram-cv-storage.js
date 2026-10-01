// Bound real network work, not just the caller's promise. Abort preserves any
// uncertain upload reservation for safe reconciliation or later cleanup.
export function cvStorageFetch(input, init = {}) {
    const timeout = AbortSignal.timeout(10000);
    const inherited = init.signal ?? (input instanceof Request ? input.signal : null);
    return fetch(input, { ...init, signal: inherited ? AbortSignal.any([inherited, timeout]) : timeout });
}

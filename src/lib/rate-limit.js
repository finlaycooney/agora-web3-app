// Sliding-window in-memory rate limiter for the public submission route. It
// is intentionally best-effort: serverless instances each keep their own map,
// so this blunts bursts but is not a global cap — the durable per-address cap
// lives in submit_public_application_v1.
const buckets = new Map();
const MAX_KEYS = 10_000;

export function rateLimitAllow(key, { limit, windowMs, now = Date.now() }) {
    let entries = buckets.get(key);
    if (!entries) {
        entries = [];
        buckets.set(key, entries);
    }
    const cutoff = now - windowMs;
    while (entries.length > 0 && entries[0] <= cutoff) {
        entries.shift();
    }
    if (entries.length >= limit) {
        return false;
    }
    entries.push(now);
    if (buckets.size > MAX_KEYS) {
        for (const [entryKey, list] of buckets) {
            while (list.length > 0 && list[0] <= cutoff) {
                list.shift();
            }
            if (list.length === 0) {
                buckets.delete(entryKey);
            }
            if (buckets.size <= MAX_KEYS / 2) {
                break;
            }
        }
    }
    return true;
}

// Next may normalize the internal request URL host (for example 127.0.0.1
// to localhost). The Host header is the browser's actual destination and
// cannot be independently set by cross-origin browser JavaScript.
export function staffRequestOriginAllowed(request) {
    const origin = request.headers.get('origin');
    if (origin === null) return true;
    try {
        const destination = new URL(request.url);
        destination.host = request.headers.get('host') ?? destination.host;
        return origin === destination.origin;
    } catch { return false; }
}

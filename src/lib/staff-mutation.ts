export async function staffMutation(url: string, body: unknown) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(
            response.status === 409
                ? 'This record changed. Reload and try again.'
                : response.status === 401 || response.status === 428
                  ? 'Your session expired. Sign in again.'
                  : response.status === 403
                    ? 'You do not have permission to make this change.'
                    : payload.fields
                      ? `Check these fields: ${Object.keys(payload.fields).join(', ')}`
                      : 'Could not save. Please try again.',
        );
    }
    window.dispatchEvent(new Event('staff-workspace-updated'));
    return payload;
}

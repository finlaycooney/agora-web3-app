const allowedApiUrls = new Set([
    'http://127.0.0.1:54321',
    'http://127.0.0.1:54321/',
    'http://localhost:54321',
    'http://localhost:54321/',
]);

export function assertLocalSupabaseTarget(value) {
    if (!allowedApiUrls.has(value)) {
        throw new Error('Tests require an explicitly allowed local Supabase API URL on port 54321.');
    }
}

export function assertLocalServiceRoleKey(value) {
    let payload;
    try {
        const parts = value.split('.');
        if (parts.length !== 3 || parts.some((part) => !part)) {
            throw new Error('Invalid token shape');
        }
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        throw new Error('Tests require the local SERVICE_ROLE_KEY from supabase status.');
    }

    if (payload?.iss !== 'supabase-demo' || payload?.role !== 'service_role' || payload?.ref) {
        throw new Error('Tests require a local Supabase service-role JWT, not hosted project credentials.');
    }
}

export function assertNonproductionTestEnvironment(environment = process.env) {
    const mode = environment.E2E_REAL_BACKEND;
    if (mode !== undefined && mode !== '0' && mode !== '1') {
        throw new Error('E2E_REAL_BACKEND must be unset, 0 or 1.');
    }

    const url = environment.NEXT_PUBLIC_SUPABASE_URL;
    const key = environment.SUPABASE_SERVICE_ROLE_KEY;
    if (mode === '1' || url || key) {
        assertLocalSupabaseTarget(url);
    }
    if (mode === '1' || key) {
        assertLocalServiceRoleKey(key);
    }
}

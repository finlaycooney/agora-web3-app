type SearchParamsLike = { get(name: string): string | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function textParam(params: SearchParamsLike, name: string): string {
    return params.get(name) ?? '';
}

export function optionParam<T extends string>(
    params: SearchParamsLike,
    name: string,
    allowed: readonly T[],
    fallback: T,
): T {
    const value = params.get(name);
    return value !== null && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback;
}

export function uuidParam(params: SearchParamsLike, name: string): string {
    const value = params.get(name);
    return value !== null && UUID_PATTERN.test(value) ? value : 'all';
}

export function flagParam(params: SearchParamsLike, name: string): boolean {
    const value = params.get(name);
    return value === '1' || value === 'true';
}

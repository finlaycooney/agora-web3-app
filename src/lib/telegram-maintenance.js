import { createHash, timingSafeEqual } from 'node:crypto';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
const validSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value);

export async function runTelegramMaintenance(pool) {
    const client = await pool.connect();
    try {
        await client.query("begin isolation level read committed; set local role app_telegram_maintenance; set local statement_timeout='10s'; set local lock_timeout='500ms'");
        const { rows } = await client.query('select app.telegram_maintenance_v1() as result');
        await client.query('commit');
        return rows[0].result;
    } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
    } finally { client.release(); }
}

// A separate execution-only credential cannot read messages or change retention
// decisions. Cleanup remains available when the intake feature is switched off.
export async function handleTelegramMaintenance(request, { secret, getPool, run = runTelegramMaintenance }) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    if (request.headers.has('origin')) return json({ error: 'Service requests only.' }, 403);
    if (!validSecret(secret)) return json({ error: 'Maintenance is not configured.' }, 503);
    const authorization = request.headers.get('authorization') ?? '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!validSecret(supplied) || !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(secret).digest())) {
        return json({ error: 'Unauthorized.' }, 401);
    }
    if (new URL(request.url).search) return json({ error: 'Parameters are not accepted.' }, 400);
    try {
        const pool = getPool();
        if (!pool) return json({ error: 'Maintenance is not configured.' }, 503);
        const result = await run(pool);
        // Return a fixed aggregate response, never source text or database errors.
        const counts = {};
        for (const key of ['ownersProcessed', 'batchesPurged', 'messagesPurged', 'bytesFreed', 'queriesExpired', 'queryResultRowsDeleted']) {
            if (!Number.isSafeInteger(result?.[key]) || result[key] < 0) throw new Error('Invalid maintenance result');
            counts[key] = result[key];
        }
        if (typeof result.remainingWork !== 'boolean') throw new Error('Invalid maintenance result');
        return json({ ok: true, ...counts, remainingWork: result.remainingWork });
    } catch {
        return json({ error: 'Maintenance temporarily unavailable.' }, 503);
    }
}

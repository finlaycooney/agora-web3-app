import { pathToFileURL } from 'node:url';

export async function requestMaintenance({ url, secret, fetchImpl = fetch }) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.pathname !== '/api/telegram-maintenance') {
        throw new Error('Invalid maintenance URL');
    }
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? '')) throw new Error('Invalid maintenance credential');
    const response = await fetchImpl(target, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Maintenance returned HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty maintenance response');
    const chunks = []; let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 4096) { await reader.cancel(); throw new Error('Invalid maintenance response'); }
            chunks.push(Buffer.from(value));
        }
    } finally { reader.releaseLock(); }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.analysesPurged === undefined) result.analysesPurged = 0;
    if (result.ok !== true) throw new Error('Maintenance did not complete');
    const counts = {};
    for (const key of ['ownersProcessed', 'batchesPurged', 'messagesPurged', 'bytesFreed', 'queriesExpired', 'queryResultRowsDeleted', 'analysesPurged']) {
        if (!Number.isSafeInteger(result[key]) || result[key] < 0) throw new Error('Invalid maintenance response');
        counts[key] = result[key];
    }
    if (typeof result.remainingWork !== 'boolean') throw new Error('Invalid maintenance response');
    return { ...counts, remainingWork: result.remainingWork };
}

export async function drainMaintenance(options, request = requestMaintenance) {
    const totals = { runs: 0, ownersProcessed: 0, batchesPurged: 0, messagesPurged: 0, bytesFreed: 0, queriesExpired: 0, queryResultRowsDeleted: 0, analysesPurged: 0, remainingWork: false };
    // Keep each hosted invocation small while allowing a scheduled run to drain
    // several pages. Held sources cannot cause an unbounded busy loop.
    for (let i = 0; i < 8; i++) {
        const result = await request(options);
        totals.runs++;
        for (const key of ['ownersProcessed', 'batchesPurged', 'messagesPurged', 'bytesFreed', 'queriesExpired', 'queryResultRowsDeleted', 'analysesPurged']) totals[key] += result[key];
        totals.remainingWork = result.remainingWork;
        if (!result.remainingWork || result.batchesPurged + result.queriesExpired + result.queryResultRowsDeleted + result.analysesPurged === 0) break;
    }
    return totals;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const url = process.env.TELEGRAM_MAINTENANCE_URL;
    const secret = process.env.TELEGRAM_MAINTENANCE_SECRET;
    if (!url && !secret) console.log('Telegram maintenance is not configured; no request sent.');
    else {
        try { console.log(JSON.stringify(await drainMaintenance({ url, secret }))); }
        catch { console.error('Telegram maintenance failed. Check hosted configuration and service health.'); process.exitCode = 1; }
    }
}

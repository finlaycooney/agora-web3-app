import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { POSTGRES_17_IMAGE, assertLocalTestEnvironment, psql, publishedPort, startPostgresContainer, stopAndRemoveContainer } from '../support/foundation-docker.js';
import { AUTHZ_ID, installStaffFixture, staffPoolOptions } from '../support/staff-authorization.js';
import { CJ_ID, CJ_SUBJECTS, clientJobFixtureSql } from '../support/client-job-workflows.js';
import { createTelegramDraft, updateTelegramDraft, registerTelegramWorker } from '../../src/lib/telegram-intake-operations.js';
import { profileSearchStatus, profileSearchAction, profileSearchWorkerOperation } from '../../src/lib/profile-search-operations.js';
import { createSemanticWorker } from '../../services/semantic-worker/worker.mjs';
import { createPendingStore } from '../../services/semantic-worker/store.mjs';
import { relevanceProfiles, relevanceQueries } from '../fixtures/semantic-relevance.js';

const org = AUTHZ_ID.ORG_B;
const identity = subject => ({ provider: 'google', issuer: 'https://accounts.google.com', subject });
const owner = identity(CJ_SUBJECTS.ADMIN);
const other = identity(CJ_SUBJECTS.RECRUITER);
const indexVersion = 'intfloat/multilingual-e5-small@614241f622f53c4eeff9890bdc4f31cfecc418b3:e5-prefix:l2:384:v1';
const chunkerVersion = 'e5-utf8-448-v1';
const hash = text => createHash('sha256').update(text).digest('hex');
const vector = axis => Array.from({ length: 384 }, (_, i) => i === axis ? 1 : 0);

async function fixture(t) {
  assertLocalTestEnvironment();
  const adminPassword = randomUUID();
  const db = await startPostgresContainer('profilesearchruntime', POSTGRES_17_IMAGE, { publish: true, password: adminPassword });
  const root = mkdtempSync(join(tmpdir(), 'agora-semantic-runtime-'));
  let pool; let workerPool; let admin;
  t.after(async () => { await Promise.all([pool?.end(), workerPool?.end(), admin?.end()]); stopAndRemoveContainer(db); rmSync(root, { recursive: true, force: true }); });
  const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
  const files = readdirSync(dir).filter(name => name >= '20260922090000_foundation_roles.sql' && name.slice(0, 14) <= '20261002180000' && name.endsWith('.sql')).sort();
  assert.ok(files.some(name => name.startsWith('20261002180000_')), 'Install the semantic-search migration');
  for (const name of files) psql(db, readFileSync(join(dir, name), 'utf8'));
  const password = installStaffFixture(db); psql(db, clientJobFixtureSql);
  psql(db, `insert into app.role_permissions(organization_id,role_id,permission_key) values('${org}','${CJ_ID.ROLE_B_RECRUITER}','candidates.write') on conflict do nothing;`);
  pool = new pg.Pool(staffPoolOptions(db, password, 4));
  admin = new pg.Pool({ host: '127.0.0.1', port: publishedPort(db, 5432), database: 'postgres', user: 'postgres', password: adminPassword, max: 2 });
  const workerPassword = randomUUID();
  psql(db, `create role semantic_runtime_test login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${workerPassword}'; grant app_telegram_worker to semantic_runtime_test;`);
  workerPool = new pg.Pool({ ...staffPoolOptions(db, workerPassword, 3), user: 'semantic_runtime_test' });
  const registered = await registerTelegramWorker(pool, owner, org, 'Synthetic semantic worker');
  const mapError = error => { error.status ??= { '40001': 409, '22023': 400, '42501': 403, P0002: 404 }[error.code]; throw error; };
  const host = (action, body) => profileSearchWorkerOperation(workerPool, registered.token, action, body).catch(mapError);
  const status = input => profileSearchStatus(pool, owner, org, input);
  const action = input => profileSearchAction(pool, owner, org, input);
  const draft = fields => createTelegramDraft(pool, owner, org, { fields, sourceTitle: 'Synthetic semantic fixture' });
  const store = () => createPendingStore({ root: join(root, 'pending'), server: 'https://synthetic.invalid', workerToken: registered.token });
  const candidate = async fields => {
    const id = randomUUID();
    await admin.query(`insert into app.candidates(id,organization_id,full_name,first_name,last_name,contact_email,headline,location,professional_summary,compensation_preference,identity_state,lifecycle)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'established','active')`, [id, org, `${fields.firstName} ${fields.lastName}`, fields.firstName, fields.lastName, fields.primaryEmail, fields.headline, fields.location, fields.professionalSummary, fields.compensationPreference]);
    return id;
  };
  return { db, root, pool, workerPool, admin, registered, host, status, action, draft, store, candidate };
}

// A deterministic tokenizer stand-in tests the protocol, never model quality.
function syntheticPlan({ text }) {
  const bytes = Buffer.from(text); const chunks = []; let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + 512, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push({ ordinal: chunks.length, start_byte: start, end_byte: end, sha256: hash(bytes.subarray(start, end)), token_count: 400 });
    start = end;
  }
  return { index_version: indexVersion, chunker_version: chunkerVersion, source_sha256: hash(bytes), byte_length: bytes.length, chunks };
}
const syntheticEmbed = async ({ texts }) => ({ indexVersion, embeddings: texts.map(text => vector(text.includes('quantum-lighthouse') ? 0 : 1)) });

async function drain(runtime, limit = 500) {
  for (let i = 0; i < limit; i++) if ((await runtime.tick()).status === 'idle') return i;
  assert.fail('Worker did not drain its bounded synthetic queue');
}
async function queryResults(f, runtime, query, scope = 'all', readyOnly = false) {
  const request = await f.action({ action: 'search', operationId: randomUUID(), query, scope, readyOnly });
  for (let i = 0; i < 100; i++) {
    const detail = await f.status({ queryId: request.queryId });
    if (detail.status === 'completed') return detail;
    assert.ok(['queued', 'running'].includes(detail.status), `Search unexpectedly ${detail.status}: ${detail.errorCode}`);
    await runtime.tick();
  }
  assert.fail('Synthetic query did not finish');
}

test('semantic worker, encrypted restart and hosted search preserve whole-profile coverage and owner scope', { timeout: 120000 }, async t => {
  const f = await fixture(t);
  const summary = `${'General engineering experience with distributed systems. '.repeat(80)}\n中文 résumé 🚀 quantum-lighthouse research at the end of the reviewed profile.`;
  const mine = await f.draft({ firstName: 'Synthetic', lastName: 'Tail', primaryEmail: 'tail@example.invalid', professionalSummary: summary });
  const privateOther = await createTelegramDraft(f.pool, other, org, { fields: { firstName: 'Other', lastName: 'Private', professionalSummary: 'quantum-lighthouse private fact' } });
  const approvedId = await f.candidate({ firstName: 'Shared', lastName: 'Candidate', primaryEmail: 'shared@example.invalid', professionalSummary: 'quantum-lighthouse approved canonical experience' });
  let loseAcknowledgement = true; let replayedBody; let completionAttempts = 0;
  const host = async (action, body) => {
    const response = await f.host(action, body);
    if (action === 'complete' && body.kind === 'plan') {
      completionAttempts++;
      if (loseAcknowledgement) { loseAcknowledgement = false; replayedBody = structuredClone(body); throw new Error('SYNTHETIC_ACK_LOST'); }
    }
    return response;
  };
  let runtime = createSemanticWorker({ host, embed: syntheticEmbed, plan: syntheticPlan, vault: f.store() });
  // The first committed plan acknowledgement is deliberately lost. Constructing
  // a fresh store and runner must replay it without losing the source's tail.
  for (let i = 0; i < 20 && loseAcknowledgement; i++) {
    try { await runtime.tick(); } catch (error) { assert.equal(error.message, 'SYNTHETIC_ACK_LOST'); }
  }
  assert.equal(loseAcknowledgement, false);
  const pending = f.store().load(); assert.ok(pending, 'Unacknowledged result must survive restart');
  runtime = createSemanticWorker({ host, embed: syntheticEmbed, plan: syntheticPlan, vault: f.store() });
  await drain(runtime);
  assert.ok(completionAttempts >= 2); assert.ok(replayedBody);
  const detail = await queryResults(f, runtime, 'quantum-lighthouse');
  assert.ok(detail.results.some(row => row.sourceId === mine.id));
  assert.ok(detail.results.some(row => row.sourceId === approvedId));
  assert.ok(detail.results.every(row => row.sourceId !== privateOther.id));
  const tail = detail.results.find(row => row.sourceId === mine.id);
  assert.equal(tail.score, 1); assert.ok(tail.missingFields.includes('cv'));
  assert.match(tail.matchedText, /quantum-lighthouse/);
  const ready = await queryResults(f, runtime, 'quantum-lighthouse', 'all', true);
  assert.ok(ready.results.some(row => row.sourceId === approvedId));
  assert.ok(ready.results.every(row => row.sourceId !== mine.id));

  // Cached pages recheck the live indexed revision rather than returning facts
  // from the old profile after a recruiter corrects it.
  await updateTelegramDraft(f.pool, owner, org, mine.id, { expectedVersion: mine.version, fields: { professionalSummary: 'Reviewed unrelated experience' } });
  const stale = await f.status({ queryId: detail.queryId });
  assert.ok(stale.results.every(row => row.sourceId !== mine.id));
  assert.equal(stale.coverage.corpusChanged, true);
  await assert.rejects(profileSearchStatus(f.pool, other, org, { queryId: detail.queryId }));
});

test('real local model ranks 100 synthetic profiles through the actual hosted and worker search path', {
  timeout: 240000, skip: !process.env.SEMANTIC_EMBEDDING_TOKEN_FILE,
}, async t => {
  const f = await fixture(t);
  const base = new URL(process.env.SEMANTIC_EMBEDDING_URL ?? 'http://127.0.0.1:8818/v1/embeddings');
  assert.equal(base.hostname, '127.0.0.1'); assert.equal(base.protocol, 'http:');
  const token = readFileSync(process.env.SEMANTIC_EMBEDDING_TOKEN_FILE, 'utf8').trim();
  const request = async (path, body) => {
    const response = await fetch(new URL(path, base), { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200, `Local model returned ${response.status}`); return response.json();
  };
  const model = 'intfloat/multilingual-e5-small';
  const embed = async ({ texts, inputType }) => {
    const value = await request('/v1/embeddings', { model, input: texts, input_type: inputType });
    return { indexVersion: value.index_version, embeddings: value.data.map(row => row.embedding) };
  };
  const plan = ({ text }) => request('/v1/chunk-plan', { model, chunker_version: chunkerVersion, text });
  const runtime = createSemanticWorker({ host: f.host, embed, plan, vault: f.store() });
  const ids = new Map();
  for (const [i, profile] of relevanceProfiles.entries()) {
    const id = i % 2 === 0 ? await f.candidate(profile.fields) : (await f.draft(profile.fields)).id;
    ids.set(id, profile.key);
  }
  await drain(runtime, 600);
  let recall = 0; let mrr = 0;
  for (const query of relevanceQueries) {
    const detail = await queryResults(f, runtime, query.query);
    assert.equal(detail.coverage.pending, 0); assert.equal(detail.coverage.failed, 0);
    const relevant = new Set(query.relevantKeys);
    const keys = detail.results.map(row => ids.get(row.sourceId));
    recall += keys.slice(0, 10).filter(key => relevant.has(key)).length / relevant.size;
    const first = keys.findIndex(key => relevant.has(key)); mrr += first < 0 ? 0 : 1 / (first + 1);
  }
  t.diagnostic(JSON.stringify({ syntheticOnly: true, profiles: ids.size, queries: relevanceQueries.length, recallAt10: recall / relevanceQueries.length, mrr: mrr / relevanceQueries.length }));
  assert.ok(recall / relevanceQueries.length >= 0.85);
  assert.ok(mrr / relevanceQueries.length >= 0.8);
});

test('exact authorized search and queue claims remain bounded at 5k, 20k and 100k synthetic profiles', {
  timeout: 300000, skip: process.env.SEMANTIC_SCALE !== '1',
}, async t => {
  const f = await fixture(t);
  let previous = 0;
  for (const count of [5000, 20000, 100000]) {
    await f.admin.query(`insert into app.candidates(id,organization_id,full_name,identity_state,lifecycle)
      select ('a1000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,'Synthetic scale profile '||g,'established','active'
      from generate_series($2::integer,$3::integer)g`, [org, previous + 1, count]);
    const claimStarted = performance.now();
    await f.host('claim', {});
    const claimMs = performance.now() - claimStarted;
    // Seed only derived synthetic vectors here. Protocol and real-model tests
    // above exercise the actual plan/embed phases; this isolates query scale.
    await f.admin.query(`update app.profile_search_sources set status='ready',projection_text='Name: Synthetic scale profile',
      source_sha256=encode(sha256(convert_to('Name: Synthetic scale profile','UTF8')),'hex'),lease_token=null,lease_expires_at=null
      where organization_id=$1 and source_type='candidate'`, [org]);
    await f.admin.query(`insert into app.profile_search_chunks(source_id,ordinal,organization_id,owner_user_id,revision,start_byte,end_byte,sha256,token_count,embedding)
      select s.id,0,s.organization_id,null,s.revision,0,29,encode(sha256(convert_to('Name: Synthetic scale profile','UTF8')),'hex'),10,
        array(select (x/sqrt(v.norm))::real from unnest(v.vector_values) x)
      from app.profile_search_sources s cross join lateral (
        select array_agg(sin(i*0.23+hashtextextended(s.source_id::text,0)%1000000*0.001)) vector_values,
          sum(power(sin(i*0.23+hashtextextended(s.source_id::text,0)%1000000*0.001),2)) norm from generate_series(1,384)i
      )v where s.organization_id=$1 and s.source_type='candidate' and not exists(select 1 from app.profile_search_chunks c where c.source_id=s.id)`, [org]);
    await f.admin.query('analyze app.profile_search_sources; analyze app.profile_search_chunks; analyze app.candidates');
    const requested = await f.action({ action: 'search', operationId: randomUUID(), query: 'Synthetic scale query', scope: 'approved', readyOnly: false });
    const { job } = await f.host('claim', {}); assert.equal(job.id, requested.queryId); assert.equal(job.kind, 'query');
    const started = performance.now();
    const completed = await f.host('complete', { jobId: job.id, leaseToken: job.leaseToken, kind: 'query', indexVersion,
      projectionVersion: 'candidate-profile-v1', chunkerVersion, querySha256: job.querySha256, result: { embedding: vector(0) } });
    const queryMs = performance.now() - started;
    t.diagnostic(JSON.stringify({ syntheticOnly: true, profiles: count, queueClaimMs: Math.round(claimMs), queryMs: Math.round(queryMs), status: completed.status, errorCode: completed.errorCode }));
    assert.equal(completed.status, 'completed', `Exact search at ${count} exceeded its bounded execution deadline`);
    const pageStarted = performance.now();
    const first = await f.status({ queryId: requested.queryId });
    const pageMs = performance.now() - pageStarted;
    assert.equal(first.results.length, 25); assert.ok(first.nextAfter);
    const second = await f.status({ queryId: requested.queryId, after: first.nextAfter });
    assert.equal(second.results.length, 25);
    assert.ok(second.results.every(row => !first.results.some(prior => prior.sourceId === row.sourceId)));
    const { rows: [stored] } = await f.admin.query('select count(*)::integer n from app.profile_search_results where query_id=$1', [requested.queryId]);
    assert.ok(stored.n >= count, 'The full authorized corpus must be ranked, not silently capped');
    t.diagnostic(JSON.stringify({ profiles: count, firstPageMs: Math.round(pageMs), storedResults: stored.n }));
    previous = count;
  }
});

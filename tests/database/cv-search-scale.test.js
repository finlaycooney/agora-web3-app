import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { cvSearchFixture, org, owner, identity, indexVersion, chunkerVersion, vector, hash } from '../support/cv-search-runtime.js';
import { AUTHZ_ID, SUBJECTS } from '../support/staff-authorization.js';
import { registerTelegramWorker } from '../../src/lib/telegram-intake-operations.js';
import { profileSearchStatus } from '../../src/lib/profile-search-operations.js';
import { createSemanticWorker } from '../../services/semantic-worker/worker.mjs';

const secondOwner = identity(SUBJECTS.SHARED);
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const stats = values => ({ n: values.length, p50: Math.round(percentile(values, .5)), p95: Math.round(percentile(values, .95)), max: Math.round(Math.max(...values)) });

async function seed(f, count, previous) {
  // Per100 candidates:20 without CV,40 with4 chunks,25 with12,10
  // with32,5 with64. Including their profiles:1,200 chunks/100 people.
  // This deliberately heavy-tailed synthetic distribution is not a claim about
  // customer data. Derived vector seeding isolates SQL throughput from inference.
  await f.admin.query(`create temporary table scale_cv_seed as
    select g, ('a1000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid candidate_id,
      ('a2000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid blob_id,
      ('a3000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid document_id,
      case when (g-1)%100<20 then 0 when (g-1)%100<60 then 4 when (g-1)%100<85 then 12 when (g-1)%100<95 then 32 else 64 end chunks
    from generate_series($1::integer,$2::integer)g`, [previous + 1, count]);
  await f.admin.query(`insert into app.candidates(id,organization_id,full_name,identity_state,lifecycle)
    select candidate_id,$1,'Synthetic CV volume '||g,'established','active' from scale_cv_seed`, [org]);
  await f.admin.query(`insert into app.file_blobs(id,organization_id,candidate_id,sha256,size_bytes,mime_type,extension,lifecycle,scan_state)
    select blob_id,$1,candidate_id,sha256(convert_to(blob_id::text,'UTF8')),512,'application/pdf','pdf','live','unscanned' from scale_cv_seed where chunks>0`, [org]);
  await f.admin.query(`insert into app.blob_locations(id,organization_id,blob_id,backend_key,bucket,object_key,state,is_primary,verified_sha256,verified_size_bytes,verified_at)
    select gen_random_uuid(),$1,blob_id,'supabase_storage','synthetic-cv-volume',blob_id::text,'available',true,sha256(convert_to(blob_id::text,'UTF8')),512,now() from scale_cv_seed where chunks>0`, [org]);
  await f.admin.query(`insert into app.documents(id,organization_id,candidate_id,blob_id,purpose,original_filename,received_at,lifecycle)
    select document_id,$1,candidate_id,blob_id,'cv','Synthetic volume.pdf',now(),'active' from scale_cv_seed where chunks>0`, [org]);
  await f.admin.query(`update app.candidates c set current_document_id=s.document_id from scale_cv_seed s where c.id=s.candidate_id and s.chunks>0`);
  await f.admin.query(`insert into app.candidate_reviewed_cv_text(organization_id,candidate_id,document_id,document_sha256,parser_version,text_sha256,blocks,text_content,reviewed_by)
    select $1,candidate_id,document_id,encode(sha256(convert_to(blob_id::text,'UTF8')),'hex'),'synthetic-parser-v1',
      encode(sha256(convert_to(repeat(repeat('Synthetic work history. ',37)||repeat('x',12),chunks),'UTF8')),'hex'),
      '[]'::jsonb,repeat(repeat('Synthetic work history. ',37)||repeat('x',12),chunks),$2 from scale_cv_seed where chunks>0`, [org, AUTHZ_ID.USER_ADMIN2]);
  await f.admin.query(`update app.profile_search_sources s set status='ready',
      projection_text=case when component='cv' then r.text_content else 'Synthetic profile description.' end,
      source_sha256=case when component='cv' then r.text_sha256 else encode(sha256(convert_to('Synthetic profile description.','UTF8')),'hex') end,
      lease_token=null,lease_expires_at=null
    from app.candidates c left join app.candidate_reviewed_cv_text r on r.candidate_id=c.id and r.document_id=c.current_document_id
    where s.organization_id=$1 and s.source_type='candidate' and s.source_id=c.id and c.lifecycle='active' and s.status<>'ready'`, [org]);
  await f.admin.query(`with vectors as materialized (
      select n,array(select (x/sqrt(v.norm))::real from unnest(v.vals)x) embedding from generate_series(0,127)n
      cross join lateral (select array_agg(sin(i*.23+n*.017)) vals,sum(power(sin(i*.23+n*.017),2)) norm from generate_series(1,384)i)v
    ) insert into app.profile_search_chunks(source_id,ordinal,organization_id,owner_user_id,revision,start_byte,end_byte,sha256,token_count,embedding)
    select s.id,g,$1,null,s.revision,case when s.component='cv' then g*900 else 0 end,
      case when s.component='cv' then (g+1)*900 else octet_length(s.projection_text) end,
      encode(sha256(convert_to(case when s.component='cv' then substring(s.projection_text from g*900+1 for 900) else s.projection_text end,'UTF8')),'hex'),100,
      case when s.source_id=('a1000000-0000-4000-8000-'||lpad($2::text,12,'0'))::uuid and s.component='cv' and g=63 then $3::real[] else v.embedding end
    from app.profile_search_sources s cross join lateral generate_series(0,case when s.component='cv' then octet_length(s.projection_text)/900-1 else 0 end)g
    join vectors v on v.n=abs(hashtextextended(s.source_id::text||':'||g::text,0)%128)
    where s.organization_id=$1 and s.source_type='candidate' and s.status='ready'
      and not exists(select 1 from app.profile_search_chunks c where c.source_id=s.id)`, [org, count, vector(0)]);
  if (previous) await f.admin.query("update app.profile_search_chunks ch set embedding=$1::real[] from app.profile_search_sources s where ch.source_id=s.id and s.source_id=('a1000000-0000-4000-8000-'||lpad($2::text,12,'0'))::uuid and s.component='cv' and ch.ordinal=63", [vector(1), previous]);
  await f.admin.query('drop table scale_cv_seed');
  await f.admin.query('analyze app.profile_search_sources; analyze app.profile_search_chunks; analyze app.candidates; analyze app.candidate_reviewed_cv_text; analyze app.documents; analyze app.file_blobs');
}

test('CV query capacity measures whole authorized corpus under concurrent queries and index publication', {
  timeout: 1800000, skip: process.env.CV_SEARCH_SCALE !== '1',
}, async t => {
  const f = await cvSearchFixture(t);
  const pooledAdmin = f.admin;
  const second = await registerTelegramWorker(f.pool, secondOwner, org, 'Synthetic second query worker');
  const hosts = [f.host, f.makeHost(second.token)]; const actors = [owner, secondOwner];
  const backgroundOwner = identity(SUBJECTS.ADMIN1);
  const background = await registerTelegramWorker(f.pool, backgroundOwner, AUTHZ_ID.ORG_A, 'Synthetic indexing worker');
  const backgroundHost = f.makeHost(background.token);
  await pooledAdmin.query(`insert into app.candidates(id,organization_id,full_name,professional_summary,identity_state,lifecycle)
    select gen_random_uuid(),$1,'Synthetic background '||g,repeat('Background indexing work. ',100),'established','active' from generate_series(1,3000)g`, [AUTHZ_ID.ORG_A]);
  const backgroundRuntime = createSemanticWorker({ host: backgroundHost, vault: f.store('background', background.token),
    plan: async ({ text }) => { const bytes = Buffer.from(text); return { index_version: indexVersion, chunker_version: chunkerVersion, source_sha256: hash(text), byte_length: bytes.length,
      chunks: Array.from({ length: Math.ceil(bytes.length / 400) }, (_, i) => ({ ordinal: i, start_byte: i * 400, end_byte: Math.min((i + 1) * 400, bytes.length), sha256: hash(bytes.subarray(i * 400, (i + 1) * 400)), token_count: 100 })) }; },
    embed: async ({ texts }) => ({ indexVersion, embeddings: texts.map(() => vector(1)) }),
  });
  const counts = (process.env.CV_SEARCH_SCALE_PROFILES ?? '1000,2000,4000,8000').split(',').map(Number);
  const rounds = Number(process.env.CV_SEARCH_SCALE_ROUNDS ?? '3');
  let previous = 0;
  for (const count of counts) {
    const connection = await pooledAdmin.connect();
    try {
      await connection.query('begin');
      await connection.query("select set_config('app.organization_id',$1,true),set_config('app.actor_id',$2,true)", [org, AUTHZ_ID.USER_ADMIN2]);
      await seed({ ...f, admin: connection }, count, previous);
      await connection.query('commit');
    } catch (error) { await connection.query('rollback'); throw error; } finally { connection.release(); }
    previous = count;
    const [{ rows: [{ n: readyChunks }] }, { rows: [{ n: expectedResults }] }] = await Promise.all([
      pooledAdmin.query('select count(*)::integer n from app.profile_search_chunks where organization_id=$1 and embedding is not null', [org]),
      pooledAdmin.query("select count(*)::integer n from app.profile_search_sources where organization_id=$1 and component='profile' and status='ready'", [org]),
    ]);
    const queryTimes = [], pageTimes = [], claimTimes = []; let backgroundTicks = 0, stop = false;
    const indexing = (async () => { while (!stop) { await backgroundRuntime.tick(); backgroundTicks++; await setTimeout(25); } })();
    let exceeded = false;
    try {
      for (let round = 0; round < rounds; round++) {
        const measurements = await Promise.all(actors.map(async (actor, i) => {
          const requested = await f.action({ action: 'search', operationId: randomUUID(), query: 'Synthetic volume query', scope: 'approved', readyOnly: false, includeCv: true }, actor);
          const claimStart = performance.now(); const { job } = await hosts[i]('claim', { capabilities: ['minilm-v1', 'approved-cv-v1'] });
          assert.equal(job.id, requested.queryId); claimTimes.push(performance.now() - claimStart);
          const start = performance.now();
          const completed = await hosts[i]('complete', { jobId: job.id, leaseToken: job.leaseToken, kind: 'query', indexVersion,
            projectionVersion: 'candidate-profile-v1', chunkerVersion, querySha256: job.querySha256, result: { embedding: vector(0) } });
          queryTimes.push(performance.now() - start);
          const pageStart = performance.now(); const first = await f.status({ queryId: requested.queryId }, actor); pageTimes.push(performance.now() - pageStart);
          if (process.env.CV_SEARCH_EXPLAIN === '1' && round === 0 && i === 0) {
            const debug = await pooledAdmin.connect();
            const notice = message => t.diagnostic(message.message);
            debug.on('notice', notice);
            try {
              await debug.query("load 'auto_explain'; set auto_explain.log_min_duration='20ms'; set auto_explain.log_analyze=on; set auto_explain.log_nested_statements=on; set auto_explain.log_timing=off; set auto_explain.log_level=notice");
              const debugPool = { connect: async () => ({ query: debug.query.bind(debug), release() {} }) };
              await profileSearchStatus(debugPool, actor, org, { queryId: requested.queryId });
            } finally { await debug.query('reset auto_explain.log_min_duration'); debug.off('notice', notice); debug.release(); }
          }

          if (completed.errorCode === 'SEARCH_CAPACITY' || first.errorCode === 'SEARCH_CAPACITY') {
            assert.equal(first.status, 'failed'); assert.deepEqual(first.results, []); assert.equal(first.nextAfter, null); return 'capacity';
          }
          assert.equal(completed.status, 'completed', JSON.stringify({ readyChunks, completed }));
          assert.equal(first.results[0].sourceId, `a1000000-0000-4000-8000-${String(count).padStart(12, '0')}`, 'Tail chunk of last candidate must participate in full ranking');
          assert.equal(first.results[0].matchedComponent, 'cv');
          const nextStart = performance.now(); const secondPage = await f.status({ queryId: requested.queryId, after: first.nextAfter }, actor); pageTimes.push(performance.now() - nextStart);
          assert.equal(first.results.length, 25); assert.equal(secondPage.results.length, 25);
          assert.equal(new Set([...first.results, ...secondPage.results].map(row => row.sourceId)).size, 50);
          const { rows: [stored] } = await pooledAdmin.query('select count(*)::integer n,count(distinct public_source_id)::integer candidates from app.profile_search_results where query_id=$1', [requested.queryId]);
          assert.equal(stored.n, expectedResults); assert.equal(stored.n, stored.candidates);
          return 'completed';
        }));
        if (measurements.includes('capacity')) { exceeded = true; break; }
      }
    } finally { stop = true; await indexing; }
    t.diagnostic(JSON.stringify({ syntheticOnly: true, candidateProfiles: count, readyChunks, concurrentQueries: 2,
      backgroundTicks, queryMs: stats(queryTimes), pageMs: stats(pageTimes), claimMs: stats(claimTimes), capacityRejected: exceeded }));
    assert.ok(backgroundTicks > 0);
    if (!exceeded && process.env.CV_SEARCH_ENFORCE_SLO === '1') { assert.ok(percentile(queryTimes, .95) < 5000); assert.ok(percentile(pageTimes, .95) < 500); }
  }
});

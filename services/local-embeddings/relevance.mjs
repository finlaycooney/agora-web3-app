// Run with Node 22 and SEMANTIC_EMBEDDING_TOKEN_FILE pointing to the private
// loopback service credential. This sends synthetic fixture text only.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { relevanceProfiles, relevanceQueries, diagnosticQueries, syntheticProjection } from '../../tests/fixtures/semantic-relevance.js';

const model = 'intfloat/multilingual-e5-small';
assert.equal(Number(process.versions.node.split('.')[0]), 22, 'Use the repository Node 22 runtime');
const indexVersion = `${model}@614241f622f53c4eeff9890bdc4f31cfecc418b3:e5-prefix:l2:384:v1`;
const endpoint = process.env.SEMANTIC_EMBEDDING_URL ?? 'http://127.0.0.1:8817/v1/embeddings';
const url = new URL(endpoint);
assert.equal(url.hostname, '127.0.0.1', 'Relevance tests require a loopback service');
assert.equal(url.protocol, 'http:');
assert.ok(process.env.SEMANTIC_EMBEDDING_TOKEN_FILE, 'Set SEMANTIC_EMBEDDING_TOKEN_FILE; never paste the token');
const token = (await readFile(process.env.SEMANTIC_EMBEDDING_TOKEN_FILE, 'utf8')).trim();

async function embed(input, inputType) {
  const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, input, input_type: inputType }), signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `Local embedding service returned ${response.status}`);
  const result = await response.json();
  assert.equal(result.index_version, indexVersion);
  assert.equal(result.data.length, input.length);
  return result.data.map((row, index) => {
    assert.equal(row.index, index); assert.equal(row.embedding.length, 384);
    assert.ok(row.embedding.every(Number.isFinite));
    assert.ok(Math.abs(row.embedding.reduce((s, v) => s + v * v, 0) - 1) < 0.001);
    return row.embedding;
  });
}

const started = performance.now();
const passages = [];
for (let offset = 0; offset < relevanceProfiles.length; offset += 32) {
  passages.push(...await embed(relevanceProfiles.slice(offset, offset + 32).map(syntheticProjection), 'passage'));
}
const indexMs = performance.now() - started;
function rank(vector) {
  return passages.map((passage, i) => ({ key: relevanceProfiles[i].key, discipline: relevanceProfiles[i].discipline,
    score: passage.reduce((s, v, j) => s + v * vector[j], 0) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
const cases = []; const latencies = [];
for (const query of relevanceQueries) {
  const start = performance.now();
  const [vector] = await embed([query.query], 'query');
  latencies.push(performance.now() - start);
  const ranked = rank(vector); const relevant = new Set(query.relevantKeys);
  const first = ranked.findIndex(row => relevant.has(row.key));
  const gain = ranked.slice(0, 10).reduce((sum, row, i) => sum + (relevant.has(row.key) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(10, relevant.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  cases.push({ id: query.id, language: query.language, recallAt10: ranked.slice(0, 10).filter(row => relevant.has(row.key)).length / relevant.size,
    reciprocalRank: first < 0 ? 0 : 1 / (first + 1), ndcgAt10: gain / ideal, top5: ranked.slice(0, 5).map(row => row.key) });
}
const diagnostics = [];
for (const query of diagnosticQueries) {
  const [vector] = await embed([query.query], 'query'); const ranked = rank(vector);
  diagnostics.push({ id: query.id, expectedDiscipline: query.preferredDiscipline, topDiscipline: ranked[0].discipline,
    top5: ranked.slice(0, 5).map(row => row.key) });
}
const mean = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
const metrics = rows => ({ recallAt10: mean(rows, 'recallAt10'), mrr: mean(rows, 'reciprocalRank'), ndcgAt10: mean(rows, 'ndcgAt10') });
latencies.sort((a, b) => a - b);
const report = { syntheticOnly: true, model: indexVersion, profiles: relevanceProfiles.length, queries: cases.length,
  metrics: metrics(cases), byLanguage: Object.fromEntries(['en', 'es'].map(language => [language, metrics(cases.filter(row => row.language === language))])),
  latencyMs: { indexing: Math.round(indexMs), queryMedian: Math.round(latencies[Math.floor(latencies.length / 2)]), queryP95: Math.round(latencies[Math.ceil(latencies.length * 0.95) - 1]) },
  limitations: 'Synthetic discipline ranking only. Does not prove real-world relevance, constraint satisfaction, ACLs, database latency or long-document chunking.', cases, diagnostics };
if (process.env.SEMANTIC_RELEVANCE_REPORT) await writeFile(process.env.SEMANTIC_RELEVANCE_REPORT, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ...report, cases: undefined }, null, 2));
assert.ok(report.metrics.recallAt10 >= 0.85, 'Synthetic Recall@10 below 0.85');
assert.ok(report.metrics.mrr >= 0.8, 'Synthetic MRR below 0.80');
assert.ok(report.metrics.ndcgAt10 >= 0.8, 'Synthetic nDCG@10 below 0.80');

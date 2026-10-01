# Approved CV semantic search release

This checkpoint searches the retained, exact text of a candidate's approved current CV alongside their profile. It does not index private draft CV text, unreviewed conversations, images, or previously uploaded CVs that have no retained parsed text. Candidate results appear once, using their best authorized passage. The UI distinguishes profile and CV matches and shows incomplete CV coverage.

## Deployment

Apply `20261002210000_cv_search.sql` after the CV-analysis migration. Deploy the hosted application and the updated outbound semantic worker. The worker advertises `approved-cv-v1`; an older E5 worker receives no new jobs after the index migration. The pinned model changes to multilingual MiniLM (384 dimensions). Migration invalidates old search queries and clears old derived vectors and receipts, then requeues profiles and eligible approved CVs. Candidate records and CV files are preserved. Only upgraded workers advertising `minilm-v1` receive jobs; old workers remain idle and are not shown as compatible search workers. Deploy the model service and worker before enabling search. The new interface includes CVs by default only for staff with current document download permission; profile-only mode remains available.

The feature still follows `TELEGRAM_INTAKE_ENABLED`. Keep broad access disabled until a real scoped Mac worker, Telegram account and demo recruiter have passed the live acceptance sequence. No production credentials, Telegram authentication, or public tunnel is created by this change.

CV vectors follow the current candidate/document binding. Replacement, restriction, infection detection, removal and merge invalidate affected search results. Harmless first indexing warns that new results are available without interrupting an existing review. Document permission revocation clears CV-aware results and requires a new query; merely hiding a snippet would leave sensitive scores and ordering visible.

## Validation

Run Node 22. `npm run test:cv-search` covers the restricted database and authenticated browser workflow; the real-model and volume tests in that command skip unless explicitly configured. `npm run test:cv-analysis` also exercises real isolated PDF parsing, ordinary approval and the semantic worker handoff with synthetic vectors. Synthetic vectors verify transport and ranking mechanics, not model relevance.

Run the actual model separately against an already running loopback service:

```sh
SEMANTIC_EMBEDDING_URL=http://127.0.0.1:8819/v1/embeddings \
SEMANTIC_EMBEDDING_TOKEN_FILE=/private/path/to/token \
node --test tests/database/cv-search-relevance.test.js
```

This uses 100 neutral candidate profiles and 40 English/Spanish queries. Relevant facts occur only in English/Spanish CVs, at the beginning, middle or end, including one near 64 KiB. It reports CV-only recall@10, reciprocal rank and tail recall, checks all result pages for duplicates, and compares document-ineligible profile rankings and coverage before and after CV indexing. The data and relevance judgments are synthetic.

```sh
CV_SEARCH_SCALE=1 CV_SEARCH_SCALE_ROUNDS=3 \
node --test tests/database/cv-search-scale.test.js
```

The scale test uses two simultaneous recruiter queries plus ongoing indexing in another organization. Per 100 profiles, 20 have no CV, 40 have 4 CV chunks, 25 have 12, 10 have 32 and 5 have 64. Including profile chunks this gives 12k/24k/48k/96k chunks for 1k/2k/4k/8k profiles. It checks the entire ranked corpus, a highest-scoring passage at the end of the last candidate's CV and distinct candidate pagination. This deliberately heavy-tailed fixture is not a measured customer distribution. Repeat the selected release tier for 20 paired rounds with `CV_SEARCH_ENFORCE_SLO=1`; target query p95 <5s and page p95 <500ms under the 10s query deadline.

The unchanged synthetic corpus exposed poor CV-only E5 recall (61.5%). The pinned MiniLM model with coherent CV passages passed the actual hosted queue, worker, database ranking and pagination path: CV recall@10 97.5%, MRR 0.9508 and tail recall@10 97.5% across 100 CVs and 40 queries. English CV recall was 95.83%; Spanish CV recall was 100%. All source bytes, including the near-64 KiB CV, were indexed; the test checks a winning passage beyond byte 60,000, unique results across all pages, and unchanged profile rankings/scores/excerpts/coverage for a recruiter without document access. The original 100-profile/40-query hosted fixture also passed: recall@10 94%, MRR 0.9667. These are controlled synthetic relevance results, not a promise for arbitrary CVs. See `services/local-embeddings/model-evaluation.md` for the independent comparison and reproducible evaluator.

The release enforces **12,000 authorized ready passages** across profiles and CVs for CV-inclusive search. At this tier the fixture contains 1,000 profiles, including 800 CVs of varied length. Twenty paired rounds produced 40 searches and 80 page requests, while the background worker completed 902 indexing stages: query p50 2,285 ms / p95 3,159 ms / max 3,254 ms; page p50 45 ms / p95 95 ms / max 245 ms; claim p95 24 ms. Both latency targets passed. The 24,000-passage tier was measured but is not supported by this release: its query p95 was 5,391 ms, above the 5-second target (page p95 130 ms). The limit is a passage count, not a candidate or chat count; long CVs consume more passages. An enforced-limit rerun verifies full ranking at the boundary and an explicit empty `SEARCH_CAPACITY` failure above it.

The test host is an Apple M1 Pro with 16 GiB RAM; Docker has 8 CPUs and approximately 7.75 GiB RAM. Hosted resources can differ, so a passing local test is not a production throughput guarantee. Above the supported CV corpus, the application fails explicitly and offers profile-only search, never silently omitting candidates or CV tails. Before substantially larger CV corpora are enabled, measure an indexed vector-search backend with the same authorization and relevance tests; increasing this constant alone is insufficient.

The existing profile-only scale regression also passed with complete ranking at 5,000 / 20,000 / 100,000 synthetic profiles. Single-query database times were 377 / 1,878 / 9,638 ms; first-page times were 73 / 52 / 71 ms. The largest tier is close to the 10-second execution deadline and is not evidence of headroom for simultaneous users. These single-query checks are separate from the smaller concurrent CV-inclusive acceptance above.

## Live acceptance still required

Connect a recruiter account, import a long full history, review incomplete and complete drafts, approve a CV-backed candidate, wait for both profile and CV indexing, and search for a fact present only in the approved CV. Repeat with another permitted staff member and one without document access. Replace/restrict the CV while a search is open and verify stale results disappear. Verify Mac restart/replay and hosted cleanup credentials separately. Raw conversation retention remains governed by the earlier reviewed-source controls.

To disable this release, turn off the feature flag and retain the migration and candidate data. Do not restart an E5 worker against the MiniLM index. A future model rollback needs another explicit namespace change and reindex. Older staff clients that omit `includeCv` remain profile-only when used with the upgraded host and worker.

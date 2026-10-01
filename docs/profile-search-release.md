# Profile semantic search checkpoint

This checkpoint searches approved candidate profiles and the current recruiter's
private drafts. Raw conversations, evidence quotes, unresolved suggestions, CV
contents, and other recruiters' private drafts are outside the search corpus.
Existing name/email lookup stays available as a separate search option.

## Release sequence

Apply the profile-search migration after the Telegram CV migration while
`TELEGRAM_INTAKE_ENABLED` remains disabled. Deploy the hosted application, update
the local embedding service, and start the semantic worker with its scoped
platform credential. Follow `services/semantic-worker/README.md` for private
configuration and startup. Existing Telegram credentials are not needed for
profile indexing or queries; the Telegram connector is still needed for chat
imports and CV retrieval.

The Mac needs outbound access to the hosted worker endpoints. Its embedding
service listens on loopback and accepts a private local credential. It needs no
production database credentials, general storage credentials, or inbound public
port. Do not expose the embedding service through a tunnel.

Existing profiles must finish indexing before a demo that claims complete search
coverage. The interface reports pending and failed profiles separately from
search results. Run the query workflow during indexing as well: interactive
queries must take priority between bounded batches. A stopped Mac must produce a
visible waiting/offline state, never an empty successful search.

## What the results mean

Search ranks similar profile text. It does not turn a natural-language sentence
into exact compensation, location, or exclusion rules. Scope and draft readiness
are explicit filters. Similarity scores are not percentages or eligibility
decisions. Excerpts quote the indexed profile; they are not model-generated
justifications.

The initial pinned-model benchmark used 100 synthetic profiles across 20 nearby
disciplines and 40 English/Spanish queries. It measured Recall@10 of 0.99, MRR of
0.9875 and nDCG@10 of 0.9847. Local query embedding p95 was 18 ms. This is a
controlled regression dataset, not a real-user relevance guarantee. Two of four
negation diagnostics ranked the excluded discipline first. Keep those diagnostics
visible when comparing future models or adding a separately evaluated reranker.

The complete local PostgreSQL 17 search path, including scoped worker
authorization and storing every ranked result, took 757 ms for 5,000 synthetic
profiles, 1.60 seconds for 20,000 and 8.38 seconds for 100,000. Each profile had one
384-dimensional chunk; multi-chunk profiles add scoring work. Subsequent results
pages took about 40 ms. The cold 5,000-profile page took 279 ms while a production
build was also running. These are local measurements, not hosted-network or
production concurrency guarantees. The 100,000-profile case has limited headroom
under the 10-second scoring deadline; load-test deployment hardware and evaluate
a derived approximate-nearest-neighbor index before larger workloads. There is
no hidden corpus truncation: all 100,001 fixture profiles were ranked, and a
query that exceeds its execution deadline fails explicitly.

The real pinned model also passed through the actual scoped worker, chunk-plan,
database indexing and search operations with 100 synthetic profiles and 40
queries: Recall@10 was 0.995 and MRR was 0.9708. Separately, a 65KiB Unicode/CJK
profile produced 40 complete chunks. Query embedding during passage backfill
took 371 ms in the local priority-service acceptance test. These checks do not
replace live-account acceptance or recruiting relevance review.

## Acceptance and operational limits

Run unit, database, worker and authenticated browser checks before release. The
runtime test uses the actual scoped host functions and encrypted Mac receipt
store, including a lost acknowledgement and restart. It checks long-profile tail
coverage, Unicode boundaries, source revisions, private-owner isolation, shared
approved results and live readiness filters. The optional local-model test sends
only synthetic records through the same indexing and query path.

For the standalone relevance test, set `SEMANTIC_EMBEDDING_TOKEN_FILE` to a private
file path and run `node services/local-embeddings/relevance.mjs` under Node 22.
`SEMANTIC_RELEVANCE_REPORT` optionally names a local report file. Do not put the
credential itself on the command line. The test targets loopback only and prints
synthetic metrics, not credentials or production records.

Query text, vectors and result caches expire after 15 minutes. Authenticated
activity removes expired material; broad rollout also needs a scheduled purge
that continues while the Mac is offline. This checkpoint does not complete raw
Telegram source retention cleanup or live Telegram/provider acceptance. Keep
broad rollout disabled until those remaining checks are complete. Attaching a CV
does not yet parse its contents into searchable profile fields.

For the optional full-path relevance check, point `SEMANTIC_EMBEDDING_URL` and
`SEMANTIC_EMBEDDING_TOKEN_FILE` at the updated loopback service and run
`node --test tests/database/profile-search-runtime.test.js`. For the separately
opted-in disposable-database volume test, run
`SEMANTIC_SCALE=1 node --test --test-name-pattern='exact authorized search' tests/database/profile-search-runtime.test.js`.
Both require the existing nonproduction Docker test safeguards. Keep the large
benchmark separate from normal CI; ordinary CI covers protocol, privacy,
pagination and browser behavior without downloading model weights.

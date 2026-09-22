# Decisions and implementation readiness

Status: PR 1 review artifact. The accepted architecture stays in [ADR-001](agora-adr-001.md); the proposed [schema](schema-specification.md) and [contracts](transaction-contracts.md) supply the next level of detail. Suggested values below are not production approvals.

## Questions and who decides

| ID / gate | Question | Proposed approach / safe development behavior | Owner |
| --- | --- | --- | --- |
| D01 — resolved locally | Where are the four local validation edits mentioned in the plan? | Located and preserved in the local `fix/candidate-applications` checkout on 2026-09-22. The owner requested inclusion of the form/URL-validation improvement and its unit/browser tests with the applied patch. | Owner of local checkout |
| D02 — now | Does the current public site receive genuine applications, and which deployment/project is live? | Do not infer from merged PR #1. If real intake is active, review existing privacy and dependency findings immediately. | Product/release owner |
| D03 — approved 2026-09-22 | Approve schema/transaction contracts, including PostgreSQL 17, column nullability, file-state predicate, lock order and supporting privacy/quota tables? | Approved by the owner on 2026-09-22 for the additive local foundation batch only: role provisioning, the foundation tables and the versioned seed. Ordinary runtime writes remain procedure-only. Real job/client mappings (D10), the document/privacy/intake batches and every production change stay deferred; `candidates.current_document_id` and `applications.notice_id` are omitted entirely until their FK target tables exist. | Technical maintainer |
| D04 — before real staff access | Which stable provider subjects may bootstrap Admin, and how will staff MFA be enforceably verified? | No email-based staff promotion; Viewer inactive. Synthetic local staff only until auth choice tested. | Product + auth operator |
| D05 — before Viewer activation | May Viewer see permitted extracted CV text even without original-file downloads? | Inactive role until explicit approval and permission tests. | Product owner |
| D06 — before real intake | Which jurisdictions, application purpose/legal basis, notice text/version, retention/review criteria and rights-verification process apply? | No production purpose seed. Synthetic policy fixtures only; authenticated manual operator interface before real use. | Product owner with privacy advice |
| D07 — before talent-pool reuse/imports | Which additional purposes and permitted third-party processing apply? | Application collection does not authorize indefinite sourcing/search or external AI. Keep those uses disabled. | Product owner |
| D08 — before intake API implementation | Approve 24-hour token validity, explicit 410 expiry, filename-inclusive digest, overlap key rotation and orphan grace? | Concrete proposed contract; maintenance/recovery process needed for expired receipts. | Technical maintainer |
| D09 — before downloads/processing | Which maintained scanner, execution sandbox, worker host/scheduler and operator? Is proposed 24-hour scan validity appropriate? | Keep parse off, fail closed for unscanned/stale files; synthetic fixtures do not establish safety. | Infrastructure/security operator |
| D10 — before job backfill | Which internal client owns each current job, and which public content/client names are approved? | No client inferred from slug. Existing descriptions/slugs need editorial review; one currently mentions Gondor. Preserve URLs unless an explicit confidentiality decision requires change. | Product/recruiting owner |
| D11 — before production cutover | Accept a short intake pause, 24-hour RPO, 8-hour RTO and seven-day compatible rollback window? | Proposals only; change-capture work required if pause is unacceptable. | Product + release/recovery operators |
| D12 — before production cutover | Backup destination/retention, independently recoverable privacy ledger, named recovery operator and monthly budget? | No provider purchase now; demonstrate complete file coverage/restore before promises. | Product + recovery operator |
| D13 — before public/background activation | Approve quotas, source-address abuse retention, queue alerts, incident owner and bounded retry procedure? | Proposed numerical settings in contracts; keep feature off without enforced limits. | Release operator |
| D14 — before deploying current dependency versions | How should baseline dependency remediation be scheduled alongside the architecture work? | Separate focused dependency PR and applicability review; do not hide audit findings behind successful tests or run `audit fix --force`. | Technical maintainer |

Product decisions do not need to block synthetic local development. D03 is a review gate for dependent schema work; D01 is resolved for this local checkout; preserve the included validation edits in subsequent work. Production gates must have named people and recorded evidence before activation. No unapproved numeric default is a service guarantee.

## Baseline evidence

Captured 2026-09-21 against fresh remote `main` at `1537971083cfed8ff83489a976b9c5f2608b33ae`, before test-harness changes. Node 22.23.2, existing package lock, local Supabase PostgreSQL 17.6.1. No remote migration, production access or production-data testing.

| Check | Observed result |
| --- | --- |
| `npm ci` | Successful; existing dependency advisories reported |
| `npm run lint` | Exit 0; 54 existing warnings, 0 errors |
| `npm run typecheck` | Passed |
| `npm test` | 8 passed |
| `npm run build` | Passed; Next.js 16.1.6 |
| `npm run test:e2e` | 8 passed, 4 real-backend cases explicitly skipped; desktop/mobile browser projects |
| `npm run local:start` | Fresh disposable local stack initialized using existing migration/seed |
| `npm run test:e2e:backend` | 4 passed against verified `http://127.0.0.1:54321`; current privileged legacy implementation |
| GitHub PR #1 | Merged; reported checks passed. This does not identify the live deployment. |
| Real OAuth, manually operated UI, production transport/configuration | Not verified; automated tests stub the session |
| New architecture acceptance tests | Not yet implemented; checklist below |

The baseline backend test used a header-only PDF and privileged legacy credentials. It proves the present route's row write and referenced upload path, not future scanner safety, full byte recovery, or scoped-role authorization. This PR replaces its fixture with valid synthetic PDF and DOCX and adds byte comparison. Authorization and crash recovery remain future tests.

Baseline `npm audit --json` reports **13 affected packages: 2 critical, 6 high, 5 moderate**. Direct packages include Next.js and NextAuth (critical classification), PostCSS/sharp (high) and Resend (moderate). This is dependency advisory evidence, not a demonstrated exploit in Agora; some advisories require configurations absent from this application. Examples: [Next.js image-processing advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [NextAuth email-normalization advisory](https://github.com/advisories/GHSA-7rqj-j65f-68wh), [NextAuth malformed-header advisory](https://github.com/advisories/GHSA-xmf8-cvqr-rfgj). Version/applicability review and maintained patched versions belong in a focused follow-up before exposing new staff capabilities.

## Test harness changes in this PR

- Playwright configuration checks every configured Supabase target before starting/reusing a web server, even for filtered test runs. Backend mode requires an explicitly allowed local API origin and local Supabase service-role JWT.
- Existing-server reuse is disabled so a local process started with different credentials cannot receive backend test traffic.
- Missing database settings are explicitly forwarded as empty strings so the spawned Next.js server cannot silently fill them from a different environment file.
- The shared guard is usable by future migration/reset/cleanup test entry points. It does not authorize remote preview or production testing; extending the allowlist requires reviewed project-identity checks.
- Synthetic fixtures contain a real PDF catalog/page/content/xref/trailer and a minimal OOXML DOCX package with relationships and readable synthetic text. MIME sniffing still does not establish malware safety.
- New unit tests cover invalid targets, credentials, mode handling and fixture structure. Backend tests check PDF/DOCX persistence, private bytes and cleanup.

Final changed-branch results are recorded on the PR. No future acceptance item below is marked passed merely because the baseline suite is green.

Historical changed-branch evidence from the original cloud patch, not a verification of this combined local checkout: 19 unit tests and all 14 desktop/mobile Playwright cases passed with real local Supabase enabled; lint passed with the same 54 warnings; production build and typecheck passed. A guarded local reset was run only after confirming the disposable stack had zero applicant rows and zero CV objects. This is clean-install evidence for the existing migration, not a new-schema upgrade test. An earlier concurrent typecheck/dev-server start failed on disappearing generated Next.js type files; rerunning build then typecheck after the browser server stopped passed. Keep those commands sequential.

## Foundation migration batch

D03 was approved by the owner on 2026-09-22 for the additive local foundation batch only. The batch adds `supabase/migrations/20260922090000_foundation_roles.sql`, `20260922090100_foundation_schema.sql` and `20260922090200_foundation_seed.sql`.

- The roles migration provisions six NOLOGIN PostgreSQL roles (`app_owner`, `app_staff`, `app_intake`, `app_worker`, `app_executor`, `app_authz_reader`), fails closed on unexpected pre-existing attributes, on any membership held by a foundation role in another role, and on unexpected grantees of `app_owner`/`app_executor`/`app_authz_reader` other than the migration operator. It grants `app_owner` only to the migration operator when needed, and grants `app_owner` CREATE on the current database so it can own the `app` schema. The no-membership constraint is foundation-only; later reviewed credential provisioning may grant deliberate memberships under its own batch.
- The schema migration creates the 16 reviewed foundation tables owned by `app_owner`, with composite same-tenant foreign keys, the specified uniqueness/check constraints and indexes, and enabled + forced RLS on every table. `candidates.current_document_id` and `applications.notice_id` are omitted entirely until the document and privacy batches provide their FK targets (schema specification section 10). No procedures, policies, runtime grants or provider objects exist yet; these deny-all checks are not completed staff authorization. The global `ALTER DEFAULT PRIVILEGES` revoke for functions prevents future objects from inheriting PUBLIC EXECUTE.
- The seed is a versioned bootstrap: the Agora organization, the 21-key permission catalog transcribed from the transaction-contracts matrix, Admin/Recruiter/Viewer roles with the approved initial grants (Viewer seeded inactive) and the default six-stage pipeline. `INSERT ... ON CONFLICT DO NOTHING` protects the catalog and organization; grants and stages are inserted only for roles/pipelines created by that statement, so reruns cannot restore removed grants, recreate deleted stages or overwrite edited names/statuses. Identity collisions on the seeded organization, role key→UUID/`system_kind` bindings and the default pipeline key fail instead of remapping.
- Bootstrap grants carry a null `granted_by_user_id`: the seed runs as the migration/bootstrap principal, which must be able to bypass forced RLS before any policy exists (superusers always can; a non-superuser operator needs BYPASSRLS plus `app_owner` membership granted `WITH INHERIT TRUE, SET TRUE`). Null grant actors are limited to audited migration/bootstrap writes and confer no runtime authority; later grant changes go through the reviewed procedure with a real actor.
- The harness (`tests/database/foundation.test.js`, `tests/support/foundation-docker.js`) guards the environment before mutation: external database/Supabase environment variables and remote Docker endpoints are rejected, all operations verify run- or project-label ownership, Supabase resources are captured by the CLI's `com.supabase.cli.project` label before use, and cleanup removes only captured run-owned identities (volumes by name+`CreatedAt`+label, networks by Id+label, containers by Id+label). `tests/unit/foundation-guard.test.js` covers the pure guards without Docker.
- Catalog assertions inspect effective ACL entries (`aclexplode` over `nspacl`, `relacl`/`acldefault`), not just null-`relacl` heuristics, and include a transactional function probe asserting PUBLIC and runtime roles cannot EXECUTE new `app` functions by default.
- Verification commands: `npm run test:db:foundation` (fresh PostgreSQL 17 and 16 containers) and `FOUNDATION_TEST_MODE=supabase npm run test:db:foundation` (isolated Supabase CLI workdir, legacy upgrade without reset, then the existing backend Playwright suite against the isolated stack only). The first PostgreSQL 17 container carries a synthetic `public.applicants` lock target to prove migrations do not touch the legacy table; a second, truly clean instance proves identical ordered migrations produce an identical schema shape.
- Evidence status 2026-09-22, `npm run test:db:foundation` on local Docker: **22/22 subtests passed** on `postgres:17.6`/`postgres:16.10` disposable containers — full PG17 lifecycle (all 15 subtests incl. migrations under a held `ACCESS EXCLUSIVE` legacy lock, seed matrix/rerun preservation, ~50 SQLSTATE negatives, deny-all role checks, forced-RLS/ownership/ACL catalog assertions, function EXECUTE probe, lock_timeout rollback), PG16 rejection before any change, pre-existing membership and dangerous-attribute rollbacks, non-superuser operator provisioning via `WITH INHERIT TRUE, SET TRUE`, and all seed identity collisions. Measured migration timings: roles 84 ms, schema 116 ms, seed 92 ms — local container figures only, not production guarantees.
- `FOUNDATION_TEST_MODE=supabase` evidence status 2026-09-22: **6/6 subtests passed** (1 postgres-mode skip) on a temporary isolated Supabase CLI project with unique `project_id`, verified `com.supabase.cli.project` labels, no reset of pre-existing resources. Covered: `supabase migration up` applied the foundation batch over a running legacy stack in 671 ms; synthetic `public.applicants` rows and `cv-submissions` bucket config survived the upgrade exactly and the legacy table stayed writable; `app` is absent from API schemas; provider/runtime roles (incl. `anon`/`authenticated`/`service_role`) are denied; forced-RLS/ownership/no-provider-grant catalog assertions hold on the real provider stack; seed rerun preserved edits; and the existing backend Playwright suite passed against the isolated stack's synthetic keys (14.7 s, Chromium, dev server on port 3000). Cleanup removed only captured label-verified resources; no leftovers remained. The user's existing `agora-web3-app` stack was temporarily stopped with approval (it otherwise occupies required port 54321) and restarted afterward — all 11 containers healthy, local API live. Local isolated-stack figures only, not production guarantees.
- Harness defects found and fixed during the first container run: `pg_isready` could pass against the postgres image's temporary init server (readiness now requires the final "ready to accept connections" marker), and bind-based port checks miss Docker Desktop's IPv6 wildcard proxy listeners (occupancy now probed by TCP connect on both `127.0.0.1` and `::1`). The `com.supabase.cli.project` label was confirmed present on containers during the real run and is required for every identity check.
- Remaining gates for this batch: D04 staff bootstrap subjects/MFA, D05 Viewer activation, D10 job/client mappings, document/privacy/intake DDL approval, plus hosted-Supabase verification that the migration runner can grant database CREATE to `app_owner` and bypass forced RLS for the seed.

## Invariant-to-test checklist

`P1` is this PR's harness; P2–P5 follow the supplied plan, “later” is explicitly gated. Each row requires executable assertions and recorded output in its implementing PR.

| ID | Invariant / essential negative or race case | Layer / delivery |
| --- | --- | --- |
| T01 | Unsafe/missing/malformed API target, credentials, reused server and filtered honeypot test cannot bypass target guard | Unit + config startup / P1 |
| T02 | Structurally valid synthetic PDF/DOCX accepted; object bytes round-trip and private unauthenticated access denied | Unit + local backend / P1 |
| T03 | Empty PostgreSQL 17 installation; unsupported version rejected; no Supabase schemas required for business SQL | Disposable ordinary PostgreSQL / P2 |
| T04 | Upgrade seeded legacy Supabase without reset; migrations and seeds rerun without overwriting reviewed grants/jobs | Actual database / P2 |
| T05 | Cross-org role/client/pipeline/candidate/document/application references rejected; same user has different org roles | Constraint + runtime / P2–P3 |
| T06 | Missing/malformed actor context, inactive user/role/membership, unknown key and pooled connection reuse deny access | Raw SQL + route / P3 |
| T07 | Candidate OAuth cannot enroll staff; stable provider subject mapping; linking requires recovery proof; MFA gate enforced | Auth integration / P3 |
| T08 | Raw staff DML denied for grants/stages/merges/lifecycle/intake; supported procedures emit audit/history | Actual runtime roles / P3 |
| T09 | Concurrent membership revocation/role deactivation/user disable cannot remove last Admin; protected grants cannot move to another role | Concurrent DB clients / P3 |
| T10 | Existing session observes grant removal/revocation; Viewer cannot download/export/write; custom seeded role follows data grants | Route + database / P3 |
| T11 | Stage change updates history atomically; wrong pipeline/stage denied; concurrent version conflict; mapped migration/reopen audited | DB + route / P3/later workflow |
| T12 | Same candidate clean file reuse; different candidate same hash remains separate; historical attachment survives current-CV change | Integration / P4 |
| T13 | Public guessed email/hash never updates established profile/current CV or exposes receipt lookup data | Route + database / P4 |
| T14 | Concurrent same-key requests create one result; changed facts/file/filename conflict; digest version stable | Unit + concurrency / P4 |
| T15 | Committed replay after job closure works; uncommitted finalization loses race to closure; expired/purged/revoked key cannot create application | HTTP + concurrency / P4 |
| T16 | Upload succeeds/state write crashes; commit succeeds/response lost; retry never deletes live bytes or double-finalizes | Fault injection / P4 |
| T17 | Quota reservations hold during orphan/retry; rate cap atomic; corrupted existing object rejected; active lease never swept | Concurrent storage/DB / P4 |
| T18 | Unscanned/infected/failed/stale scans deny download; scanner credentials/network/mounts restricted; resource limits enforced | Sandbox + download / P4 |
| T19 | Expired/stolen lease or source/lifecycle change cannot publish verdict; deletion/restriction wins publication race | Concurrent workers/privacy / P4 |
| T20 | Signed URL only for authorized logical document, no arbitrary key; short expiry; issuance differs from download evidence | Route + actual Storage / P4 |
| T21 | Verified restriction stops ordinary search/download and pending work; erasure covers snapshots, legacy copies and derived artifacts | Operator + integration / P3–P5 |
| T22 | Public DTO/HTML/serialized/SEO/sitemap contain no confidential sentinels; unpublished direct URLs denied; edits invalidate publication/cache | HTTP + browser / P5 |
| T23 | Backfill twice yields same mappings/counts; source edits detected; missing files/unknown jobs/conflicting refs explicit; no invented client/notice | DB + byte inventory / P5 |
| T24 | Checkpoint covers database references during upload/deletion; missing byte invalidates it; verified restored bytes remain private | Recovery fault tests / P5 |
| T25 | Later privacy ledger reapplied before restored access; uncertain ledger coverage keeps access disabled | Restore rehearsal / P5 |
| T26 | Compatible old web/worker handles new writes/jobs/token versions; unsupported payload is not consumed; no destructive rollback | Preview rehearsal / P5 |
| T27 | Merge same-hash live blobs avoids immediate uniqueness collision; attachments preserved; merge-versus-upload/restriction races safe | Concurrent database / later merge |
| T28 | Rejected duplicate pairs persist; new evidence explicitly reopens; no hash-based automatic person merge | Unit + API / later merge |
| T29 | Search only authorized current sources; stale projections cannot bypass purpose/restriction; Viewer text policy approved | Query + route / later search |
| T30 | Parser archives/pages/output/CPU/memory bounded, no network; stale derivation cannot resurrect erased text | Sandbox + concurrency / later parsing |

## Review and delivery sequence

1. Review this PR's schema, contracts, decisions and harness. Record amendments in version control.
2. After approval, implement portable additive foundation migrations and PostgreSQL/Supabase tests in the next PR. Do not change legacy intake.
3. Add staff authorization and controlled privacy operations, then gated intake/documents/jobs, then public jobs/backfill/recovery in their separate PRs.
4. Obtain explicit release approval and all operational evidence before any production migration or activation.

The first review does not require selecting a paid provider or supplying production credentials. The production decision register prevents those choices being silently assumed later.

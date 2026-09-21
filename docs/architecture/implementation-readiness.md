# Decisions and implementation readiness

Status: PR 1 review artifact. The accepted architecture stays in [ADR-001](agora-adr-001.md); the proposed [schema](schema-specification.md) and [contracts](transaction-contracts.md) supply the next level of detail. Suggested values below are not production approvals.

## Questions and who decides

| ID / gate | Question | Proposed approach / safe development behavior | Owner |
| --- | --- | --- | --- |
| D01 — resolved locally | Where are the four local validation edits mentioned in the plan? | Located and preserved in the local `fix/candidate-applications` checkout on 2026-09-22. The owner requested inclusion of the form/URL-validation improvement and its unit/browser tests with the applied patch. | Owner of local checkout |
| D02 — now | Does the current public site receive genuine applications, and which deployment/project is live? | Do not infer from merged PR #1. If real intake is active, review existing privacy and dependency findings immediately. | Product/release owner |
| D03 — before dependent DDL | Approve schema/transaction contracts, including PostgreSQL 17, column nullability, file-state predicate, lock order and supporting privacy/quota tables? | Review this PR before foundation migrations. Ordinary runtime writes are procedures only. | Technical maintainer |
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

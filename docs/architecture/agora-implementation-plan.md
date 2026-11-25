# Agora: safe implementation and release plan

Date: 2026-09-21

Architecture: [ADR-001, revision 3](agora-adr-001.md)

Status: implementation plan, not evidence of completed work. No production migration is authorized merely by this document. Gates marked required must pass before enabling the relevant capability.

## 1. Intended outcome

Keep today's application flow working while introducing a portable, agency-isolated recruitment data model. Deliver small PRs with explicit acceptance tests. Start with one agency, ordinary PostgreSQL, private Storage and bounded background jobs. Defer advanced interfaces, parsing/search enhancements and integrations until their foundations are tested.

Do not promise perfect reliability, guaranteed free hosting or zero interruption. The default migration permits a brief, explicitly approved application-intake pause while the public website remains available. If uninterrupted intake is a requirement, design and test transactional change capture before cutover instead of assuming a deployment switch handles database writes.

## 2. Current evidence and first safeguards

Read-only inspection on 2026-09-21 found the local Agora checkout on `fix/candidate-applications`, with four uncommitted form/URL-validation files. Preserve that work. The owner reports PR #1 merged; local refs are not sufficient to establish current remote `main` or the live Vercel release.

The inspected CI checks lint, types, unit tests, production build and browser tests. A separate real Supabase backend browser test exists, but CI does not currently enable it. Browser success with a mocked submission response is not persistence evidence. Production configuration, data and backups were not inspected for this plan.

Before architecture code changes:

1. Preserve and review the existing four modified files in a separate commit/branch or PR. Do not reset, discard or automatically stash them away without a clear recovery path.
2. Fetch and inspect remote `main`, confirm the merged feature work is present, and branch from that verified base. Do not force-push or replace `main` to make the history look cleaner.
3. Commit the ADR and this plan to repository documentation. Suggested destinations: `docs/architecture/agora-adr-001.md` and `docs/architecture/agora-implementation-plan.md`; preserve their relative links.
4. Record baseline test results and existing failures. Confirm job listings, manual PDF/DOCX application, validation, success/error handling, optional GitHub prefill and mobile behavior before changing their data path.
5. If production already receives genuine applications, review its privacy notice, purposes, retention and rights-handling process immediately. Do not wait for the redesign.

## 3. Environment boundaries

| Environment | Data and credentials | Permitted activity |
| --- | --- | --- |
| Local development | Local Supabase, synthetic candidates/CVs, development auth, local or disabled email | Schema design, resets, failure injection and manual development |
| CI | Disposable PostgreSQL/Supabase, synthetic fixtures, scoped runtime users | Fresh-install/upgrade, integration, browser, permission and recovery tests |
| Preview | Dedicated nonproduction project/data, separate secrets and auth callbacks, captured or disabled email | Vercel transport/runtime/configuration checks and migration rehearsal |
| Production | Production-only credentials and genuine data, protected release operator | Approved migrations, controlled canaries and normal operation |

Never point preview at production just because it is easier. One shared preview database can be sufficient initially, but serialize incompatible migrations and pin each rehearsal to its schema/release version. Parallel PR deployments are not automatically isolated from each other when they share a database.

Before every destructive test, reset or cleanup, verify the target project/host against an explicit nonproduction allowlist. Put this guard in shared test setup so every backend test gets it, not only one test case. Do not run tests with production secrets or migrate a linked remote project by accident. Administrative test credentials may prepare fixtures and inspect results; operations under test must use actual restricted runtime roles.

Keep secrets out of Git and logs. Provide environment-variable names and purposes in an example file, not real values. Separate migration ownership, staff database access, intake, worker and Storage authority as required by the ADR. Production credentials belong only to the release/runtime systems that need them; a contributor can implement and verify locally without possessing them.

## 4. PR sequence and acceptance gates

### PR 1: specification and baseline

Deliver a column-level schema specification and relationship diagram, with one table per entity. For each table state ownership, required/nullable fields, foreign keys, uniqueness, indexes, lifecycle and deletion behavior. Explain migration mappings from existing `applicants` and source-defined jobs.

Include these contracts before implementing dependent migrations:

- Operation-to-permission matrix, connection-role grants, RLS context and restricted procedure/transaction entry points.
- Application/job/stage, candidate/document/blob and agency-ownership invariants; mutations ordinary SQL privileges must not bypass.
- Public job allowlist, confidential free-text review and cache invalidation behavior.
- File lifecycle/scan/location matrix, unique-live predicates, scan freshness, replacement rules and merge order.
- Retry token format and validity, canonical payload digest, signing-key rotation, committed replay, expiry responses and tombstone/in-flight retention.
- Worker lease/source/lifecycle generations, atomic publication and stale-result handling.
- Privacy purpose/notice records, authenticated operator procedures and restore-time restriction/deletion handling.
- Backup checkpoint coverage, compatible release matrix and bounded operational limits.

Baseline local and CI tests must be recorded. Add a globally enforced nonproduction target guard for backend tests. Define synthetic PDF/DOCX fixtures that are structurally valid; a fake PDF header is not an adequate scanner/parser fixture.

Exit gate: reviewed schema/API contracts, invariant-to-test checklist and known baseline failures. No production migration.

### PR 2: additive database foundation

Create reviewed migrations for organizations, staff identities/memberships, roles/grants, clients/jobs/pipelines, candidates/applications and their required relations. Add document, intake and privacy structures in dependent batches when their transaction contracts are ready. Do not expose unfinished tables through a public API.

Keep portable business SQL distinct from Supabase-specific setup. Preserve previously applied migration files. Seed Agora, default roles/permissions and stable job mappings without overwriting administrator choices on rerun. Use two-agency fixtures, including one user with different roles across agencies. Keep the legacy submission route and table active.

CI must prove an empty ordinary PostgreSQL install, local Supabase upgrade from the previous schema, reproducible migrations/seeds, foreign-key/unique checks and cross-agency reference rejection. Inspect migration locks and execution time; set appropriate timeouts and explicit failure behavior. Adding tables is not automatically risk-free.

Exit gate: both installation paths pass, no legacy flow regression, no application behavior switched.

### PR 3: staff authorization and privacy operations

Resolve verified provider subjects to internal users and active organization memberships. Implement per-operation permission checks, transaction-local database context and controlled mutation procedures. Keep candidate OAuth separate from staff membership. Enforce the selected MFA policy before real staff access.

Provide authenticated, audited operator procedures for access/correction/restriction/deletion handling, including documents and existing legacy copies. A polished privacy dashboard is not required. Deny ordinary access immediately at subsequent checks and invalidate related pending work. Test administrative recovery and last-admin safeguards.

Exit gate: API and raw-database tests prove organization isolation, no privilege escalation, no stage-history/grant-management bypass, revocation during an existing session, pooled-connection isolation and working rights procedures. Viewer is not activated until its extracted-text policy is explicitly confirmed.

### PR 4: durable intake, documents and bounded jobs

Implement the new path behind a server-side switch that remains off for public production traffic. Reserve durable requests and upload locations, validate actual file bytes, finalize the database records and queued work in one transaction, and reconcile interrupted operations. Preserve submitted snapshots and document versions. Public submissions create provisional candidates instead of merging by email or hash.

Implement scan quarantine and a verifiably restricted scanner execution boundary. Keep parsing disabled initially unless its sandbox and limits are ready. Add leases, bounded retries, operational quotas, observable failures and cleanup safeguards. Publish results only after atomic lifecycle/source/lease validation. Success means persisted application and file, not completed scan/email.

Exit gate: concurrent/repeated requests produce one outcome; timeout after commit returns the original receipt; a committed retry works after job closure; an uncommitted request cannot bypass closure; expired/purged capabilities never create another application; changed payloads conflict. Upload/finalization crashes, unavailable Storage, database errors and scanner outages must not generate false success, premature deletion or unsafe downloads.

### PR 5: public database jobs, migration and recovery rehearsal

Introduce database-backed public jobs through the allowlisted projection. Preserve URLs and application job identity. Test confidential clients in visible HTML, API/server payloads and SEO metadata, including publication changes and cache behavior.

Build an idempotent backfill using stable legacy-row mappings and fingerprints. Preserve original timestamps, references, submitted fields and CV locations. Report missing CVs, unknown job IDs, conflicting references and invalid records; do not invent mappings or silently discard them. Re-run the backfill and prove it creates no extra records. Retain explicitly authorized test-data cleanup as a separate action.

Create a complete database-and-files recovery checkpoint and restore it into an isolated environment. Apply later privacy decisions before exposing restored records. Verify file checksums and authorized downloads. Rehearse a rollback-compatible web/worker release after new-schema writes and queued work exist.

Exit gate: row/attachment reconciliation, repeatable backfill, full restore and rollback rehearsal pass on preview. Production privacy, scanner, MFA, recovery, operator and budget gates are resolved. The release commit and exact migration sequence are recorded.

### Release: gated production cutover

Follow section 7. Do not make a destructive cleanup part of the activation release. Keep feature switches server-enforced and old/new writes explicitly directed; do not leave two independent writers active without a consistency design.

### Later PRs: workflows and optional features

Deliver notes/tasks/tags, richer privacy UI, candidate duplicate review/merge and full-text search in separate PRs. Candidate merging must atomically consolidate duplicate live blobs and pass merge-versus-upload/restriction tests before activation. Parsing/search needs restricted execution, lifecycle-safe publication and authorized snippets.

Custom-role editing, Telegram imports, client sharing and semantic retrieval follow their own permission/privacy/retry specifications. Do not add extra infrastructure purely to prepare for these possibilities.

## 5. Required test matrix

| Test layer | Minimum evidence |
| --- | --- |
| Unit | Shared validation, normalization, digest/version rules, lifecycle transitions and permission mapping |
| Database constraints and grants | Cross-agency FK rejection, application/stage and document ownership, raw mutation bypass denied, last-admin concurrency |
| Actual integration | HTTP request writes real database rows and private bytes; failures leave recoverable state; normal operations use restricted roles |
| Browser | PDF/DOCX, invalid fields/files, retained form state after error, accurate success, repeated clicks, mobile layout and optional OAuth |
| Fault/concurrency | Crash before/after upload, uncertain commit, job closes during submission/retry, merge plus upload, worker plus restriction/deletion, expired lease |
| Public disclosure | Confidential data absent from rendered/serialized/SEO responses; unpublished jobs and stale caches handled |
| File safety | Type/size/format limits, quarantine, scanner failure, execution restrictions, stale verdict rejected, bounded output |
| Upgrade and portability | Empty portable PostgreSQL install, existing Supabase upgrade, repeatable seeds/backfill and supported version/extension checks |
| Recovery and rollback | Complete file coverage at database checkpoint, later privacy decisions applied, new writes and queued jobs survive compatible rollback |

A green UI test is not proof of persistence. A superuser SQL test is not proof of authorization. A database dump is not proof of CV recovery. A previous web deployment is not proof of rollback compatibility.

## 6. Local verification

The current repository already provides the following scripts. They are available starting points, not claims that the future acceptance suite exists or has passed:

```bash
npm ci
npm run local:start
npm run local:status
```

Set local-only configuration using the repository example and the local service values. Run database migrations through the reviewed local workflow. `npm run local:reset` is destructive to local data; use it only on a verified disposable local stack, never as an upgrade test or production migration procedure. Test upgrades on a separate seeded instance without resetting it.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:e2e:backend
```

The real-backend command needs the running local stack and correctly loaded local environment. Add the shared target guard before broadening that suite. As scanning/parsing is introduced, replace placeholder file fixtures with valid synthetic documents. Extend CI with actual backend, restricted-role, migration and fault tests rather than treating these existing commands as complete coverage.

For manual checks, start the app with `npm run dev`, open its reported local URL, submit a synthetic candidate, and verify the linked application, candidate, document/blob rows and actual object bytes. Verify current errors preserve the form and no success appears before durable finalization. Also test the production build locally; local success alone does not prove Vercel-specific request limits, callbacks, secrets or worker scheduling.

## 7. Production release runbook

All steps need a named operator and recorded evidence. A maintainer with the necessary Vercel/Supabase access can execute this; developers do not all need production credentials.

1. Verify the GitHub `main` commit, Vercel production branch/deployment, target Supabase project, migration history, bucket privacy and current row/object counts. Recheck whether any genuine applicants exist. Do not rely on old screenshots or branch names.
2. Confirm required PR checks and the deployment promotion process. A merge may trigger Vercel production deployment; do not assume GitHub Actions controls it. Keep the new path off until migrations and gates are satisfied. Database migrations must not run implicitly during build/startup.
3. Rehearse the exact migrations and release in an isolated preview with production-shaped synthetic data. Test production runtime/request limits, auth redirects, private storage and scheduled worker execution. Never send test emails to real candidates.
4. Confirm application notice/purpose/retention, working rights operations, staff MFA, scanner isolation, operator ownership, quotas/alerts, complete recovery checkpoint and tested compatibility release. Record the approved intake-pause and rollback-window policy.
5. Take and verify a complete recovery checkpoint. Apply reviewed additive schema/provider changes with bounded lock times. Keep the old submission path working and validate it. Perform initial backfill while tracking source changes; do not treat this first pass as final reconciliation.
6. Announce and enable the agreed server-side intake pause, leaving browsing available. Stop both old and new public writes, drain in-flight requests and relevant writers, apply the final delta, and reconcile source IDs, row/attachment counts, field values and checksums. Disable stale worker versions as required by the compatibility plan.
7. Deploy the recorded release and compatible workers. While general intake remains paused, run operator-controlled synthetic canaries through the full new path, including receipt retry, clean-file scan and authorized download. Do not create a public bypass of the pause. Confirm privacy restrictions and confidential-job output.
8. Activate new intake and monitor errors, application-to-file consistency, queue age, scan failures and quota use. Resume only the intended writers. Record the release and checkpoint identifiers. Remove canary data through the controlled privacy workflow when no longer needed.
9. Retain compatible procedures, worker payload support, token verification configuration and old structures for the approved rollback period. Include retained copies in privacy handling. If an incident occurs, use section 8; do not fall back blindly to an incompatible old binary.
10. After the window, reconciliation and operator sign-off, remove obsolete tables/objects in a separate reviewed cleanup release. Respect privacy decisions and backup retention. Do not delete old branches or deployments as a prerequisite for launch.

## 8. Failure and rollback rules

| Situation | Safe response |
| --- | --- |
| Migration blocks or fails before switching writes | Abort at the defined timeout; inspect the checkpointed migration state; continue the old path only if its compatibility checks pass |
| Preview, privacy or recovery gate fails | Keep production on the current supported path; fix and rehearse again; address current privacy deficiencies independently |
| Canary fails during intake pause | Do not reopen; retain data/files for diagnosis; restore only a proven compatible release or forward-fix |
| Failure after new writes | Pause affected intake/worker operations if needed; deploy the tested new-schema compatibility release preserving new data and queued work, or forward-fix |
| Scanner unavailable | Keep files quarantined; show accurate received/pending state; alert the operator; bound backlog/storage and pause intake if limits require it |
| Restore required | Restore isolated database and complete corresponding files; apply later privacy decisions; validate before exposing traffic; acknowledge potential loss within the agreed recovery objective |

Never delete a CV just because an HTTP response timed out. Never reset production to make a migration pass. Never treat a destructive down migration or older database backup as a lossless application rollback.

## 9. Ownership and open decisions

| Owner | Required decisions or evidence |
| --- | --- |
| Product owner, with appropriate privacy advice | Applicable jurisdictions, application/talent-pool purposes, notice/retention, Viewer extracted-text policy and acceptable intake pause |
| Technical maintainer | Reviewed schema/contracts, permission tests, retry duration/rotation, scan freshness, migration and compatibility release |
| Release/infrastructure operator | Correct environment targets, MFA enforcement, scanner execution, worker scheduling, secrets, quotas, alerts and incident access |
| Recovery operator | Backup destination/retention, file coverage, recoverable privacy ledger and demonstrated restore timings |
| Product owner and maintainer | Budget, recovery objectives and rollback window; proposed 24-hour RPO, 8-hour RTO and seven-day rollback are not yet operational guarantees |

One person may own several roles initially, but none may be left unassigned at activation. Local specification and synthetic-data development can proceed while these production choices are resolved.

## 10. Immediate next deliverable

Preserve current changes, version the approved documents, and produce the schema specification plus relationship diagram and invariant-to-test checklist. Review those before implementing dependent migrations. Begin with local additive foundations; no live data migration, Vercel configuration change or new paid service is needed for that first step.

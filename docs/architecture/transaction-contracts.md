# Proposed authorization and transaction contracts

Status: proposed for review, paired with the [schema](schema-specification.md). Function names/signatures below are the intended versioned interfaces, not implemented database functions. No runtime path is switched by this PR.

## 1. Database boundary and permissions

Connection roles are distinct from organization role rows:

| PostgreSQL role | Allowed authority |
| --- | --- |
| `app_owner` NOLOGIN | Own business schema; migration operator assumes only in targeted migration tooling |
| `app_staff` | Approved RLS-protected reads and explicit staff procedure EXECUTE; no base-table DML |
| `app_intake` | Public projection and reserve/finalize/replay procedures only; no general candidate SELECT |
| `app_worker` | Claim/renew/publish/cleanup procedures; no arbitrary table DML or unrestricted candidate listing |
| `app_executor` NOLOGIN | Narrow table privileges for security-definer mutation procedures; no schema ownership/BYPASSRLS |
| `app_authz_reader` NOLOGIN | Internal permission lookup on users/memberships/roles/grants/catalog; no business-data access |

Provision login credentials separately; no credential literals in migrations. Revoke PUBLIC schema/table/sequence/function access and set default privileges before creating functions. `app` is not added to Supabase's API schemas. Browser access uses server routes only; the legacy route's service-role access remains isolated until the replacement is activated.

Enable and FORCE RLS on tenant business tables. Give runtime roles no membership in owner/executor roles. Security-definer functions have qualified names, fixed `search_path=pg_catalog,app,pg_temp`, explicit EXECUTE grants and no caller-controlled dynamic SQL. Neither runtime role can CREATE in these schemas. Function overloads/signatures are explicit; do not grant EXECUTE on all functions indiscriminately.

Staff transactions begin on one checked-out connection, call `set_config('app.actor_id', verified_user_uuid, true)` and `set_config('app.organization_id', verified_org_uuid, true)`, then perform work and commit/rollback before release. Session/JWT permission lists are never authoritative. Missing/malformed context denies access. Database settings are trusted server assertions: a stolen server database credential or arbitrary server SQL execution can forge them. RLS is not an authentication mechanism for untrusted database clients.

`has_permission_v1(key text)` resolves active user, membership, active role and nonretired permission/grant. Its `app_authz_reader` policy is narrowly limited to the asserted actor/organization and does not invoke itself recursively. Global identity rows have a separate principal-resolution entry point using verified issuer/subject; no public enumeration. RLS for staff business reads calls the helper and applies current candidate lifecycle plus purpose rules. Privacy procedures have a separate audited access path to restricted records, never a general “Admin ignores restrictions” flag.

Executor RLS bounds rows to the procedure's validated organization. Each exposed function additionally validates its specific authority: staff membership/permissions, intake reservation/capability, or worker target/lease. An intake/worker call cannot substitute a staff actor setting for these checks, and a staff call cannot request a privileged service action. Explicit role-specific EXECUTE grants and procedure checks are both required; do not grant runtime users table access merely to make a definer function pass RLS.

Supported grants and combined checks:

| Operation / procedure | Required permission keys | Initial roles |
| --- | --- | --- |
| Read clients/jobs/pipelines | `clients.read`, `jobs.read` according to resource | Admin, Recruiter, Viewer |
| Edit client | `clients.write` | Admin, Recruiter |
| Draft/edit/publish/close job | `jobs.write`, plus `clients.read` when assigning client | Admin, Recruiter |
| Read candidate / list / structured search | `candidates.read` | Admin, Recruiter, Viewer |
| Edit candidate / assign owner / manage current CV | `candidates.read`, `candidates.write` | Admin, Recruiter |
| Read applications/history | `applications.read`, `candidates.read` | Admin, Recruiter, Viewer |
| Change/reopen application stage | `applications.read`, `applications.stage`, `candidates.read` | Admin, Recruiter |
| Configure pipeline / mapped migration | `pipelines.manage`; application migration also `applications.stage` | Admin only initially |
| Issue clean document download | `candidates.read`, `documents.download`; `applications.read` for application context | Admin, Recruiter |
| Upload to established candidate | `candidates.read`, `documents.write` | Admin, Recruiter |
| Read notes/tasks/tags | `candidates.read`, `collaboration.read` | Admin, Recruiter, Viewer |
| Write notes/tasks/tags | `candidates.read`, `collaboration.write` | Admin, Recruiter |
| Review duplicate evidence | `candidates.read`, `duplicates.review` | Admin, Recruiter |
| Merge confirmed candidates | `candidates.read`, `candidates.merge` | Admin only |
| Bulk export | `candidates.read`, `data.export`; application export also `applications.read` | Admin only |
| Verified rights access/correction/restriction/erasure | `privacy.manage` via dedicated procedures | Admin only |
| Staff membership / role assignment / grants | `staff.manage`, and `roles.manage` for role/grant changes | Protected Admin only |
| Organization settings | `organization.manage` | Protected Admin only |
| Read minimized audit evidence | `audit.read` | Admin only |

Each comma-separated requirement is conjunctive, never “any grant.” Viewer is inactive pending product approval of extracted-text access. Later-feature keys may be cataloged without an executable feature, but unsupported operations deny. Seed grants do not reset edited organization configuration on rerun; versioned changes are explicit.

Raw staff INSERT/UPDATE/DELETE must fail on all invariant-bearing tables, including `applications`, histories, candidates' lifecycle/current-CV fields, role/grant tables, file metadata, intake, queues and privacy. Read privileges are limited to reviewed read models/columns; candidate PII cannot be retrieved by selecting a permissive auxiliary table. Each source/identifier/document/history policy follows the same candidate/application access rule.

## 2. Transactions and lock order

Global order for participating resources:

1. Organization row: `FOR SHARE` for ordinary authorized mutations/publication; `FOR UPDATE` for role/membership changes. This serializes revocation/grant changes against already-authorized committing mutations.
2. Job rows in UUID order where eligibility/publication is relevant, using `FOR SHARE` for intake and `FOR UPDATE` for editing/closing.
3. Candidate rows in UUID order, `FOR UPDATE` for ownership/lifecycle/document changes.
4. Applications, blobs and documents, each class in UUID order.
5. Organization usage counter, then ingestion/processing job rows, then append-only history/audit/outbox inserts. Rate-limit buckets are short independent transactions and never hold locks while acquiring these rows.

Short claim/reserve transactions may lock only their queue/request row and must commit before acquiring a candidate/job lock. A worker never holds a claim lock while calling Storage, a scanner or email. Publication reacquires locks in the order above; no network calls inside the database transaction. Use database clock time for leases, not worker clocks.

Read-only authorization uses one statement/snapshot or a bounded transaction; revocation affects the next check. Grant modifications lock the organization exclusively, recheck caller authority after obtaining the lock, verify a protected active admin remains, write the change and minimized audit together. The last-admin count includes active user, membership and role; disabling any of those must use this path. Operator recovery uses an individually authorized, audited runbook and identity proof, never an email allowlist or public bootstrap endpoint.

Organization Admin can disable its membership, not the global user shared with other organizations. Global identity disable/recovery is a platform operator path that locks every affected organization in UUID order, preserves each last-admin invariant and audits every affected organization.

Version mismatches return conflict, never last-write-wins. Proposed transaction limits: 2-second lock timeout and 10-second statement timeout for interactive mutations; backfills have separately measured bounded batches. Retry only recognized serialization/deadlock conflicts with bounded attempts and the same operation identity.

### Controlled entry points

All UUID arguments are organization-scoped by verified context; worker/intake scope is derived from authenticated job/capability, not trusted submitted organization.

| Interface | Transaction obligations / result |
| --- | --- |
| `change_membership_v1(membership_id, role_id, status, expected_version)` | Organization exclusive lock, grant check, same-org role, last-admin check, update and audit |
| `change_role_grants_v1(role_id, expected_version, grant_keys, revoke_keys)` | Same lock; supported keys, protected Admin grants, no protected grants to other initial roles, audit before/after keys |
| `save_candidate_v1(candidate_id, expected_version, allowed_fields)` | Active lifecycle/purpose, validate assigned membership; profile/version increment and derived-work invalidation |
| `save_job_v1(job_id, expected_version, allowed_fields)` | Same-org client/pipeline/owner; public-field changes revoke editorial approval |
| `publish_job_v1(job_id, expected_version, reviewed_content_hash)` | Explicit editorial action; content still matches review; set published state; no persistent public cache initially |
| `transition_application_v1(application_id, expected_version, stage_id, reason)` | Lock candidate then application; validate current and target pipeline/stage; update stage/version and append history atomically |
| `migrate_application_pipeline_v1(application_id, expected_version, pipeline_id, stage_id, reason)` | Explicit mapped destination, preserve from/to pipelines in history; never update existing applications from job-default edit |
| `restrict_candidate_v1(candidate_id, expected_version, request_id)` | Verified privacy authority; set restriction, increment generation; cancel queued work, invalidate projections, append decision and ledger job atomically |
| `erase_candidate_v1(candidate_id, expected_version, request_id)` | Restrict first; clear PII/current pointers, schedule checked deletion of every primary/legacy/derived copy; fulfillment waits for completion/ledger evidence |
| `prepare_download_v1(document_id, application_id?)` | Record read + download permission; candidate/purpose/document active; scan fresh and clean; verified primary exists; return only selected locator and audit issuance intent |
| `merge_candidates_v1(source_id,target_id,versions,resolution)` | Not exposed until later merge PR. Confirmed preview/version, lock order and duplicate-blob consolidation below |

Minimal staff shell and operator commands in PR 3 expose these supported operations. Finalization alone creates the initial stage event; raw insert cannot omit it. No-op stage transitions do not fabricate a history entry. Reopening a terminal stage requires explicit action/reason and preserves prior outcome history.

## 3. File states and merge

“Live” reserves the unique content slot; “reusable” is a stricter derived predicate, never a client-supplied boolean.

| Blob lifecycle / scan / primary location | Allowed behavior |
| --- | --- |
| live / unscanned or pending / available | Received but quarantined; enqueue scan; no download/parse/reuse |
| live / scanning / available | Current scan lease only; no download/parse/reuse |
| live / clean, still valid / available and verified | Download/parse eligible subject to candidate/purpose permissions; reuse only for established candidate |
| live / clean but expired / available | Quarantine again, enqueue versioned rescan; no download/parse until new verdict |
| live / infected or failed / available | Quarantine; infection is never reclassified by deduplication; controlled retry policy |
| unavailable / any / missing or no primary | No access/reuse; recovery/replacement only |
| retired / any / any retained copies | No new references/reuse/download; delayed physical cleanup |
| deleting or deleted / any / delete_pending or deleted | No references eligible for serving; deletion rechecks last-reference and checkpoint obligations |

Scanner claims set `scanning` and increment scan generation. Only current fenced verdict can change it. Proposed clean validity is 24 hours; definition updates invalidate older approved verdicts according to an explicit policy before activation. Failed scans retry boundedly, then remain quarantined. A quarantined original upload still counts against quota.

Unavailable/infected replacements do not bypass content checks. Different bytes become a new blob/document; identical bytes with an infected verdict cannot be newly declared clean. Retire an old content slot only through the checked replacement transaction, preserving attachments and propagating the known restriction until reassessment. Active served documents must always reference live clean content; historical documents can retain unavailable/quarantined references visibly marked unavailable.

Merge order, within one transaction:

1. Lock candidates in sorted order and validate preview versions, purposes and privacy compatibility. Reject an ordinary merge involving restricted/deleting/deleted sources; operator privacy resolution is separate.
2. Lock affected applications/blobs/documents. Cancel/supersede derived work and increment candidate/blob generations.
3. Compare same-hash blobs, sizes, verdicts and location integrity. Conflicting metadata/verdicts quarantine and abort ordinary consolidation pending review.
4. Choose canonical eligible blobs. Mark redundant blobs `retired` **before** changing candidate ownership, removing them from the immediate partial unique index.
5. Defer the explicitly deferrable ownership FKs. Repoint documents to canonical blobs, transfer candidate ownership of all linked records (including attachments, identifiers and sources), and preserve document/attachment IDs and receipt facts.
6. Resolve current-CV/purpose choices conservatively; tombstone source with restricted redirect; write merge audit/provenance. Force deferred constraints immediate before returning.
7. Queue surplus-copy cleanup with grace/reference/checkpoint checks. No byte deletion in the merge transaction.

Upload/reuse/finalization and privacy procedures use the same candidate locks. Uploads targeting an old source after a merge fail stale-ownership validation or restart through explicit review; they never silently add files to the redirect.

## 4. Bounded retry and intake contract

Proposed defaults for review: 24-hour capability validity, no post-expiry acceptance, 24-hour orphan grace after expiry/last lease, maximum five recovery attempts. These are engineering settings, not privacy-retention approval.

`POST /api/application-intents` takes only job slug, rate-limited through PostgreSQL counters; returns a signed capability scoped to an open public job and current approved notice. Use a maintained JOSE implementation, pinned algorithm `HS256`, at least 256-bit key from secret management, and random UUIDv4 `jti` (122 random bits). Claims: `iss`, `aud`, `v=1`, `jti`, internal `org`, `job`, `notice`, `iat`, `exp`; header `kid`. No PII. Verification accepts only configured issuer/audience/version/algorithm/key IDs, rejects future issue time beyond small measured skew, bounds `exp-iat` and checks expiry against server time. The client cannot supply an organization to override the claim.

Persist a durable reservation when submitted bytes/facts have been validated, not for every issued token. PostgreSQL-backed `intake_rate_buckets` and `organization_usage` must be implemented before this endpoint is enabled; a token signature does not provide abuse protection. Rate keys are protected, short-lived source-address digests; trust forwarding headers only from the deployment's verified proxy path. Proposed synthetic pilot settings: 10 intents/hour/source, 5 uploads/hour/source, organization caps 100 intents/100 uploads per hour, 10 concurrent uploads and 1 GiB of primary plus reserved/orphan bytes. Fixed-window boundary bursts are bounded by the organization cap and concurrency/byte reservation. Alert at 80% quota; reject new reservations at the cap without rejecting valid committed replays. Confirm limits and retention with the operator before real intake.

Canonical digest v1 is SHA-256 of UTF-8 `JSON.stringify` of a fixed-order array:

```text
["agora-intake",1,jobUUID,noticeUUID,
 trimmedFullName,trimmedEmail,canonicalProfessionalURLOrNull,
 trimmedAchievementOrNull,NFCBasename,detectedExtension,detectedMIME,
 actualByteLength,lowercaseHexSHA256OfActualBytes]
```

Normalize CRLF to LF in textual fields before hashing, then preserve the same canonical facts. Do not lowercase the submitted email mailbox; matching normalization is separate. Do not include multipart boundaries, client MIME, request timestamps or honeypot values. Validate field lengths/types before digest calculation. Filename is basename, Unicode NFC, control/path characters rejected, max 255 UTF-8 bytes. A changed filename therefore conflicts. Canonicalization is versioned and shared by reserve/replay/finalize, never recomputed with silently updated rules.

Verification keys remain available until all capabilities they issued expire and compatible releases no longer need them. Normal rotation signs new tokens with a new `kid`, verifies old tokens for their full lifetime, then retires them. Emergency key revocation rejects affected tokens even before expiry and provides an operator support path; it never creates a replacement request automatically. Never log capability strings or include them in URLs/analytics.

### Response and state rules

| Case | Response / persisted effect |
| --- | --- |
| Missing/invalid/unverifiable token | 400 `INVALID_RETRY_CAPABILITY`; no new application |
| Authenticated expired token | 410 `RETRY_CAPABILITY_EXPIRED`, regardless of request-row presence; earlier outcome remains uncertain to client |
| Valid committed token + matching digest | 200 original minimal `{success:true,refId}` before current job-open check |
| Same token, different digest | 409 `REQUEST_DIGEST_CONFLICT`; never mutate committed/pending facts |
| Privacy-erased receipt | 410 `RECEIPT_UNAVAILABLE`; no PII, no new application |
| Current lease/incomplete retry | 202 `APPLICATION_PROCESSING`, `Retry-After`; explicitly not saved success |
| New/unfinished request and job closed or notice invalid | 409 `APPLICATION_NOT_AVAILABLE`; no finalization |
| Oversized/invalid file or fields | 413/400 validation code, no saved success |
| Quota/backlog exceeded | 429 or 503 with retry guidance; no false success |
| Finalization succeeds | 200 minimal saved receipt; scan/email still pending |

`reserved → file_stored → committed`. Reserved/file_stored may transition to retryable/rejected/expired. Retryable can return to reserved or file_stored only after inspecting its immutable intended locator and digest. Committed is terminal except receipt minimization. Expired/rejected cannot finalize. A lease does not extend token validity.

Reserve uses a unique capability ID and stores planned IDs/locator, actual hash and validated pending facts. Put immutable bytes without overwrite. If an object already exists, verify actual hash/size before adopting it; mismatched bytes cause rejection/quarantine, not overwrite. Reconciliation can discover bytes after a put succeeded but the state update was lost.

Finalize locks organization/job, planned/existing candidate if present, then request. It revalidates token expiry, notice/purpose, job publication/availability, locator verification and request lease/version. In one transaction insert provisional candidate, purpose/source/identifier, blob/location, document/application/attachment, first stage history, audit, scan/email jobs; mark request committed and erase pending facts. No anonymous request targets an established candidate by email/hash. Finalize can recover a known completed upload but cannot trust client claims of upload success.

Ambiguous commit → reread by capability with same digest. Never remove bytes on HTTP timeout. Keep request digest/outcome through its expiry; clear pending PII promptly when no longer needed. Cleanup after grace must lock/recheck lease, committed references and checkpoint obligations immediately before authorizing deletion, with a deletion lease that prevents reuse/finalization. Actual object deletion is retryable; record completion afterward.

## 5. Worker publication and untrusted execution

Claim at most 10 compatible ready jobs using `FOR UPDATE SKIP LOCKED`, set fresh random lease token, attempts and database-clock expiry. Proposed lease 120 seconds, heartbeat every 30 seconds, scan wall-time at most 60 seconds. Retry exponential backoff capped at one hour, max five attempts; alert on terminal failure and oldest ready job >10 minutes. Unsupported payload versions remain unclaimed and alert; never decode optimistically.

Final publication transaction checks, while holding candidate/blob/job locks:

```text
job.status = leased
AND job.lease_token = supplied_token
AND job.lease_until > database_now
AND candidate.lifecycle = active
AND required_processing_purpose_current
AND candidate.lifecycle_generation = captured_generation
AND blob.lifecycle = live
AND blob.version / scan_generation = captured_source_version
```

Derived work adds document/current-CV/parser-source versions when introduced. Update verdict/text/projection and mark job succeeded atomically. If a fence fails, discard result, close/supersede only the matching lease and never publish candidate data. Privacy/deletion uses the same locks/generations; erasure jobs use their dedicated deleting-state predicates rather than ordinary active-state predicates.

The orchestrator fetches the selected object; scanner/parser receives only a read-only input file, bounded scratch/output, restricted OS/container identity, no orchestration env/secrets, no host mounts and no general network. Start with max 256 MiB memory, one CPU and 60-second wall time, then validate realistic files before release. Scanner definitions update through separate controlled provisioning. Parsing remains off; before enabling it define archive entry/decompressed byte/page/text/output limits and test exhaustion. Process separation alone is not accepted sandbox evidence.

External email is at-least-once: use provider idempotency/effect keys if supported, record delivery attempts without copying CV data, and acknowledge only current lease. Check recipient purpose/authority immediately before sending. Already-sent email cannot be rolled back; a crash after send may duplicate delivery. Templates link to authenticated recruiter routes, never attach CVs or long-lived URLs.

## 6. Public disclosure and downloads

The only anonymous job DTO is:

```text
{ id: publicSlug, title, description, responsibilities: string[],
  tags: string[], salary: string|null, location, type,
  clientDisplayName: string|null, acceptsApplications: boolean }
```

Only published, reviewed jobs appear. A published but closed job can remain visible with applications disabled; withdrawn/draft direct URLs return 404. No organization/client/membership/pipeline IDs, private notes or candidate counts. Metadata, structured SEO, serialized server components and sitemaps consume this same DTO. Source `className` is computed by presentation code.

Use `Cache-Control: no-store` and no persistent Next.js data/full-route cache for these reads initially. Public edits clear review/publication; every affected representation reads the same projection. Test HTML and payloads for confidential sentinels. An editor must also review approved free text and slugs for client disclosure; existing public copies cannot be recalled.

Download authorization resolves a logical document; no arbitrary-key signing endpoint. The server signs only its returned verified locator with proposed TTL 60 seconds and safe attachment filename. Recheck lifecycle/scan freshness after slow locator work before issuance. Record issuance, not claimed delivery. Previously issued URLs may remain usable to expiry after revocation; immediate revocation requires a different delivery design. Never expose locator/URL to analytics or shared caches.

## 7. Privacy, checkpoints and rollback

Initial operator rights flow: authenticate staff + `privacy.manage`, record received request, verify identity using an approved procedure outside public email matching, attach candidate under organization scope, execute controlled correction/restriction/erasure, track all effects, record a minimized resolution. Export data uses private expiring delivery, rechecks authority at release and includes the applicable application snapshots/attachments. Export retention is a policy decision before enabling it.

Restriction is effective in the live database immediately; separately persist its monotonically sequenced decision in an independently recoverable ledger. Do not report final rights fulfillment before ledger acknowledgment. An asynchronous gap must be visible and alerting. If the database is lost before ledger reconciliation is proven complete, keep restored candidate access disabled and reconcile against the independent request log/operator evidence. Do not claim the ledger has zero-loss guarantees merely because an outbox exists.

Checkpoint manifest outside ordinary serving metadata: checkpoint ID, database recovery point/schema version, creation/completion timestamps, every retained logical/blob ID and immutable backup object locator, size, SHA-256, privacy-ledger high-water mark, tool/release versions and verification result. Include legacy copies during rollback window. Copying files independently from the dump is insufficient; close upload/delete races using immutable backup copies plus a verified inventory of references at the database recovery point. Mark complete only when every referenced file is covered. An absent byte invalidates the checkpoint.

Restore to an isolated target, keep app/worker traffic disabled, restore database and actual bytes, apply all later recoverable privacy decisions, reconcile checksums and grants, test authorized downloads and restriction denial, then permit reopening. Monitor age of the latest complete checkpoint. Backup retention, holds and erasure exceptions require approved policy.

Compatibility matrix recorded per release:

| Component | Required overlap during proposed seven-day rollback window |
| --- | --- |
| Web/API | New-schema-compatible previous release; server switches direct exactly one writer |
| Database | Procedure signatures, columns and permission keys used by both releases |
| Workers | Versioned payload decoders, lease semantics and safe unsupported-version handling |
| Retry capabilities | Algorithms, `kid` verification material, canonical digest versions and response contract |
| File processing | Lifecycle interpretation, scan/verdict metadata and retained physical locations |
| Configuration | Private buckets, OAuth callbacks, runtime grants, feature flags, scheduling and quotas |
| External effects | Already-sent emails/exports tracked; no promise to retract them |

Backfill/cutover follows the supplied plan: rehearse, complete checkpoint, additive schema, initial copy, approved server-side pause/drain, final reconciliation, compatible deployment/workers, controlled canaries, explicit activation. Never apply migrations in build/startup. Schema removal and legacy byte deletion require separate review after rollback and privacy obligations.

# Complete candidate privacy workflow — design for approval

Date: 2026-09-22 · Status: WORKFLOW DESIGN; DATA FOUNDATIONS IN DEVELOPMENT; NO PRODUCTION APPROVAL

Companions: [candidate privacy notice](../privacy/candidate-privacy-notice-draft.md), [retention schedule](../privacy/retention-schedule-draft.md), [rights and complaints procedure](../privacy/rights-request-procedure-draft.md), [ADR-001](agora-adr-001.md), [schema specification](schema-specification.md), [transaction contracts](transaction-contracts.md).

## 1. Confirmed inputs and evidence boundary

The owner confirmed that the business is UK-based, genuine applications are arriving, a responsible owner exists but there is no formal rights procedure, CV viewing is intended to take place in Agora, and CVs are also shared with clients by email, chat or ATS. The owner requested policy drafts and a full workflow design before further implementation, rather than the narrower request/restriction batch.

PR #4 is merged on remote `main` at `9ec9c26`; its CI passed. Its five authorization routines, audit table and transaction helper are implemented. The dependent document/privacy data foundations are implemented locally, as is a bounded set of case/subject procedures — request registration, subject review, verification, candidate-profile correction and local restriction metadata — described in the operation sections below. Live staff login, candidate-read interfaces, request fulfillment/rejection and response handling, erasure effects, recipient notification, independent ledger delivery and privacy workers remain unimplemented. Source inspection found legacy submission to `public.applicants` and `cv-submissions`, no candidate privacy page/notice link in the form, and a diagnostic script that attempts to print applicant details and a signed CV URL. The script was not executed.

These are owner reports and repository findings, not a live deployment/data audit. No production records, provider contracts, regions, backups, client ATS settings or existing staff copies were inspected. No policy below claims already implemented technical control. The owner has instructed that development may proceed with configurable runtime records and synthetic fixtures: exact recipients and unfinished business policies do not gate development, while policy publication and production activation remain separate approvals.

## 2. Regulatory and operational decisions

The drafts use UK GDPR and DPA 2018, accounting for current commenced DUAA changes. Recruitment confidentiality/recordkeeping, PECR, overseas regimes, transfer rules and employment-related obligations are conditional on the actual activities; this is not an exhaustive determination of every law applying to the business.

| Decision | Required evidence before relying on it |
| --- | --- |
| Controller and accountable operator | Legal entity/address, monitored privacy channel, owner/deputy, DPO/representative assessment, ICO fee/registration position |
| Recruitment model and geography | Permanent introductions versus temporary supply, relevant UK nation, candidate/client countries, and territorial/exemption assessment for recruitment regulations and EU/other laws |
| Purposes and legal bases | Separate application, statutory recordkeeping, claims/security and optional talent-pool purposes; approved LIAs where used; additional conditions for sensitive/criminal data |
| Notice and deadline rules | Approved notice/version/effective date, direct/indirect collection delivery, rights-specific clocks and distinct complaint clocks reflecting current law |
| Retention | Approved class-specific triggers, applicable minima/holds, cleanup/backup periods and genuine service dates; no blanket one-year rule |
| Client relationships | Controller/processor/joint-controller classification for the actual activity, recipient contacts, terms, candidate sharing policy and approved channels |
| Transfers and website technologies | Provider/recipient entity and support-access map, adequacy/safeguards/assessment where applicable; actual analytics/cookie/marketing inventory and PECR assessment |
| Real staff access | Stable verified operator identities, enforceable MFA, individually attributable sessions, approved bootstrap/recovery and dependency remediation |
| Independent recovery | Ledger destination and separate recovery/credentials, case-intent evidence, backup maximum restorable age, operator ownership and demonstrated restore process |

A client-sharing approval is a proposed operational safeguard, not an automatic UK GDPR consent basis. Under applicable regulation 28(2), current-employer disclosure needs prior, unwithdrawn consent and must not be a condition of services. Regulation 29 has specific creation/last-services retention triggers and a no-action exception; classify records rather than applying an arbitrary global TTL. See source references in the policy drafts.

### Immediate live-intake workstream

Before waiting for the app redesign, the owner should approve and operate a monitored rights/complaints channel, record current disclosures and controlled copies, review notice/purpose/retention practices and provider access, and address any pending real request through a reviewed manual process. Publication, production configuration changes, record inspection, stopping intake and deletion each require their own authority; this document performs none of them.

Review the existing source's broad raw-error logging, optional OAuth access-token retention, diagnostics that log signed URLs, and the homepage's “full privacy”/permission-sharing claims against actual practice. A private Storage bucket or the new database roles alone does not substantiate those claims.

## 3. End-to-end model

```text
request received on any channel
    -> restricted case register + independently recoverable receipt evidence
    -> proportionate requester/representative verification
    -> reviewed subject, record, purpose and disclosure scope
    -> rights/legal-retention decision and required response deadline
    -> controlled transaction + minimized audit/privacy event + durable effects
    -> local database/file effects + recipient notifications + ledger delivery
    -> operator reviews evidence, retained exceptions and unknown external outcomes
    -> timely candidate response, with operational follow-up tracked separately
    -> bounded case/evidence retention and restore-time enforcement
```

No new candidate account is required to request a right. A received case can be registered before the subject is resolved. A verified identity does not automatically establish that every matching email or CV belongs to that subject.

### Completion is multidimensional

Keep at least these independent states:

- Request verification and accepted/declined scope.
- Legal response: due, extension/clarification events, response sent and reasoned outcome.
- Local/processor execution: pending, running, confirmed, failed or justified retained exception.
- Recipient notification and actual remote outcome: not contacted, sent, delivery failure, response pending, confirmed action, justified independent retention, disputed or unknown.
- Independent ledger delivery: pending, acknowledged or failed/gapped.
- Backup treatment: live erasure confirmed, beyond-use controls verified, last covered expiry pending or completed.

`fulfilled` must mean the defined obligations for Agora's accepted scope are complete, not that all personal data everywhere has vanished. A timely legal response may be sent before every operational follow-up is closed. Processor instructions and independent-controller notifications have different completion criteria. A justified independent retention decision or beyond-use backup treatment must be described accurately; an unexplained unknown cannot be converted into deletion proof.

## 4. Required data contracts before DDL

Existing specifications are inputs, not approval of missing columns or new catch-all JSON tables. The implementation must supply reviewed column-level definitions, constraints, indexes, role grants and lifecycle tests for the complete dependency set before migrations are written.

| Entity/batch | Contract needed |
| --- | --- |
| `processing_purposes`, `privacy_notices`, `candidate_processing_purposes` | Use the proposed tenant/purpose/version/notice/source FKs; active purposes require approved policy. Published content and approval evidence cannot be silently rewritten. Bind ordinary access to the relevant purpose, not just any active purpose such as statutory retention. |
| `privacy_requests`, `privacy_events` | Preserve the proposed verification/version/ledger fields and minimized append-only evidence. Refine request handling for objection, portability and consent withdrawal; the current proposed four-kind enumeration is not the complete rights model. Complaints need a separate, linked case/clock model, not an alias for a SAR. |
| Legacy record identities and request-subject links | Portable identities for explicitly approved legacy datasets and native row IDs, plus reviewed request-to-record links. Permit legacy-only requests without canonical candidates or job mappings. The provider adapter verifies the real row and the dataset's fixed organization binding; callers cannot choose an arbitrary organization for a tenantless legacy row. |
| Disclosure records and recipient register | Identify recipient legal entity/role, destination/channel, document or legacy version, purpose, terms/transfer and candidate-approval references, sending actor, intent and outcome, and message/ATS reference. Tenant-bound FKs where modeled; protected contacts where needed. No copied CV bodies or bearer URLs. |
| Per-case effects and retained exceptions | Model the specific target and action, expected source/lifecycle version, deduplication key, lease/retry state, required completion evidence, approved exception and review deadline. Use typed target references/constraints rather than unconstrained ownership UUIDs or arbitrary payload dumps. |
| `file_blobs`, `blob_locations`, `documents`, `application_documents` | Implement the specified ownership, version, scan and location invariants before pretending files can be enumerated/erased safely. Add `candidates.current_document_id` only with its complete FK target. |
| Application notice and legacy mappings | Add `applications.notice_id` with its tenant-bound notice FK. Preserve missing historical evidence as unknown; never fabricate notice acceptance. Privacy subject linkage is separate from the later job/client-approved recruitment backfill. |
| Durable processing jobs and ledger delivery | Reuse reviewed queue concepts, but supply every required FK target. If intake is not included, explicitly defer intake-dependent columns/kinds rather than leave unvalidated references. Privacy jobs need typed targets, fencing and idempotent effect keys. |
| Audit action extensions | Extend the current two-action audit CHECK deliberately for rights, disclosure, verification and recovery events. Allowlist fields per action, preserve the 4 KiB bound, and exclude candidate field values, document contents and identity-document copies. |

The external disclosure register is needed for current email/chat/ATS handling even though richer client-sharing UI was deferred in the original plan. Bringing this accounting requirement forward is a proposed scope amendment, not authorization to build a client portal or bulk-sharing integration.

A client recipient and the communication/ATS supplier are distinct parties. Model who determines processing purposes and who acts on whose instructions. Do not automatically mark every client/provider a processor.

## 5. Authorization and transaction boundary

Use the merged identity-to-principal and transaction-local context mechanism only behind approved real staff authentication/MFA. The helper accepts trusted server assertions; a request body cannot supply a staff identity. No email allowlist or candidate OAuth auto-enrollment.

- Privacy actions require `privacy.manage` and a case-specific verified/authorised scope. A privacy-access/export entry point is separate from ordinary candidate reads and rechecks authority before release.
- Normal candidate/application reads require active staff, the relevant read permission, allowed lifecycle and currently authorised purpose. Statutory-only retention and an unrelated active purpose do not authorise browsing or sourcing.
- Forced RLS, scoped definer roles, qualified names/fixed search paths, explicit EXECUTE grants and raw-DML denial continue. Cross-tenant links must fail structurally and through runtime access checks.
- Follow the approved organization -> candidate -> application/document/blob -> queue/event order. Resolve case/target locks consistently within that order and document it before code; do not lock a queue then wait on its candidate. The implemented operations use the documented low-volume order — organization `FOR UPDATE`, request `FOR UPDATE`, reviewed target `FOR UPDATE`, then blobs/documents/purposes/disclosures in UUID order, then event/audit rows.
- Recheck authority after acquiring governing locks. Require expected versions, explicit case scope and application-generated audit/correlation IDs. Failure must roll back the state change, event and queued effects together. The implemented procedures re-check `privacy.manage` after the organization lock and reject non-read-committed isolation.
- Restriction advances lifecycle generations and cancels/supersedes relevant pending work. Worker publication and export delivery recheck lifecycle, purpose, source and lease generations; stale results cannot restore erased information.
- No network calls inside database transactions. External deletion, delivery and notifications operate from durable intents and record verifiable outcomes afterward.

## 6. Operation contracts

### Access and portability

Build a reviewed manifest of personal information and required supplementary information across current and legacy records and controlled copies. Apply third-party review and applicable exemptions. Generate an encrypted/restricted expiring package; do not send raw candidate exports through an unauthenticated public endpoint. A prior actor check is not sufficient after a long-running export: revalidate on release. Scan/sandbox requirements remain a gate for safely handling original CVs; an access request is not permission to execute an untrusted file unsafely.

Separate export creation, access issuance, actual download evidence if available, and package deletion. Portability uses its own applicability and structured-format contract. No claim of “delivered/read” from a signed URL being generated.

### Correction

Apply reviewed corrections or supplementary statements to the specific records in scope, including legacy data where appropriate. Preserve the distinction between current facts and accurate historical events; historical snapshots are not exempt from legitimate correction/erasure requests. Advance versions and invalidate relevant derived work. Audit changed field names and outcome codes, not old/new personal values. Notify affected recipients as required and track their actual response.

The implemented `correct_privacy_candidate_v1` covers only the canonical candidate's `full_name`/`professional_summary` under a verified correction case and records changed field names only; either value may be set to null to clear an inaccurate stored value without supplying a replacement (no deletion or fulfillment semantics are implied). It deliberately leaves submitted application facts, filenames, byte metadata, legacy source copies and recipient notification untouched — the wider correction duties in this section remain pending work, and a fresh subject review is required before further action.

### Restriction

Apply a global candidate restriction or explicitly reviewed purpose-specific restriction as warranted. Ordinary reads/downloads/search/sharing stop at subsequent checks; only the separately authorised privacy/restricted-retention path remains. Do not lift a restriction implicitly during retry, backfill, import, merge or restore. Notify the candidate before lifting it where required.

The implemented `restrict_privacy_subject_v1` performs the local metadata half: canonical candidates become `restricted` with bumped lifecycle generation, active documents/purposes are restricted, live blob generations advance and `intended` disclosures are cancelled; verified legacy records get `processing_restricted` with the same generation treatment and their own `intended` disclosures cancelled. It does not delete bytes, lift restrictions, touch sent disclosure history or source payloads, and it refuses scopes over 1000 affected rows pending a durable worker. Enforcement at ordinary read/download paths, recipient notification and lift workflow remain pending.

For legacy-only subjects, record enforcement metadata keyed to the verified legacy record and apply it to every approved access/share/export path. The current service-role/admin paths can bypass ordinary RLS, so the operational credential/access boundary must be addressed before claiming effective restriction. Previously downloaded files and issued URLs require separate mitigation and honest expiry/copy disclosures.

### Erasure

Approve accepted scope and any narrowly justified retained subset, then restrict and register effects. Database redaction and file deletion need separate proof. Verify exact locations, candidate ownership and legitimate remaining references before byte removal. Do not delete another candidate's independently held bytes due to hash equality. Do not lose the only recovery evidence for an in-flight deletion.

Track snapshots, identifiers, source text, filenames, current/historical attachments, legacy rows/objects, exports, derived data, managed downloads and communication copies. A missing object is an idempotent success only after the correct target is established; ambiguous locations require investigation. Keep tombstones/evidence minimal and expire them under approved policy. Backups use reviewed erasure/beyond-use treatment and replay-before-restore, not silent permanent retention.

No production deletion follows automatically from approving this design. Actual execution needs explicit authority and a reviewed target/scope report.

### Sharing and downstream propagation

Before manual or automated dispatch, record an intended disclosure and enforce named-client approval, actual purpose, restriction, recipient, version and transfer/terms checks under the approved policy. Record sent/failed/unknown outcomes and reconcile crashes between sending and recording completion. Email and chat delivery cannot generally provide exactly-once semantics; avoid blind resend after uncertain outcome.

An out-of-app manual send must still be recorded through an approved operator process. Otherwise the register's completeness claim is false. Historic disclosures need a proportionate reconstruction workflow with explicit gaps, not fictional records or a claim that no history means no sharing.

On correction/restriction/erasure, create recipient-notification effects from this register. Processor confirmation, independent-controller response, justified retention and non-response remain distinct. A sent message does not prove attachment deletion, recall or recipient compliance. Track required notifications and legal exceptions; do not let recipient silence automatically extend the candidate's legal response period.

## 7. Independent ledger and recovery

The ledger destination must survive loss/restoration of the main database and have separate access and recovery controls. Choose and approve the destination/provider, credentials, retention, operator, budget and restore test before implementation activation. Do not claim a second table in the main database or an untested backup is independent.

Proposed protocol:

1. Record minimal case receipt/intention evidence in the approved independent process. Do not copy full CVs into it.
2. Apply the live restriction immediately in a bounded local transaction with the privacy event and durable ledger-delivery effect. An unavailable ledger must not make an accepted restriction ineffective.
3. Deliver the event with stable organization/event identity and a monotonic decision sequence; verify acknowledgment against that event. Retries must not create conflicting decisions.
4. Track gaps and a contiguous acknowledged high-water mark, not merely the maximum sequence observed. Alert and retain failed deliveries; no automatic fulfillment based on an unacknowledged outbox row.
5. On restore, keep candidate and legacy access, exports, shares and worker publication disabled. Restore the database and verified files; obtain authoritative later decisions, reconcile gaps and replay restrictions/erasures before enabling access.
6. If ledger completeness is uncertain, retain the access block and reconcile against independent request/operator evidence. Do not promise zero-loss recovery from asynchronous delivery.

Separate legal response from execution completion. Required ledger acknowledgment gates operational completion of restriction/erasure, but it does not suspend a statutory response deadline. Backups beyond use can have a documented pending expiry where lawful; the response must accurately distinguish live erasure from that qualified treatment.

## 8. Client-sharing and supplier security controls

Default to intended in-app viewing for authorised recruiters; it is not yet delivered. Approve scanner/sandbox, short-lived access issuance, no-store responses and leak-resistant telemetry before real CV viewing. Neither a browser viewer nor an expiring link prevents copying or screenshots.

For email/chat/ATS, inventory the actual platforms, account/tenant, administrators, storage/support countries, retention/export/deletion features, subprocessors and contract roles. Require individually attributable business accounts and appropriate access controls. Do not assume end-to-end encryption, regional hosting, deletion APIs or recipient identity guarantees without checking the chosen product and configuration.

Assess relevant international transfers for each receiving legal entity and remote access arrangement. Review PECR for direct marketing and storage/access technologies using current exceptions; do not rely on an old blanket analytics-consent claim or assume every analytics product is exempt. Keep external AI/semantic processing off until separately authorised.

Create breach handling for misdirected CVs, public chat/link exposure, unauthorised ATS access and lost devices. Use the distinct ICO risk-based notification thresholds and clocks in the operator draft.

## 9. Proposed delivery sequence and exit gate

This is one full-workflow design with dependent implementation batches, not a series of partial features labelled as completed rights handling.

1. **Policy and live-operations readiness:** approve the three drafts, legal applicability, responsible contacts, current data/recipient inventory, interim request process and publication changes. Obtain separate approval for any live-site changes.
2. **Complete privacy/document/legacy/disclosure schema:** review the full column contracts and role matrices first, then additive portable migrations, nonproduction upgrade tests and synthetic fixtures. No missing-target UUID placeholders and no silent historical consent reconstruction.
3. **Operator identity and case/action procedures:** enforce MFA and verified subjects; implement all rights/complaint routes or controlled operator interfaces, subject review, purpose-aware access, audit, deadlines and raw-SQL negative tests. Candidate OAuth remains separate.
4. **Effects, delivery and independent recovery:** implement guarded storage operations, export delivery, manual/integrated recipient tracking, independent ledger and retry/reconciliation. Scanner and provider-specific setup remain separately reviewed dependencies.
5. **End-to-end rehearsal and activation decision:** prove the acceptance cases below, resolve every production gate, review exact deployment/migration sequence and retain the old intake until explicit cutover approval.

No single batch may claim the full exit gate before documents, legacy copies, external-disclosure obligations and recovery handling are accounted for. Keeping functionality disabled is preferable to false success.

## 10. Required acceptance cases

| Area | Required proof |
| --- | --- |
| Identity and scope | Wrong requester/representative, email-only guess, wrong agency and same-email different person denied; legacy-only request works without invented job mappings. |
| Permissions | Verified staff/MFA plus case-specific authority; ordinary Admin access cannot bypass restriction; revocation mid-operation and pooled connection reuse deny correctly. |
| Purposes and notice | Irrelevant/statutory-only purpose never grants ordinary reads; notice-purpose/version mismatch rejected; historic missing evidence stays unknown; published policy content cannot be silently changed. |
| Disclosure | Correct recipient/ATS tenant and document version, named-client approval and transfer gate; no send after restriction; uncertain sends reconciled; manual history gaps visible. |
| Correction | Updates the reviewed current/legacy scope, handles inaccurate versus historical facts, notifies recipients and avoids old-PII audit copies. |
| Restriction | Read/download/export/sharing denial at subsequent checks; stale parser/import/export cannot republish; a purpose-specific restriction does not erase independently justified records blindly. |
| Erasure | Database rows/redactions AND correct private file bytes; no cross-person/shared-reference deletion; missing files, failed Storage, crashes before/after delete and duplicate jobs reconcile honestly. |
| External recipients | Processor instruction versus independent-controller notification, confirmed versus unknown actions, justified retention and non-response; no “all copies deleted” from a sent email. |
| Requests and complaints | All accepted channels, proportionate identity checks, calendar-month rules and justified extensions/pauses; distinct 30-day complaint acknowledgment; response sent while follow-up remains visible. |
| Recovery | Ledger outage/gap, out-of-order/duplicate acknowledgment and main-DB loss; older backup cannot expose restricted/erased current or legacy data; expiry never drops necessary replay evidence. |
| Production boundary | Synthetic local/CI fixtures only; real disclosure/deletion requires separate approval; no migrations in build/startup and no regression of the legacy public form. |

Approval record: `[APPROVE: technical maintainer, privacy owner, legal reviewer, exact scope, amended column contracts, effective decisions and unresolved activation gates]`. Case registration, subject review, verification, candidate-profile correction and local restriction primitives are implemented locally; full workflow execution — fulfillment, erasure effects, disclosure handling, ledger delivery and runtime activation — remains pending.

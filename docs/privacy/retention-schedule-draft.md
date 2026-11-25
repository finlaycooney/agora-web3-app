# Candidate data retention and disposal schedule — review draft

Version: 0.1 · Prepared: 2026-09-22 · Status: NOT APPROVED; NOT AN AUTOMATED DELETION CONFIGURATION

Owner: `[CONFIRM: privacy owner and deputy]`. Approver: `[CONFIRM: accountable business owner with recruitment/privacy legal advice]`.

This schedule covers Agora records, legacy applicant rows, CV objects, staff working copies, communications, exports and recovery copies. Client-controlled copies require the recipient workflow below. Its proposed periods are business-policy proposals, not statements that GDPR mandates them, and must not be copied into a cleanup job before approval and testing.

## 1. What is known and what must be decided

The owner reports a UK-based business, genuine candidate intake, an owner without a formal rights process, intended in-app CV viewing, and client sharing through email, chat or ATS. Actual legal entity, UK nation, provider locations, recipient terms, backup lifetime, historical copies and current retention practices remain unverified.

GDPR's storage-limitation principle requires purpose-specific necessity and review; it does not prescribe one universal CV retention period. The proposed one-year talent review horizon in ADR-001 is not a blanket legal minimum.

### Recruitment recordkeeping assessment

Where the Conduct of Employment Agencies and Employment Businesses Regulations 2003 apply:

- Regulation 29(1) requires records sufficient to demonstrate compliance, including specified work-seeker and hirer particulars.
- Regulation 29(2) requires those records for at least one year from creation and, for the relevant applicant particulars, at least one year after services were last provided to that applicant. Apply both relevant requirements; do not calculate from application submission alone.
- Regulation 29(3) exempts the specified applicant particulars for applications on which the agency/business takes no action. “Unsuccessful”, “no placement” and “withdrawn” do not automatically mean “no action”.
- Map Schedule 4 particulars and any supporting documents actually received to the records retained. Do not assume every original CV can be destroyed merely because some fields were extracted; equally, do not assume that every duplicate or unrelated message must be retained.
- Confirm territorial scope, the business model and any lawful exemption/opt-out. Great Britain rules must not be silently treated as Northern Ireland rules.

The legal reviewer must approve that classification before the statutory period becomes executable. A statutory minimum is not permission to retain beyond necessity or to keep using restricted records for recruitment.

## 2. Decision rules

For each data class, record its purpose, selected legal basis, retention trigger, applicable minimum/exception, review/expiry date, authority and disposal evidence.

1. Identify all approved, still-applicable purposes and duties for the particular record. Retain only the information genuinely necessary for them.
2. Give each purpose its own expiry/review criteria. Ending a talent-pool purpose must not silently reactivate or extend an application purpose.
3. Where a legal duty or claims need prevents erasure, define the specific retained subset, reason, access restriction and next review. Do not keep all records “just in case”.
4. Preserve records needed for an active rights request, investigation or documented hold to the extent justified. A hold has an owner, scope, review date and release condition; it is not an indefinite default.
5. On release of a hold, use the original retention trigger and reassess overdue disposal. Do not restart the entire period automatically.
6. Record viewing, profile edits, backup creation and internal system migration do not automatically restart recruitment-service or talent-pool retention clocks.
7. If a classification or trigger is missing, quarantine from unnecessary reuse and escalate for a dated decision. “Unknown” must not become indefinite active retention or blind deletion.

## 3. Proposed schedule for approval

All entries labelled **proposal** require approval. Entries labelled **decision required** deliberately contain no invented duration.

| Data class | Trigger and draft rule | Disposal and exception handling |
| --- | --- | --- |
| Active application and relevant current CV | Keep while the specific recruitment service is genuinely active and necessary. Review at closure, withdrawal or inactivity; `[DECIDE: inactivity threshold and responsible reviewer]`. | Close or restrict the active purpose; classify any statutory record subset and separate optional talent-pool purpose. Do not treat an unresolved application as permanently active. |
| Required agency/work-seeker compliance records | If regulation 29 applies, retain for its applicable creation and last-services minimum periods; confirm the precise covered records and whether the no-action exception applies. | At the lawful end point, delete/minimise unless another documented justification remains. Restrict statutory-only copies from sourcing, sharing and ordinary recruiter browsing. |
| Closed applications not subject to a longer applicable duty or justified hold | **Proposal:** six months after closure/withdrawal, subject to a documented necessity/claims assessment and the statutory classification above. This is not a legal minimum or maximum and cannot override a valid earlier erasure outcome. | Delete unnecessary CVs, contact facts, duplicated submission data and working copies; retain only an approved accountability subset. Approval must explain why the proposed period is needed. |
| Optional future-opportunities/talent-pool records | **Proposal:** twelve months from the candidate's separate, documented opt-in or other specifically approved establishment of that purpose. Review necessity at expiry; do not silently renew through internal views or unrelated messages. | Stop that reuse upon withdrawal/expiry as applicable. Seek a fresh valid basis/choice before continuing, or remove the optional record; separately restricted required records may remain. Marketing opt-outs apply independently. |
| Superseded CV versions/application attachments | Govern by the actual application, purpose and evidential need of each version, not merely the current-profile CV's expiry. | Delete unneeded versions and metadata; confirm no other legitimate attachment/reference depends on a physical object. Hash equality is not proof of shared identity. |
| Temporary access-request export packages | **Proposal:** delete seven days after secure availability/confirmed handover, with a shorter delivery-token lifetime and an extension only where justified for the requester. | Invalidate access immediately when no longer authorised; remove package bytes and temp files. Keep minimal issuance/expiry/case evidence, not a duplicate export in the audit log. |
| Staff local downloads and temporary transfer copies | **Proposal:** avoid by default; remove as soon as the approved task/handover is complete and no later than seven days after completion, unless the copy itself is a classified required record or documented exception. | Managed-device deletion, synced-folder and trash handling, and operator confirmation where automated evidence is unavailable. A policy must not claim control over unregistered personal devices. |
| Email/chat containing CVs or recruitment correspondence | Classify substantive correspondence by its recruitment/legal purpose. Duplicate attachments do not acquire a new retention period simply because they were sent. `[DECIDE: enforceable mailbox/chat retention controls and provider limits]`. | Include sent mail, approved archives, attachments, business chat files and managed exports in the inventory. Apply legal holds only to their justified scope; do not delete essential evidence during an unresolved request. |
| Client-controlled email/chat/ATS copies | Recipient's role, agreement and lawful purposes govern the copy; no Agora-only numerical period can guarantee its disposal. | Notify recipients when required, request evidence/action, and track confirmed deletion, justified retention, inability or unknown state. Do not label notification alone as verified remote deletion. |
| Abandoned/orphan uploads | **Proposal:** review for cleanup seven days after demonstrated abandonment, only after proving no live database reference, active lease, valid retry reservation or required recovery coverage remains. | Use the future guarded reconciliation process. Do not erase an object merely because an HTTP request timed out. This proposal does not override the still-unapproved durable-intake retry contract. |
| Security/application logs | **Proposal:** thirty days for routine minimised operational logs; separate documented retention for incident evidence. | Never intentionally log CV bodies, candidate field dumps, OAuth tokens or bearer download URLs. Redact current diagnostic/error paths before relying on this policy. Restrict and expire incident evidence separately. |
| Rights cases, complaints, sharing approvals and disclosure records | **Decision required:** approve the minimum evidence, closure trigger and duration needed for accountability, recruitment duties and relevant claims; review at least annually as a proposed control. | Preserve identifiers/statuses needed to demonstrate action, not duplicate CVs or identity-document scans. Retain recipient contacts only while needed for notifications or the approved evidential purpose. |
| Independently recoverable restriction/erasure ledger | Keep the minimum effective decisions for as long as any permitted restore could reintroduce covered data; approve a bounded policy for any additional suppression need. | Never expire a decision before every covered restorable copy has expired or been sanitised. Ledger records and subject links are themselves protected personal data where identifiable. Review rather than retain indefinitely. |
| Database/file backups and recovery checkpoints | **Decision required:** actual backup/checkpoint lifetime, storage destination, deletion capability and maximum restorable age. No assumed provider default. | Put erased data beyond ordinary use while awaiting approved overwrite/expiry where appropriate; restrict restore authority and replay later privacy decisions before access. Track exceptions transparently. |
| Finance/payroll/right-to-work or other placement records | **Decision required if Agora processes them:** a separate statutory/business schedule appropriate to the actual recruitment model. These uses are not established by this repository. | Do not apply a general CV rule to statutory financial or employment records; do not use this row to justify collecting additional data pre-emptively. |

The public notice must use the finally approved periods or sufficiently specific criteria, not this unresolved table verbatim.

## 4. Deletion and restriction evidence

A disposal record identifies the case/policy, reviewed subject/record IDs, affected systems and versions, approved retained subset, execution time, method, operator/worker, outcome and any next action. Use opaque references and fixed evidence codes where possible. Do not retain erased values merely to prove they existed.

For files: validate candidate/application ownership and the exact backend/bucket/key, consider all live references and any separately justified recovery obligations, request deletion and verify its outcome. A missing object can be a confirmed already-absent outcome only after identity/location checks. Storage failures remain pending; never convert them to success.

For external recipients: distinguish Agora's instruction to a processor from notification to an independent controller. Review each recipient's response and independent obligations. Sending a notification is not deletion evidence. A non-response needs follow-up and a documented assessment, not a false “all copies deleted” statement or an unexplained delay to the candidate's statutory response.

For backups: the owner records when the last covered restorable copy will expire. Beyond-use controls and replay-on-restore safeguards must actually operate before that qualified outcome is communicated. Individualised legal advice may be needed for exceptions; backups are not a universal exemption from erasure.

## 5. Implementation and approval gates

- Approve the exact record classes, triggers, durations and lawful exceptions before scheduling any live deletion.
- Inventory legacy rows/Storage, staff downloads, approved email/chat providers, client ATS recipients, logs and backups without granting unrestricted bulk access to genuine candidate data.
- Require a reviewed dry-run report and explicit target/scope approval before a production disposal run. Applying a retention policy does not authorise an agent to bulk-delete production data.
- Test rule precedence, hold release, missing dates, legacy-only candidates, duplicate references, partial external failures, retries and restore-time suppression with synthetic data.
- Reconcile policy text, published notice, actual configuration and operator practice. Record effective versions; do not manufacture historical notice acceptance or service dates.

## 6. Official sources

Checked 2026-09-22; applicability and subsequent changes must be reviewed at approval.

- [Conduct Regulations, regulation 29](https://www.legislation.gov.uk/uksi/2003/3319/regulation/29) and [Schedule 4](https://www.legislation.gov.uk/uksi/2003/3319/schedule/4).
- [GOV.UK Conduct Regulations guidance and territorial scope](https://www.gov.uk/government/publications/conduct-regulations-2003-guidance-for-employment-agencies-and-employment-businesses).
- [ICO: erasure, recipient notification and backups](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/), currently marked under review after DUAA.
- [ICO draft recruitment guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/), explicitly draft/under review, not final statutory guidance.

Related: [candidate notice](candidate-privacy-notice-draft.md), [rights/complaints procedure](rights-request-procedure-draft.md), [technical workflow](../architecture/privacy-workflow-design.md).

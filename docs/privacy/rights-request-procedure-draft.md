# Candidate rights, complaints and recipient handling — review draft

Version: 0.1 · Prepared: 2026-09-22 · Status: PROPOSED PROCEDURE; NOT YET AN OPERATING CONTROL

Privacy owner: `[CONFIRM: name/role and monitored contact]` · Deputy: `[CONFIRM]` · Legal escalation: `[CONFIRM]` · Security/recovery operator: `[CONFIRM]`.

The owner reports real candidate intake and an owner without a formal process. This draft supplies the proposed end-to-end process, including legacy submissions and CVs shared through email, chat or ATS. It does not establish legal compliance or authorise production access/deletion. Obtain approval, train the responsible staff and validate tooling before representing it as operational. A controlled interim process may be needed now; do not wait for the complete app to handle real requests.

## 1. Scope and legal review

Assess UK GDPR and the Data Protection Act 2018 as amended, including commenced Data (Use and Access) Act 2025 provisions. Check the actual establishment, recruitment model, candidate/client locations and processing activity before deciding whether Great Britain Conduct Regulations, Northern Ireland recruitment rules, EU GDPR or other local obligations also apply. A person's nationality alone does not settle territorial scope.

The [candidate notice](candidate-privacy-notice-draft.md) and [retention schedule](retention-schedule-draft.md) require approval alongside this procedure. Neither candidate sharing approval nor a recruitment contract with a client automatically supplies a valid data-protection basis for every use.

## 2. Immediate operating responsibilities

The privacy owner must establish an accessible, monitored request/complaint route and a restricted case register with an independent recovery path. Staff must recognise requests received by any channel, including ordinary emails, chat, telephone and client referrals. No mandatory account, special form or legal terminology is required.

Until app-based controls are operational:

- Use existing individually authenticated, authorised administrative access under an approved manual runbook; do not distribute a shared service-role key as a human login mechanism.
- Log the case, reviewer, scope, actions and evidence in a restricted register; do not attach complete CVs or identity documents merely for convenience.
- Do not run repository diagnostic scripts against real candidates or publish signed URLs in chat/logs.
- Record and apply restrictions to the actual work process, including staff instructions and external sharing. New `app` RLS policies do not constrain a service-role credential, Supabase administrative access or a previously downloaded copy.
- Escalate any inability to enforce an accepted restriction or meet a deadline. The owner decides any temporary operational limitation; this draft does not itself pause intake or authorise changes to production.

## 3. Receive and triage

Record an opaque case ID, receipt timestamp/channel, requester contact in a protected case record, request type(s), owner, initial scope, jurisdiction assessment and response deadline. Maintain legal response status separately from execution/recipient/ledger status.

Treat access, rectification, restriction, erasure, objection, portability and consent withdrawal as distinct rights with conditions assessed individually. A message can contain several rights and a complaint. Record linked tracks rather than silently reclassifying a rights request as a complaint.

Acknowledge promptly as an operating practice. Proposed internal target: two working days, subject to staffing approval; this is not a statutory replacement deadline or an externally promised service level.

### Deadlines

- Rights requests generally require action without undue delay and within one calendar month. Apply the current rules for the particular right and circumstances, including reasonable identity checks and any lawful extension; do not encode “30 days” as a universal substitute.
- Current ICO subject-access guidance allows up to a further two months where necessary for complexity or the number of requests, with the required explanation within the initial applicable period. Record the reason and notice; workload alone is not an automatic extension.
- For SARs, ask for identity/representative evidence or clarification only where reasonably required and proportionate. Apply the current ICO rules for the start/pause/resumption of the response clock and retain the receipt and event timestamps. Do not automatically stop clocks for every request or transplant UK SAR rules to another jurisdiction/right.
- DUAA complaint duties commenced on 19 June 2026, with transitional rules. Acknowledge covered data-protection complaints within 30 days; take appropriate investigative steps, keep the complainant informed and give an outcome without undue delay. Thirty days is not a universal complaint-resolution deadline.
- Configure deadlines only after legal review of applicable rules, month-end/weekend/public-holiday handling and transitions. A ledger outage, unanswered client email or unfinished app is not a statutory extension. Send a timely, accurate substantive response even if tracked follow-up is still open.

## 4. Verify identity and authority proportionately

Use the minimum information needed to avoid disclosing or changing the wrong person's records. Leverage an established communication channel and relevant contextual evidence. A guessed email, CV hash or public application reference is not sufficient authority. Do not demand passport scans by default or retain verification documents unless a specifically justified requirement applies.

For representatives, confirm their authority to act for the person. Handle children, capacity, sensitive circumstances and disputed identity through the privacy owner and appropriate advice. Give reasonable assistance and adjustments; do not make security checks an unnecessary barrier.

Record who verified, when, method/evidence code and any limits, not a reusable copy of identity evidence. Verification is an operator determination, not an unchecked browser field.

## 5. Identify records and disclosures

Create a reviewed scope manifest covering:

1. Candidate, identifiers, sources, applications, stage/history facts, any notes/tasks and purpose/notice evidence in the new model.
2. Legacy `public.applicants` rows and the CV objects they reference, even if there is no canonical candidate or approved job mapping yet.
3. Document versions, storage locations, exports, temporary processing files and any later extracted/search data.
4. Business email, sent attachments, approved chat messages/files, managed downloads/drives and any ATS/CRM records under Agora's control.
5. Known clients, processors and other recipients, including the exact disclosed version and channel where records exist.
6. Logs, incident/case records, justified retention exceptions and restorable backups/checkpoints.

Scope by reviewed record identity and ownership; do not merge people automatically because their emails or file hashes match. Preserve source fingerprints/version evidence to detect changes between review and execution. Minimise any personal information retained in the manifest.

For access requests, perform a reasonable and proportionate search and document the systems, approach and any justified limits under the applicable rules. An incomplete historic disclosure register does not mean no disclosures occurred; ask staff and search relevant business communication records proportionately. Do not demand the candidate provide every record ID.

## 6. Decide and carry out the requested action

### Access and portability

Review the lawful scope, identity, other people's information and any applicable exemptions. Supply the requester's personal information and required supplementary information, not merely the latest CV. Document redactions/exemptions with a reason; generic internal confidentiality is not an automatic refusal.

Generate a bounded, encrypted/restricted export package from the reviewed scope. Recheck authority and any updated restriction before release, deliver through a verified private route, and expire the package under the approved schedule. Record secure availability/issuance separately from verified download; do not claim the candidate read it. Portability has its own applicability conditions and structured-format requirements; not every access request is a portability request.

### Correction

Verify the contested facts and, where appropriate, restrict their use while checking accuracy. Distinguish an inaccurate current fact from an accurately recorded historical event or opinion. Correct or supplement the records actually in scope, including legacy copies; do not automatically rewrite every submission or preserve erased values in audit details. Record affected field names, versions and outcome codes. Notify recipients as required and explain any justified refusal.

### Restriction

Determine the applicable grounds and scope. Restriction normally allows storage while limiting further use, subject to the law's permitted exceptions. Apply a block to ordinary recruitment reads, exports, downloads and new disclosures; stop related queued work and fence late results with lifecycle generations. Record any exceptional permitted use and its authority.

Immediately implement the accepted restriction in the actual system/work process; independently record it for recovery. Previously issued bearer links may remain usable until expiry, and already disclosed files cannot be recalled by an app flag. Explain material limits and mitigate them. Notify required recipients and assess their response. Before lifting restriction, confirm the grounds, authorisation and required notice to the person; never lift it automatically just because a worker retries or a backup is restored.

### Erasure

Decide whether the right applies to each part of the scope and whether a legal obligation, necessary claims purpose or other applicable exception requires a specific retained subset. Review Conduct Regulations recordkeeping where applicable; no blanket “we keep everything for a year” response.

Restrict first. Produce a reviewed deletion/redaction plan before irreversible actions. Confirm the precise record/object identities, references, retained subset and authority. Use approved controlled procedures and bounded jobs; a production deletion run needs explicit operational approval of its target and scope.

Erase/redact live identifiers and profile data, relevant application snapshots, source text, document filenames and bytes, temporary/export/derived copies, and mapped legacy data according to the accepted scope. Avoid keeping the original personal data in success logs. Shared-file references, interrupted requests and retention exceptions must be resolved explicitly. A soft-deleted candidate or successful database transaction is not proof of deleted Storage bytes.

Handle backups under an approved beyond-use/overwrite plan where applicable, clearly informing the requester. Restriction/erasure decisions must be recoverable independently and applied before restored access. A backup is not a permanent erasure exemption.

### Objection, withdrawal and complaints

Stop direct marketing on objection. For other legitimate-interest objections, assess the applicable grounds and whether continued processing is justified; document and communicate the result. Withdrawal ends processing based on that consent, without retroactively invalidating earlier lawful processing; separately necessary statutory records must be explained and restricted appropriately. Do not quietly switch legal bases merely to avoid withdrawal.

A complaint gets a named investigator, appropriate enquiries, progress updates and a reasoned outcome. Keep the complaint route independent from recruiting decisions and do not disadvantage a candidate for exercising rights. Link any associated incident or rights request, but maintain their distinct deadlines and evidence.

## 7. Email, chat and client ATS handling

### Before a new disclosure — proposed policy for approval

- Identify the client legal entity, role/purpose and actual recipient; assess controller/processor/joint-controller responsibilities and the required terms.
- Confirm the candidate's recorded named-client sharing approval under the proposed business policy. Assess the separate legal basis, including Conduct Regulations confidentiality requirements where applicable. A current-employer disclosure requires specific prior permission that has not been withdrawn; services must not be conditional on it where regulation 28(2) applies.
- Check purpose, restrictions, version, content minimisation, recipient authority and applicable international-transfer mechanism. Avoid unnecessary sensitive data.
- Use only approved business channels/accounts. Do not post CVs to public links or broad chat groups. Client ATS uploads must use the correct tenant and vacancy, not merely a matching company name.
- Record an intended disclosure before dispatch: actor, subject/document version, recipient, channel, purpose/basis, candidate approval reference and transfer/terms reference. Record sent/failed/unknown outcome and message/upload reference without copying CV content or bearer URLs into the register.
- Prefer controlled expiring access where a reviewed client-access design exists. That feature is not currently implemented, and viewing still cannot prevent screenshots or copies. Email/chat/ATS sharing remains external-copy handling, not a copy-prevention guarantee.

### When information is corrected, restricted or erased

Article 19 requires communication of relevant rectification, erasure or restriction to recipients unless impossible or disproportionate effort; assess and record any exception and identify recipients to the person if requested. Do not use this exception as a routine excuse for missing records. Publicly disclosed information may also require the reasonable steps relevant to Article 17(2).

For a processor acting for Agora, issue the required instruction under the processing agreement, obtain appropriate confirmation and track unresolved effects. For an independent client controller, communicate the action and scope, request a response, and assess any stated independent retention justification. Do not incorrectly tell the candidate that every client is our processor or must follow our retention period.

Track at least: notification pending/sent/failed, response pending/received, deletion or correction confirmed, restricted retention with stated reason, and unknown/disputed outcome. “Message sent” is not “copy deleted”. Escalate failed delivery or non-response and record the assessment. Do not delay the candidate's legal response until every independent recipient replies; explain the actual verified outcome, outstanding follow-up and applicable rights. Completion of Agora's obligations must not be presented as proof that every external copy has disappeared.

## 8. Recovery ledger, completion and response

Keep legal-response status separate from technical completion. A case may have a response sent while deletion jobs, backup expiration or recipient follow-up remain tracked.

For accepted restriction/erasure, record independently recoverable case/intention evidence before execution where practicable; make the live restriction effective without waiting for a remote service. Persist the decision and outbox atomically, then deliver idempotently to the independent ledger. Alert on gaps/outages. Do not treat an outbox in the same database as independent recovery.

Before marking operational completion, the reviewer confirms:

- identity/scope/authority and the accepted or declined parts;
- all required local and processor effects completed or explicitly justified retained exceptions;
- required recipient notifications completed or a reviewed legal exception, with remote-deletion certainty described honestly;
- required independent ledger acknowledgment and a tested beyond-use/expiry treatment of any backup copies;
- a timely response explaining the result, retained subset, outstanding external follow-up, complaint route and relevant rights;
- scheduled follow-up/expiry of residual evidence and copies.

Never manufacture a success state to meet a deadline. Escalate blockers and communicate them promptly. Do not claim global erasure while known copies are unaccounted for. Conversely, a separate controller's documented lawful retention is not something Agora can technically erase by decree.

## 9. Incidents and misdirected CVs

Treat a CV sent to the wrong recipient, exposed in a public chat/link, lost on a device, or disclosed through an unauthorised account as a potential personal-data breach. Contain further disclosure, preserve minimal incident evidence, revoke controllable access and notify the privacy/security owner immediately.

Assess notification to the ICO without undue delay and, where feasible, within 72 hours of awareness unless the breach is unlikely to result in risk to individuals' rights and freedoms. Inform affected people without undue delay where the high-risk threshold applies, subject to applicable exceptions. Record the assessment even where no notification is required. These are breach rules, not the SAR or complaint clocks. Do not send notifications or contact real recipients automatically from development tooling.

## 10. Response outlines for operator use

### Receipt

“We received your request on [date] concerning [scope]. Your reference is [case ID]. [Owner/contact] is handling it. We will respond within the applicable period. If we reasonably need clarification or information to verify identity, we will explain what is needed and why.”

### Recipient notification

“We previously disclosed [minimal record/version reference] to [verified recipient] for [purpose]. Following a verified [correction/restriction/erasure] request, [precise action/information]. Please confirm the action taken, or explain your role and any independently applicable retention obligation. Do not circulate the original CV again in your reply.”

### Outcome

“We have [verified actions]. We retain [specific limited information, reason and criteria/end point, if any]. [Recipients] have been notified; [confirmed actions and unresolved/independent-retention outcomes]. Backup treatment is [actual beyond-use/expiry arrangement]. [Any follow-up and contact]. If you disagree or have a concern, you can complain to us and to the ICO.”

### Complaint acknowledgment

“We received your data-protection complaint on [date], reference [ID]. [Owner] will investigate [issues], keep you informed and provide the outcome without undue delay. Any separate rights request is being tracked under [reference/deadline].”

Fill these from reviewed facts. Do not send drafts, generic promises, sensitive attachments or unapproved legal conclusions.

## 11. Sources and review record

Official sources checked 2026-09-22. Some general rights pages are marked under review following DUAA; the subject-access guide is updated 16 July 2026. Confirm current guidance and transitional rules when adopting the procedure.

- [ICO: subject access](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/).
- [ICO: rectification](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-rectification/), [restriction](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-restrict-processing/), and [erasure, recipient notifications and backups](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/).
- [ICO: individual rights in data sharing](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/data-sharing-a-code-of-practice/the-rights-of-individuals/).
- [ICO: complaints](https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/) and [DUAA commencement/transitional provisions](https://www.legislation.gov.uk/uksi/2026/82/note/made).
- [ICO: personal-data breaches](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/).
- [Conduct Regulations, confidentiality](https://www.legislation.gov.uk/uksi/2003/3319/regulation/28) and [recordkeeping](https://www.legislation.gov.uk/uksi/2003/3319/regulation/29).
- [ICO: international transfers](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-brief-guide-to-international-transfers/).

Adoption record: `[APPROVE: owner, deputy, legal review, effective date, training evidence, tested tooling, scheduled review date]`. Technical implementation is governed by the separate [workflow design](../architecture/privacy-workflow-design.md), not by treating this policy text as executable authorisation.

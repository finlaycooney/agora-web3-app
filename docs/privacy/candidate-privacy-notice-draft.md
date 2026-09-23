# Candidate privacy notice — review draft

Version: 0.1 · Prepared: 2026-09-22 · Status: NOT APPROVED FOR PUBLICATION

This is proposed candidate-facing wording, not evidence that the described controls are already operating. Resolve every `[CONFIRM]`, `[DECIDE]` and `[APPROVE]` item, approve the lawful-basis assessments and retention schedule, and verify the actual service before publication. Obtain appropriate UK privacy/recruitment legal review. Do not publish the internal approval notes or present this document as a compliance certification.

## Internal publication checklist

- `[CONFIRM]` Exact controller legal name, trading name, registered/contact address and monitored privacy email. The repository footer says “Agora4, part of Agora Group Limited”; this does not establish the correct controller or registered details.
- `[CONFIRM]` Privacy owner and deputy, any required DPO, ICO fee/registration position, and any applicable overseas representative.
- `[CONFIRM]` Candidate/client countries; whether Agora introduces permanent hires, supplies temporary workers, or does both; applicability of Great Britain versus Northern Ireland recruitment rules.
- `[APPROVE]` The purpose-by-purpose lawful bases below, legitimate interests assessments (LIAs), any special-category/criminal-record conditions, and the [retention schedule](retention-schedule-draft.md).
- `[CONFIRM]` Actual hosting, database, file storage, email, chat, ATS, analytics, backup and support providers, their roles, locations and transfer arrangements. Source code refers to Vercel, Supabase and optional GitHub authentication; deployment and contracts have not been inspected.
- `[APPROVE]` Named-client sharing approval as an operational policy and establish a way to record it. Do not promise it before it is followed.
- `[CONFIRM]` Current automated-decision practices, including any external ATS or client-side activity. The inspected application does not implement automated candidate ranking or hiring decisions, but that does not establish every recipient's practices.
- `[CONFIRM]` The [rights and complaints procedure](rights-request-procedure-draft.md) is staffed and usable, including for legacy submissions and external copies. An unfinished platform must not be represented as the only way to exercise rights.

---

## Proposed candidate-facing notice

### 1. Who we are and how to contact us

`[CONFIRM: legal entity]`, trading as `[CONFIRM: Agora/Agora4]` (“Agora”, “we”, “us”), provides recruitment services. We are responsible for the personal information we use for our own recruitment, candidate-relationship and legal-recordkeeping purposes.

Contact us about your information or a privacy concern:

- Privacy contact: `[CONFIRM: monitored email or other accessible contact]`
- Postal address: `[CONFIRM: address]`
- Data protection officer or representative, where applicable: `[CONFIRM: details, or remove if not applicable]`

A prospective employer may be separately responsible for the information it receives about you. Where we act on a client's instructions or jointly determine a recruitment activity, we will explain the relevant arrangement and contact details. You do not need an Agora account to contact us about your rights.

### 2. Information we use and where it comes from

Depending on your interaction with us, we use:

- Your name, contact details, CV, employment and education history, skills, qualifications, professional links and information you provide about your achievements.
- The role you apply for, application reference, submission date, correspondence, recruitment progress, and relevant feedback from you or prospective employers.
- Records of which clients received your information, the information shared, your sharing instructions, and any privacy requests or complaints.
- Limited service and security information necessary to operate the website and protect accounts and applications. `[CONFIRM: actual data categories and collection methods after the website/analytics inventory.]`

We obtain information directly from you when you apply or communicate with us. If you choose optional GitHub sign-in, we obtain the profile information used for that sign-in and prefill. You can apply without GitHub. `[CONFIRM: final provider fields and token-retention practice; the current code stores an access token in its session-token payload and that practice requires review.]`

Where we receive information from clients, referees, referrals or public professional sources, we will explain the relevant source and categories when required. `[CONFIRM: which of these sources Agora actually uses; remove unused sources rather than implying a wider collection programme.]` A publicly available profile is not permission for unrestricted collection or reuse.

Please provide information relevant to your application. Do not include identity-document copies, financial-account details, or sensitive information such as health, ethnicity, religion or criminal-record information unless we have specifically explained why it is needed and how to provide it safely. If reasonable adjustments or another sensitive matter need to be discussed, contact `[CONFIRM: restricted contact route]`. We assess the necessity and additional legal conditions before using or sharing such information; ordinary recruitment interests alone are not sufficient for special-category data.

### 3. Why we use your information

The following table must be finalised before publication. Each selected basis must describe the actual activity; alternatives must not be left as an unexplained menu.

| Purpose | Proposed basis and approval required |
| --- | --- |
| Assess and progress your application; communicate with you about a role; introduce you to a relevant prospective employer | `[APPROVE]` Legitimate interests under UK GDPR Article 6(1)(f): providing recruitment services, matching relevant candidates and roles, and helping clients recruit. Record the necessity and balancing assessment. Use Article 6(1)(b) instead only for processing actually necessary for a contract with you or steps you request before that contract; our contract with a client is not enough. |
| Keep required recruitment records and respond to applicable legal obligations or rights requests | `[APPROVE]` Legal obligation under Article 6(1)(c), identifying the specific obligation and records it requires. Review the Conduct Regulations where applicable; this is not a reason to retain every CV or conversation indefinitely. |
| Protect our service, investigate misuse, and establish or defend legal claims where necessary | `[APPROVE]` Legitimate interests under Article 6(1)(f), with a documented assessment and limited records/retention; identify any separate applicable legal obligation rather than assuming one. |
| Keep in touch about future opportunities beyond your current application | `[DECIDE]` Separate, optional talent-pool purpose. Proposed approach: specific, withdrawable opt-in consent under Article 6(1)(a), with an approved expiry and clear scope. Do not activate or publish this as an existing practice until approved. Electronic marketing needs a separate PECR assessment. |

We do not treat merely receiving a CV, acknowledging this notice or applying for one role as agreement to indefinite talent-pool use, unrelated marketing, public publication or external AI processing.

If processing needs special-category or criminal-offence information, we also need the applicable additional legal condition and safeguards. `[CONFIRM: disclose any such intentional activity, its specific conditions and safeguards; otherwise keep it out of routine collection and sharing.]`

### 4. Sharing with prospective employers and service providers

**Proposed sharing policy — publish only once adopted:** before sending your identifiable CV to a prospective employer, we will identify the client and role or specific recruitment purpose and record your approval. If a client must remain unnamed during initial discussions, we will not send your identifiable CV until the disclosure is resolved and the approval is recorded. This is a business confidentiality safeguard; it does not by itself determine our UK GDPR lawful basis.

We may send the relevant CV version, application details and recruitment communications to the approved client through an approved email service, business chat service or the client's applicant tracking system (ATS). `[CONFIRM: actual channel/provider categories and any material limitations.]` We minimise the information shared and do not use public chat channels, indiscriminate groups or personal accounts as an approved distribution route.

We will not disclose your information to your current employer without your prior permission. Where regulation 28(2) of the applicable Conduct Regulations governs the disclosure, that permission must not have been withdrawn and our services must not be conditional on you giving it.

A client may keep its own copy and make its own recruitment decisions under its privacy notice. Deleting a document in Agora does not remotely delete an email attachment, chat download or ATS copy already received by someone else. When required, we notify recipients of corrections, restrictions or erasure and track the action or response. We remain responsible for our own obligations and will explain any relevant limitations or independently justified retention rather than promise universal deletion.

We also use approved suppliers to host the service, store information, provide communications and support, and maintain security and recovery. `[CONFIRM: name key providers or provide sufficiently specific categories and an accessible current list.]` Where a supplier processes information on our behalf, appropriate processing terms and safeguards are required. A client's ATS is not automatically our processor; the actual arrangement determines its role.

We may share necessary information with professional advisers, regulators or authorities where there is a lawful reason to do so. `[CONFIRM: actual categories and circumstances.]` We do not add unrelated recipient categories merely because they are common in generic notices.

### 5. International access and transfers

`[CONFIRM: countries/regions, receiving legal entities, hosting/support access and the actual transfer mechanisms.]`

If we initiate a restricted transfer to a separate organisation outside the UK, we use an applicable UK adequacy regulation, appropriate safeguards such as the UK IDTA or UK Addendum with the required transfer assessment, or a properly assessed exception. We do not assume that a UK hosting region eliminates international access, or that your approval to share a CV replaces the transfer rules.

You can contact `[CONFIRM: privacy contact]` for information about the safeguards and how to obtain a copy, subject to necessary redactions. If EU/EEA data protection requirements also apply to our activities, we will provide the relevant additional information and arrangements. This must be assessed from our establishment and activities, not citizenship alone.

### 6. How long we keep information

We keep information for the purpose for which it is needed and apply an approved retention schedule. The criteria include the status and conclusion of recruitment services, any separately agreed future-opportunities purpose, applicable recordkeeping duties, necessary claims handling and approved retention exceptions.

`[APPROVE: replace this paragraph with the approved periods/criteria from the retention schedule, including the actual statutory-record classification, talent-pool expiry if enabled, temporary exports, and backup expiration.]`

Where the Conduct Regulations apply, specified agency records may need to be kept for at least one year from creation and, for the relevant applicant particulars, at least one year after we last provide the applicant with recruitment services. This does not authorise indefinite retention, or mean that every unsuccessful or untouched application has the same rule. We separate any required restricted record from ordinary sourcing access.

Where erasure is appropriate, we remove or redact the relevant live information. Backup copies may remain until the approved overwrite/expiry point, with access and use restricted and deletion/restriction decisions reapplied before restoration is made available. `[CONFIRM: actual enforceable backup period and process; do not claim these safeguards already operate merely because they are designed.]`

Clients acting as separate controllers may have their own justified retention periods. We explain and follow our own obligations, including required recipient notifications.

### 7. Your choices and rights

Depending on the circumstances, you can request access to your personal information, correction of inaccurate or incomplete information, erasure, restriction of use, and portability where that right applies. You may withdraw consent for processing based on consent without affecting the lawfulness of processing before withdrawal.

**Your right to object:** you may object to processing based on legitimate interests on grounds relating to your situation. You may object to direct marketing at any time; we must stop using your information for that marketing.

Contact `[CONFIRM: privacy contact]`, or tell the member of our team you are dealing with. You do not have to use particular legal words, a special form or an Agora account. We may make reasonable and proportionate checks to protect your information from disclosure to someone else. We normally respond without undue delay and within one calendar month, subject to applicable identity/clarification rules and lawful extensions. We will explain any extension, refusal, or retained information and the reasons for it.

If you choose not to provide information genuinely needed to assess or progress an application, we may be unable to provide that part of the service. GitHub sign-in and any future talent-pool opt-in are optional. `[CONFIRM: distinguish mandatory fields from genuinely optional information in the actual form.]`

### 8. Automated decisions and website technologies

`[CONFIRM before publication]` We do not use solely automated decisions with legal or similarly significant effects on you in the current Agora application. Ordinary validation of form fields is not an automated assessment of your suitability. Any future scoring, profiling, AI processing or significant automated decision-making requires a separate assessment, safeguards and updated information before use. A client's own ATS practices must be explained by the responsible client.

`[CONFIRM: link to the actual cookie/technology information and controls.]` Website authentication, analytics and similar technologies must be described according to what they actually do. We assess the applicable PECR consent requirements or specific exceptions; calling a service “analytics” or “cookieless” does not settle that assessment.

### 9. Questions and complaints

You can complain to `[CONFIRM: privacy contact and accessible complaint method]` if you are concerned about how we use your information. We acknowledge data-protection complaints within 30 days, investigate and keep you informed, and communicate the outcome without undue delay. A complaint and a request to exercise a right can run together; a complaint acknowledgment is not a substitute for responding to a rights request.

You also have the right to complain to the Information Commissioner's Office (ICO): https://ico.org.uk/make-a-complaint/. Other relevant supervisory-authority rights may apply where another jurisdiction's law governs the activity.

### 10. Updates

Notice version: `[APPROVE: published version]`. Effective date: `[APPROVE: date]`.

We will make updated privacy information available when our practices change and provide any additional information or choices required before a new use. An updated notice does not retrospectively create consent or evidence that an earlier notice was shown.

---

## Internal source and review notes

Official sources checked on 2026-09-22. Recruitment guidance below is explicitly marked draft and under review by the ICO; it is not presented as final guidance. Some older ICO pages remain under review following the Data (Use and Access) Act 2025. Check current law and guidance again at approval/publication.

- [ICO: information to include in a privacy notice](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/).
- [ICO: legitimate interests](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/what-is-the-legitimate-interests-basis/).
- [ICO draft recruitment guidance: allocation of controller/processor responsibilities](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/responsibility-for-data-protection-compliance-during-the-recruitment-process/).
- [Conduct Regulations 2003, regulation 28](https://www.legislation.gov.uk/uksi/2003/3319/regulation/28) and [regulation 29](https://www.legislation.gov.uk/uksi/2003/3319/regulation/29). Confirm applicability, exemptions and Great Britain territorial scope; Northern Ireland has separate rules.
- [ICO: international transfers](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-brief-guide-to-international-transfers/).
- [ICO: guide to subject access, updated 16 July 2026](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/).
- [ICO: handling data-protection complaints](https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/); [2026 commencement provisions](https://www.legislation.gov.uk/uksi/2026/82/note/made) bring the relevant complaints provisions into force on 19 June 2026, subject to transitional rules.
- [ICO: current PECR storage/access exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions).

The [workflow design](../architecture/privacy-workflow-design.md) identifies the technical and operational controls needed to make this wording accurate. None of these drafts supplies an approved LIA, processor agreement, international-transfer assessment, or jurisdiction-specific legal opinion.

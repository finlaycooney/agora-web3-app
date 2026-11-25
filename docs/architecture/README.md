# Recruitment platform implementation

Current implementation evidence and remaining gates are recorded in [implementation readiness](implementation-readiness.md). The historical specification baseline below describes delivery step 1 of the [safe implementation plan](agora-implementation-plan.md), not a production activation.

## Privacy review drafts

The owner reports live candidate intake, intended in-app CV viewing and client sharing by email, chat or ATS. Review the [complete privacy workflow design](privacy-workflow-design.md), [candidate notice](../privacy/candidate-privacy-notice-draft.md), [retention schedule](../privacy/retention-schedule-draft.md) and [rights/complaints procedure](../privacy/rights-request-procedure-draft.md) together. These are unapproved drafts, not published policies or implemented privacy controls. The document and privacy data foundations now exist as reviewed migrations exercised only with synthetic fixtures; policy publication and production activation remain separate gates.

## Historical specification baseline

- [Accepted ADR-001 revision 3](agora-adr-001.md) — supplied by the product owner, preserved verbatim.
- [Accepted implementation plan](agora-implementation-plan.md) — supplied by the product owner, preserved verbatim.
- [Column-level schema and relationships](schema-specification.md) — foundation, staff authorization and document/privacy foundation batches are implemented; intake and later entities remain proposed.
- [Authorization and transaction contracts](transaction-contracts.md) — implemented staff routines plus proposed workflow contracts.
- [Decisions, acceptance checklist and baseline evidence](implementation-readiness.md).

The foundation, staff authorization and document/privacy data foundations are implemented as portable PostgreSQL 17 migrations verified on disposable databases with synthetic fixtures. New staff/privacy/document-facing routes remain unwired and intake, effects/jobs, backfill and recovery remain proposed; the legacy intake path stays active. No production migration, production switch or paid service is included. The combined local changes also include a candidate-form validation improvement: clearer professional-URL errors, accessible inline feedback, and unit/browser regression coverage. This does not activate the proposed recruitment platform.

The original patch records a clean cloud checkout on 2026-09-21, with fetched GitHub `main` at `1537971083cfed8ff83489a976b9c5f2608b33ae` and PR #1 reported merged. Those historical observations do not establish the current remote or production state. On 2026-09-22 the patch was applied to the local `fix/candidate-applications` checkout, preserving the four existing form/URL-validation edits. The owner requested that those edits be included with this work. No user changes were reset or stashed.

Future PRs should link their acceptance evidence to the checklist rather than treating this specification as evidence that its invariants already hold.

# Recruitment platform implementation

This is delivery step 1 of the [safe implementation plan](agora-implementation-plan.md), not a production activation.

- [Accepted ADR-001 revision 3](agora-adr-001.md) — supplied by the product owner, preserved verbatim.
- [Accepted implementation plan](agora-implementation-plan.md) — supplied by the product owner, preserved verbatim.
- [Proposed column-level schema and relationships](schema-specification.md).
- [Proposed authorization and transaction contracts](transaction-contracts.md).
- [Decisions, acceptance checklist and baseline evidence](implementation-readiness.md).

The schema and contracts are **proposed for review**, not yet accepted or implemented. Review them before committing dependent migrations, as required by the plan's PR 1 exit gate. No database migration, production switch or paid service is included in this step. The combined local changes also include a candidate-form validation improvement: clearer professional-URL errors, accessible inline feedback, and unit/browser regression coverage. This does not activate the proposed recruitment platform.

The original patch records a clean cloud checkout on 2026-09-21, with fetched GitHub `main` at `1537971083cfed8ff83489a976b9c5f2608b33ae` and PR #1 reported merged. Those historical observations do not establish the current remote or production state. On 2026-09-22 the patch was applied to the local `fix/candidate-applications` checkout, preserving the four existing form/URL-validation edits. The owner requested that those edits be included with this work. No user changes were reset or stashed.

Future PRs should link their acceptance evidence to the checklist rather than treating this specification as evidence that its invariants already hold.

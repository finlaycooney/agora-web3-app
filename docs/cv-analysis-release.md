# CV analysis release checkpoint

This checkpoint lets a recruiter explicitly choose a Telegram PDF or DOCX to
create a private candidate draft, including attachments in messages without text.
It retrieves the validated CV, extracts text locally in an isolated parser, then
uses the configured model to propose profile information with document evidence.
Existing CVs on open drafts can be analyzed through the same review flow.

A file attachment does not identify its sender as the candidate. The recruiter
must choose the CV; missing names, email and other required information remain
visible. Existing duplicate review and the primary email/CV requirements still
apply. Human edits, including cleared fields, are protected from late results.

## Review and privacy

Analysis and its evidence remain private to the connecting recruiter. Unfinished requested analysis and pending field suggestions block approval on
the server as well as in the interface. Recruiters can cancel unfinished analysis
and resolve field suggestions. Complete drafts use ordinary candidate approval;
there is no second mandatory confirmation for extracted text.

Candidate approval retains the exact parsed text with its approved document by
default. Recruiters can optionally exclude that text and retain just the approved
profile fields and CV. This checkpoint does not index
CV text for semantic search; that requires a separate change enforcing document
permissions. Current profile search continues to index its existing fields.

The text parser does not perform OCR. Image content can contain information that
is absent from extracted text, so reviewers must consult the original CV. Image-
only, encrypted, malformed and over-limit files produce explicit failure states.
No successful result is silently shortened to fit a limit. Documents must be
PDF/DOCX within 4 MiB, 50 PDF pages or 2,000 DOCX paragraphs, and 64 KiB of text.
Headers, footers, tables and supported notes are included in DOCX extraction.

## Deployment order

Apply migration `20261002200000_cv_analysis.sql` and deploy the application before
starting the CV analysis worker. Keep broad intake rollout disabled until live
acceptance. Use the pinned parser image and the worker's private configuration;
never give the Mac database credentials or a general storage credential. The
hosted content endpoint authenticates the scoped worker and verifies the current
CV's revision, length and hash before returning its bytes.

The parser container has no network or credentials, a read-only filesystem and
bounded CPU, memory, temporary storage, output and execution time. The model
adapter runs outside that parser and receives only the bounded extracted text.
Use the same explicit provider configuration policy as Telegram text extraction.

Configure and verify hosted maintenance as described in
[the source-retention release](telegram-retention-release.md). Closed, resolved
private analysis artifacts are eligible for bounded cleanup; a reviewed canonical
artifact is preserved with the approved CV unless the recruiter excluded it. The scheduler reports
`analysesPurged` alongside existing aggregate counters and continues while there
is deletion progress. Earlier deployments without the additive counter remain
compatible during rollout. An unconfigured scheduler is not active cleanup.

## Acceptance gates

Install the pinned parser test dependencies with
`npm ci --prefix services/cv-analysis-worker --ignore-scripts` and build its image
with `docker build -t agora-cv-parser:v1 services/cv-analysis-worker`. Run the
focused unit checks and `npm run test:cv-analysis`, then lint, type-check and build. The runtime acceptance must use
real PDF/DOCX bytes and the isolated parser, including a DOCX contact email in its
header. Synthetic model responses verify delivery, provenance and review rules;
they do not establish live model accuracy.

Verify attachment-only creation, repeat clicks, missing-field readiness, protected
human edits and clears, Include/Exclude, approval, document replacement, owner and
document permissions, explicit unreadable-file errors, and lost acknowledgements
at both parsing and extraction stages. After cleanup, approved CVs and included
reviewed text must survive, while exact retries cannot repeat effects or restore
private sources.

Live acceptance still requires the recruiter's Telegram API credentials and login,
a configured extraction provider, and a registered scoped Mac worker. Full initial
history import is supported; continuous import of subsequently sent messages is a
separate checkpoint. This change does not remove messages from Telegram itself.

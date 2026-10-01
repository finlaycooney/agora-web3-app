# Telegram CV retrieval checkpoint

Recruiters can retrieve a referenced Telegram PDF or DOCX into their private
candidate draft, review it through the existing private preview, and approve the
candidate only when all required fields are present. Choosing an attachment does
not approve its contents or share the draft. Existing manually uploaded CVs are
never automatically replaced.

## Deployment

Apply `20261002170000_telegram_cv.sql` after the extraction migration while the
Telegram feature remains disabled. Deploy the hosted retrieval endpoints and
update the outbound Mac connector together. The hosted application uses its
existing private CV storage credentials. The Mac keeps its Telegram session and
scoped platform token; it receives no database or general storage credentials and
requires no incoming port.

A live Telegram connection to the account that supplied the messages is required
for retrieval. Imported text extraction can continue while disconnected, but a
file cannot be downloaded from a different connected account. The old app has no
configured Telegram API credentials to reuse; provision those privately and let
the recruiter complete QR/2FA connection before a live demonstration.

## File and review boundaries

Only supported files within the existing 4 MiB CV limit are eligible. The Mac
re-fetches the exact source message and document before requesting bytes. A
changed or deleted attachment is visible to the recruiter instead of silently
substituting another file. Each network read has a deadline and download progress
is bounded and resumable. Complete byte counts and server-side hashing protect
against accepting a partial transfer after cancellation or an interrupted request.

The host applies the existing filename, byte-limit and detected PDF/DOCX type
checks before attaching a file. These are upload-format checks, not a claim of
malware scanning or complete document parsing. Files stay in private storage with
short-lived preview/download access through the existing authorization flow.

Manual CV uploads, draft discard and candidate approval must fence late retrieval
results. Unrelated profile edits can proceed, and the review interface preserves
unsaved edits when the document arrives. Files referenced by multiple drafts get
separate candidate-target storage objects; a shared Telegram attachment does not
establish that multiple people share the same CV.

## Recovery and remaining work

A lost upload acknowledgement must replay the same durable completion without
attaching the document twice. Storage reservations are created before writes, and
uncertain outcomes remain eligible for reference-aware cleanup. Cancellation and
revoked permissions must stop further work and prevent final attachment.

This checkpoint does not itself remove raw conversation sources or provide
semantic search. Source-retention holds must remain until attachment retrieval
and candidate decisions settle. Keep broad rollout disabled until the remaining
search, cleanup and live-account acceptance checks are complete.

## Verification

`npm run test:telegram-cv` runs disposable database, actual connector-runner and
authenticated browser tests. The cross-component runner uses a valid PDF larger
than 1 MiB, restarts after the first encrypted chunk, and proves that resumed
retrieval does not download that chunk again. A recruiter changes profile fields
during retrieval; those changes survive final document attachment.

The test loses both a successful storage-write acknowledgement and the final
attachment acknowledgement. It covers Supabase's documented duplicate-upload
response, verifies the reserved object's bytes, then renews the Telegram connection
lease and replays the committed receipt without another body read or storage write.
Actual pinned SDK constructors and error classes are checked offline. All Telegram
responses and storage objects in these tests are synthetic; real-account download
acceptance still requires the recruiter's configured account.

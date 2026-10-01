# Private candidate extraction checkpoint

This checkpoint turns imported Telegram text into private candidate drafts. The
recruiter starts extraction for selected chats, reviews suggested fields against
source quotes, resolves conflicting suggestions, and adds a validated CV before
approval. Existing candidate required fields and duplicate checks remain the
approval authority. The model never approves candidates or edits shared records.

## Release and setup

Apply `20261002160000_telegram_extraction.sql` after the history migration, using
the existing migration operator and with `TELEGRAM_INTAKE_ENABLED` disabled.
Deploy the hosted endpoints and the separately configured Mac extraction worker.
The Mac uses the existing scoped worker token and receives no database or general
storage credential. Its provider endpoint, model and credential file are private
local configuration. Use an explicitly configured OpenAI-compatible provider;
there is no silent heuristic fallback or default live destination.

Extraction uses already imported text and does not require Telegram to remain
connected. The queue consumes bounded immutable batches and continues through
currently unprocessed imported rows. Press Extract again for rows imported after
that queue has finished. Provider outages or invalid results leave work visibly
retryable; they do not mark messages successfully extracted.

## Review and identity

Names and usernames are not identity keys. Observed Telegram sender IDs and
quote-supported email addresses can bind a private subject to its draft. The
model must distinguish the sender from the person being discussed, especially in
referrals and forwarded conversations. Ambiguous subjects remain separate drafts.
Source quotes establish where a suggestion came from; they do not prove the
model's interpretation is correct.

Manual edits, including clearing a field, are protected. Conflicting extracted
values become suggestions for explicit application or dismissal. Resolve pending
suggestions before approval. Later batches cannot recreate or overwrite a person
whose draft was already reviewed. Approved candidate fields remain authoritative.

An attachment suggestion contains only the imported filename and metadata. It is
not a downloaded, scanned or validated CV and never satisfies the CV requirement.
Manual PDF/DOCX upload uses the existing validation and upload workflow. Automatic
Telegram attachment retrieval remains a separate checkpoint.

## Retention and remaining work

This extraction release retains private raw history and immutable batch sources.
The existing draft evidence cleanup does not remove those other copies. Batch
review records a recruiter's acknowledgement; it does not claim all raw sources
were purged. The subsequent cleanup work must account for extraction batches,
all draft/proposal references and attachment jobs before erasing raw history,
snapshots, evidence and derived private vectors and updating storage counters.
No unclassified source is silently deleted.

Semantic indexing/search and automatic CV retrieval are not supplied by this
checkpoint. Keep the overall Telegram feature disabled for broad use until the
remaining stages, scheduled cleanup and a deliberate real-account smoke test
have been verified. Synthetic provider/database/browser tests validate protocol
and review behavior; they do not establish live model extraction quality.

## Verification

`npm run test:telegram-extraction` runs the disposable PostgreSQL tests, the
real extraction runner against a synthetic loopback provider, and the authenticated
browser workflow. The runtime test imports 85 messages, processes 40/40/5-message
batches after disconnecting Telegram, loses a committed acknowledgement, restarts
from encrypted state, and verifies that retry neither creates another draft nor
calls the provider again. Provider outages and fabricated quotes remain explicit
failures until successfully retried. The test also checks retained Telegram
identity and configured/reported model provenance.

The provider protocol and source validation can be tested without a live account.
A production demonstration still requires an explicitly configured provider and
a recruiter-led Telegram connection. Synthetic results are not a substitute for
reviewing actual extraction quality before enabling the feature broadly.

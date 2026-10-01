# Telegram chat selection and history import

This checkpoint follows the private draft inbox and Telegram connection work. A
recruiter discovers their connected account's chats, chooses individual chats or
up to 50 on the visible page, and imports their full available history. Imports
store message text, sender identifiers and usernames, reply/forward context, and
attachment metadata privately. They do not download attachment bytes, extract
candidate drafts, or enable semantic search yet.

## Release

Keep `TELEGRAM_INTAKE_ENABLED` off while applying the additive migrations in order.
Apply `20261002150000_telegram_history.sql` after the intake and connection
migrations, using the existing migration operator. The hosted worker login still
has only `app_telegram_worker`; the Mac receives no database or storage password.
Update the separately installed Mac connector before enabling import controls.
Use Node 22 and the pinned service lockfile. Telegram API credentials and session
files remain private on the Mac as described in the connector README.

The recruiter connects Telegram, opens `/staff/telegram-intake/chats`, discovers
chats, and selects the ones to import. Discovery includes normal and archived
chats. Progress shows stored message counts rather than an estimated percentage.
The Mac must remain awake and connected; interrupted work resumes from committed
pages. A reconnect changes the connection generation and requires explicit
Resume. Connecting another Telegram account never merges its history with the
previous account's records.

## Volume, retries and retention

Each import turn processes one bounded page. A message page and its next cursor
commit together; a lost acknowledgement can be retried without inserting the
same page twice. Jobs rotate between selected chats. Telegram flood waits pause
the account until the stored retry time, leaving connection control responsive.
Pause and cancel invalidate in-flight leases. Cancel stops future work and
retains private imported records; it is not a delete action.

Full history means the snapshot Telegram makes available when import begins.
Deleted or inaccessible messages cannot be recovered. New messages and subsequent
edits require the later incremental-sync checkpoint. An import is complete only
after Telegram returns an empty raw page; service messages and attachment-only
messages are retained rather than mistaken for an empty conversation. Unavailable
message placeholders preserve only their IDs, with no invented date or content;
they count as stored records and do not stop access to older available messages.

Default per-recruiter capacity is 200,000 messages, 256 MiB of stored JSON message
content, and 20,000 discovered chats. These are visible backpressure limits: a
capacity pause does not advance the cursor, discard records, or mark the import
complete. An operator can raise the bounded quotas before resuming. Oversized
records and inaccessible peers also pause explicitly instead of being skipped.

Pending ingestion lives in separate private tables from draft evidence. Draft
approval cannot remove messages awaiting extraction. The extraction checkpoint
must move source references into evidence atomically, and release ingestion bytes
only once all required processing has committed. Approval/discard can then remove
evidence when no unresolved draft references it, while the reviewed candidate
profile remains the source of truth. Add scheduled cleanup and retention
observability before broad real-data ingestion.

## Verification and activation boundary

`npm run test:telegram-history` runs database boundaries and the authenticated
browser workflow against disposable PostgreSQL. Connector unit tests exercise
paging, retries and provider failures without connecting to a real account.
The installed SDK smoke/type checks inspect the pinned Telegram API offline.

Before activation, run a deliberate real-account smoke test with operator-supplied
credentials: connect, discover both chat folders, select a test chat, confirm
message/attachment-only counts, pause/resume across a Mac restart, and disconnect.
No synthetic test establishes Telegram's live-account behavior or imports actual
conversations. Production migrations, real account login and feature activation
are separate release actions.

The next checkpoint is evidence-backed extraction into reviewable candidate
drafts, including CV retrieval and validation, followed by semantic indexing and
retrieval of approved profiles and owner-private drafts. Import counts must never
be presented as extracted candidates or searchable profiles before those stages
have actually completed.

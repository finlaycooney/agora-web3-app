# Mac pairing release checkpoint

Recruiters can pair a Mac from Connect Telegram, compare its fingerprint, and
manage their own devices. The Mac generates its credential locally. Invitations
expire after ten minutes; interrupted requests resume with the original identity.
Device renewal preserves the credential and pending work. Revocation immediately
stops hosted access; it does not erase local files or confirm Telegram logout.

## Deployment

Apply `20261002220000_worker_pairing.sql` before enabling the new application
version. The existing worker database connection is reused; no new hosted secret
or public Mac listener is required. Keep `TELEGRAM_INTAKE_ENABLED` disabled for
broad rollout until live account acceptance is complete. Existing worker
registration and connector configurations remain supported.

The existing retention maintenance operation now also deletes at most 100 stale
pairing records per call. Expiration and access checks take effect immediately,
even when scheduled cleanup has not been configured. Public pairing has a shared
600-request/minute budget with explicit retry timing; this bounds database work
but does not guarantee availability during abuse.

Follow [the pairing instructions](../services/worker-pairing/README.md) using a
private, nonsynchronized local directory. Normal decommission starts with an
acknowledged Telegram disconnect before revoking the device. Emergency revocation
can be immediate, with local session state preserved for later resolution.

## Acceptance evidence

- 449 unit tests pass, including private file permissions, interrupted lock
  publication, replay, and connector credential compatibility.
- Database and browser acceptance pass: owner isolation, role permissions,
  durable rejected-request budgets, fingerprint confirmation, refresh recovery,
  expiry, renewal, cancellation races, and device management.
- A real HTTP/database test runs the Mac pairing client against disposable
  PostgreSQL, loses both claim and approval replies after commit, restarts the
  client, and verifies the original token reaches the existing connector
  heartbeat workflow. Revocation then immediately denies that heartbeat.

All account data in these checks is synthetic. Pairing alone does not establish
Telegram, extraction provider, document parser, or embedding service readiness.
The remaining demo setup is the unified Mac service launcher, local Telegram API
credentials, provider authentication, and a recruiter-reviewed live import.
Continuous synchronization after initial history is a separate checkpoint.

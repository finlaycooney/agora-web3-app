# Telegram connection checkpoint

This adds `/staff/telegram-intake/connect` and a link from the private draft inbox.
A recruiter chooses their registered Mac, scans the Telegram QR code, supplies a
Telegram two-step password if required, and sees the connected account. A normal
disconnect remains pending until Telegram logout and local session cleanup are
acknowledged. Cancelling a login that was never issued to a worker is reported as
cancelled, without claiming a remote logout occurred.

This change depends on the private intake foundation in PR #29 and includes the
platform changes through PR #30. It adds connection only. Chat selection, full
history import, extraction and semantic search remain later checkpoints. It does
not send Telegram messages or mark conversations read.

## Release and setup

Keep `TELEGRAM_INTAKE_ENABLED` unset until the foundation and connection migrations
are applied and the hosted worker connection is configured. Use the existing
migration procedure; apply `20261002140000_telegram_connection.sql` after the
foundation migration. No production migration has been applied by this work.

The hosted app needs the same staff authentication, MFA and restricted
`TELEGRAM_WORKER_DATABASE_URL` as the foundation. The Mac receives a scoped worker
token, its worker ID, Telegram application API ID/hash and the hosted HTTPS
origin. Database and hosted storage credentials stay off the Mac. Follow
`services/telegram-connector/README.md` for private configuration, dependency
installation and startup. The connector runs separately from the embedding
worker; they may use the same scoped worker identity.

Register the worker through the foundation's authenticated worker endpoint, save
its token in a private local configuration, and start the connector. Its heartbeat
makes it available in the connection page. Each recruiter's account has its own
worker binding and local state directory. This checkpoint supports one Telegram
account per recruiter/organization, and does not yet include automatic Mac service
installation or browser pairing for an unconfigured worker.

## Private data and failure behavior

- Telegram session credentials remain encrypted on the Mac, scoped to hosted
  origin, worker and connection. Private files/directories use owner-only access.
- Telegram passwords are encrypted in the browser for the Mac's pinned public
  key. The hosted app accepts ciphertext only. The encryption label binds the
  connection, generation and challenge; retries cannot apply to another login.
- Password submissions become unusable after 60 seconds. Expired ciphertext is
  physically removed on the next authenticated read or claim. Add unattended
  purging before broad deployment; this checkpoint does not promise physical
  deletion during a total worker/browser outage.
- QR data is limited to Telegram login tokens with short expiry. The browser
  hides expired codes and pauses polling while hidden.
- Lease expiry, revocation and changed generations stop old work from updating
  the hosted connection. Account changes cannot bypass pending logout.
- If the Mac is offline, its state directory is lost, or its token is revoked,
  logout may remain unconfirmed. Revoke the session in Telegram Settings →
  Devices if immediate revocation is needed. The app never fabricates successful
  remote logout.
- Close the feature by disabling the flag and stopping the connector. Disconnect
  while the worker is still authorized before revoking its worker token. Keep
  session files until logout is confirmed; do not remove credentials that are
  still needed to revoke a remote session.

## Validation and remaining live check

`npm run test:telegram-connection` runs private-owner database scenarios and an
authenticated browser flow against disposable PostgreSQL. Browser tests exercise
real hosted routes with a synthetic connector, including cryptographically
verified password delivery, expired QR codes, retry and delayed logout. Root
unit tests cover connector state, encrypted storage and failure recovery without
contacting Telegram. `node services/telegram-connector/check-runtime.mjs` checks
the actual installed SDK offline after its isolated dependency installation.

A real-account smoke test still requires configured Telegram API credentials,
the deployed private connection endpoints and a deliberate QR scan by the account
owner. No real account was connected and no Telegram conversation was imported
in these synthetic checks.

The next work should add chat selection and a separate durable import queue with
paged, resumable full history. Store unprocessed imported messages separately
from draft evidence so reviewing a draft cannot delete history waiting for
extraction. Preserve private ownership, bounded pages, attachment metadata,
flood-wait backoff and explicit progress before adding the extraction pipeline.

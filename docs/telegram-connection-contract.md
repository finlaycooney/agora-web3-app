# Telegram connection protocol v1

This checkpoint implements QR login, optional Telegram 2FA, connection status and
acknowledged disconnect. It does not import chats. All endpoints are disabled
unless `TELEGRAM_INTAKE_ENABLED=1`. One connection per organization/recruiter is
supported. A connection is bound to one registered worker.

## Browser API

`GET /api/staff/telegram-connection` returns `{workers,connection}`. Each worker
is `{id,name,publicKeySpki,lastSeenAt,online}`; only active, nonexpired workers with
a registered connector key appear. `online` means heartbeat within 90 seconds.
`connection` is null or `{id,workerId,generation,status,challengeId,qrLoginUrl,
qrExpiresAt,passwordHint,passwordPending,errorCode,profile,updatedAt,cancelledBeforeStart}`. `profile`
is null or `{telegramUserId,username,displayName}`. All IDs are UUIDs except the
Telegram user ID, which is a decimal string. Generation is a positive integer.
No phone number, session string, ciphertext or private key is returned.

POST the same path; success returns the same `{workers,connection}` envelope:

- `{action:"connect",workerId}` starts/restarts login only when no connection
  exists, or its status is `failed`/`disconnected`. Repeating while active with the
  same worker returns the current state without restarting it. The worker must
  have a fresh heartbeat. A restart increments generation and changes challengeId.
- `{action:"password",connectionId,generation,challengeId,ciphertext}` is accepted
  only for that owner's current `awaiting_password` challenge. Ciphertext is
  standard base64 encoding of exactly 256 bytes. The browser imports the worker's
  base64 DER SPKI RSA-2048 public key and encrypts the UTF-8 password (1–128 bytes)
  using RSA-OAEP SHA-256 with this exact UTF-8 OAEP label:
  `agora-telegram:<connectionId>:<generation>:<challengeId>`.
  Clear the password UI immediately after encryption. The server receives only
  ciphertext, makes it usable for at most 60 seconds and reports `passwordPending`. Expired
  ciphertext is physically erased on the next authenticated status read/claim;
  before broad deployment add periodic expiry cleanup for offline accounts.
- `{action:"disconnect",connectionId,generation}` increments generation, erases
  QR/password/profile data and enters `disconnecting`. Repeating disconnect in
  that state is idempotent. It becomes `disconnected` only after the bound Mac
  reports successful remote logout and local session deletion. Exception: a
  `requested` connection that has never been leased can be cancelled immediately;
  it returns `disconnected` with `cancelledBeforeStart:true`. Show “Connection
  cancelled”, without implying a remote logout occurred. Lease history persists
  across retries until a real logout acknowledgement; a restart cannot bypass it.

Statuses: `requested`, `qr_pending`, `awaiting_password`, `connected`,
`disconnecting`, `disconnected`, `failed`. Errors are fixed codes, never raw
Telegram errors. Staff session/MFA, candidate read/write permissions and same-site
mutation checks apply. JSON responses are private/no-store. Poll at 2 seconds
while authenticating/disconnecting, 15 seconds while connected; stop when hidden.
HTTP 409 means refresh current state; 403 means access denied; 503 means retry.

## Outbound Mac API

All calls are POST `/api/telegram-connection/worker/{heartbeat,claim,update}` with
existing scoped worker Bearer token; browser Origin headers are rejected.
Heartbeat, claim and update all recheck membership and token validity. Worker
requests have a 16 KiB body limit. No Telegram session leaves the Mac.

- `heartbeat` body `{publicKeySpki}` returns `{ok:true}`. SPKI is standard base64
  DER for RSA-2048 with exponent 65537. Persist the matching private key locally;
  use the same key across restarts. Key rotation is rejected while that worker
  has any connection other than `disconnected`. Heartbeat every 30 seconds.
- `claim` body `{}` returns `{connection:null|task}`. Task is
  `{id,generation,status,leaseToken,leaseExpiresAt,challengeId,passwordCiphertext,
  passwordExpiresAt,passwordSubmissionId}`. One task per worker; disconnected connections return null.
  Claim every 20 seconds while active, every 5 seconds otherwise. Each claim
  renews a 120-second lease; an unexpired lease keeps its token. Expired leases
  receive a new token. The worker must stop/close clients when generation changes,
  claim returns null, access is denied or lease expires. A `failed` task means
  close pending auth clients and erase pending login state; do not initiate login.
- `update` body `{connectionId,generation,leaseToken,status,challengeId?,
  qrLoginUrl?,qrExpiresAt?,passwordHint?,profile?,errorCode?,passwordSubmissionId?}` returns `{ok:true}`.
  Valid generation, current token and unexpired lease are mandatory. Supported
  statuses are `qr_pending`, `awaiting_password`, `connected`, `disconnecting`,
  `disconnected`, `failed`. Once connected, updates cannot return to auth states.
  `disconnecting` accepts only `disconnecting` or `disconnected` reports.

QR updates require the task challengeId, a strict
`tg://login?token=<base64url>` URL (token 1–512 characters), and ISO expiry within
120 seconds. Refresh expiring QR tokens without changing challengeId. No general
URL, arbitrary QR image or HTML is accepted. Awaiting-password reports require the
same challengeId, may include a sanitized hint of at most 100 characters and must
never use the entered password or provider exception as the hint/error. An awaiting-password report after consuming ciphertext must include the claim
passwordSubmissionId to acknowledge and clear exactly that submission. Initial
awaiting-password reports omit it and preserve any pending submission. Connected
and failed reports clear all ciphertext. Replaying the last acknowledged passwordSubmissionId is an idempotent success
without mutating newer submissions. Other stale submission acknowledgements are
rejected; reread the claim before further action.
Ciphertexts are decrypted with the bound OAEP label and handled in memory only.

`connected` requires `profile:{telegramUserId,username,displayName}` (username
nullable, displayName at most 200 characters). A repeated connected report is
idempotent. Keep the Telegram session locally encrypted and partitioned by server,
worker and connection. On restart, reconcile connection ID/generation before using
a saved session. Claim/heartbeat continue while connected; no new QR login starts.
If the session is missing or invalid, report failed with `SESSION_MISSING` or
`SESSION_REVOKED`. Pending login expires after 10 minutes; the server changes it
to `failed` on reads/claims, clears secrets and fences the former generation.

Fixed error codes: `AUTH_FAILED`, `PASSWORD_INVALID`, `LOGIN_EXPIRED`,
`SESSION_MISSING`, `SESSION_REVOKED`, `TELEGRAM_UNAVAILABLE`, `LOGOUT_FAILED`.
Password failure stays `awaiting_password` with `PASSWORD_INVALID` so another
ciphertext may be submitted. Logout failure stays `disconnecting` with
`LOGOUT_FAILED`, retries later and never claims disconnect succeeded. Worker
outages leave visible pending work; no remote logout is fabricated. Revoked-worker
cleanup may require user revocation in Telegram's Devices screen.

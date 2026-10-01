# Telegram history protocol v1

Scope: private chat discovery, selection and resumable full available history
(text plus attachment metadata). No media bytes, extraction, drafts or search.
Existing TELEGRAM_INTAKE_ENABLED flag, staff MFA/origin/permissions and scoped
worker bearer token apply. Telegram access hashes and file references stay in the
Mac's encrypted account-scoped cache; they are never accepted by these APIs.

## Common values

Public peer locator: `{kind:"user"|"chat"|"channel",id:"positive decimal"}`.
Peer/account/sender/document IDs are decimal strings (1–30 digits); message IDs
are decimal strings from 1 through 2147483647. Zero is allowed only for the initial
dialog offset. UUIDs identify hosted rows. All timestamps are ISO UTC strings.
A connection generation is a positive safe integer.

The hosted account key is owner + connection ID + stable Telegram accountUserId.
Changing accounts never combines chats/messages or resumes the other account.
After reconnecting the same account, press Resume on interrupted imports to bind
them to the new connection generation. Mac sleep within one generation resumes
expired leases automatically. Discovery can be restarted without losing selection.

## Staff API

GET `/api/staff/telegram-history?view=all|selected|active|paused&q=&after=` returns:

```
{
  connection: {id,generation,status,accountUserId}|null,
  account: {id,accountUserId}|null,
  canImport: boolean,
  blockedReason: null|"NOT_CONNECTED",
  discovery: {status,jobs:[{id,status,errorCode,retryAt}]},
  totals: {chats,selected,messages,bytes,maxMessages,maxBytes},
  chats: [{id,peer,title,username,selected,version,
           import:null|{jobId,status,importedMessages,importedBytes,errorCode,retryAt}}],
  nextCursor: "uuid"|null
}
```

50 chats per page, stable ascending hosted UUID cursor. `q` is a private title or
username substring (max100 characters). Missing `view` means all; missing `after`
means first page. Statuses: queued, leased, waiting, paused, capacity_paused,
failed, cancelled, completed. `active` includes queued/leased/waiting;
`paused` includes paused/capacity_paused/failed. A job bound to an old generation
is presented as paused with `CONNECTION_CHANGED`. Disconnected accounts remain
readable, but controls require canImport. A new connected Telegram account has no
account/chats until discovery starts. Discovery status is idle when absent,
completed if both folder jobs complete, active if any is queued/leased/waiting,
otherwise paused. Imported counts are actual stored messages/bytes, never a
percentage estimate. They include service records and attachment-only messages. `totals.messages` and
`totals.bytes` are recruiter-wide quota usage across all their Telegram accounts;
`totals.chats` and `totals.selected` are for the current account. Label storage
figures accordingly; switching accounts does not reset used capacity.

POST same path returns `{ok:true}`. Refresh GET after mutation:

- `{action:"discover"}` creates/refreshes the current account's two dialog jobs
  (folders0 and1). Active jobs are left alone; paused/completed runs restart their
  discovery cursors, retaining existing private chats and selections.
- `{action:"select",chatId,selected,expectedVersion}` changes selection. Selecting
  queues full-history import; deselecting cancels future pages but retains data.
- `{action:"selectMany",chats:[{chatId,expectedVersion}],selected}` atomically
  selects/deselects1–50 unique visible-page chats. Any stale row rejects the entire
  batch with409; refresh and let the user retry. No unbounded Select all.
- `{action:"pause"|"resume"|"cancel",chatId,expectedVersion}`. Resume selects the
  chat and continues its durable cursor with the current connected generation;
  pause retains selection, cancel deselects. Every accepted mutation increments
  chat.version. HTTP409 means refresh; controls use that chat's latest version.

Pause/cancel invalidate any current job lease. They do not remove imported data.
Completed imports remain complete when selected again; live incremental sync and
re-import after message edits are later work. "Full history" means every message
Telegram makes available in the snapshot, not deleted or inaccessible messages.

## Worker API

POST `/api/telegram-history/worker/{claim,complete,defer}`. All requests include:
`{connectionId,generation,connectionLeaseToken,accountUserId}`. Use the current
connected task's lease from the connection API and the locally verified account
ID. Connection must still be connected, belong to this token's worker, match the
account and generation, and have an unexpired lease. No arbitrary peer requests.

Claim adds no fields and returns `{job:null|{id,kind,accountId,accountUserId,
connectionId,generation,leaseToken,leaseExpiresAt,cursor,pageNumber,peer}}`.
Kind is `dialogs` or `history`; peer is null for dialogs. One 120-second job lease
per account; repeated claims return the current lease. Oldest last-served eligible
job wins, so many selected chats make progress fairly. Complete at most one raw
Telegram page per job lease, then claim again; never load all history into memory.
Connection heartbeat/lease renewal must continue during imports.

Dialog cursor:
`{folder:0|1,offsetDate:0,offsetId:"0",offsetPeer:null,excludePinned:false}` initially.
Next cursor has the last raw page offsetDate (Unix seconds), offsetId, public
peer locator and excludePinned:true; the folder never changes. Private access
hash resolution remains in the encrypted Mac cache. Include pinned dialogs on
first page and use the raw Telegram pagination boundary, not filtered UI rows.

History cursor: `{beforeMessageId:null,upperMessageId:null}` initially. First
nonempty raw page fixes upperMessageId to its maximum message ID, and
beforeMessageId to its minimum. Later pages use exclusive offsetId, descend below
the previous minimum, and preserve upperMessageId. This imports the initial
snapshot in bounded pages; messages arriving later belong to future incremental
sync. All raw entries, including service and attachment-only entries, are kept.

Complete body adds `{jobId,jobLeaseToken,pageId,fromCursor,nextCursor,done,records}`.
pageId is a fresh UUID for each page; keep exactly the same body on lost-ACK retry.
Reply is `{ok:true,status:"queued"|"completed"|"capacity_paused",replayed:boolean}`.
Nonempty pages always use done:false. Completion requires an empty raw Telegram
page with done:true and unchanged cursor. Never infer exhaustion from filtered
text counts. The server atomically deduplicates records, commits a digest-only
page receipt, and advances the cursor. Same pageId/body retries succeed without
double counting; a different body under the same pageId is rejected. Old leases
cannot write; a receipt replay still requires the same active connection/account.

Dialog records:
`{peer,title,username:null|string,lastMessageAt:null|ISO}`. Title max200, username
max32. No accessHash, raw Telegram object, message text or session is allowed.
History records:
`{messageId,kind:"message"|"service"|"unavailable",sentAt:ISO|null,editedAt:null|ISO,
sender:null|{peer,username:null|string,displayName:null|string},
replyToMessageId:null|string,forwardedFrom:null|{peer:null|publicPeer,displayName:null|string},text:string,
attachments:[{id:null|string,kind:"document"|"photo"|"other",filename:null|string,
mimeType:null|string,sizeBytes:null|nonnegativeSafeInteger}]}`.
Text at most32768 UTF-8 bytes; up to16 attachments; filename/displayName max200,
MIME max100. Attachment metadata is descriptive only, never a validated CV.
Empty text is valid, including media-only and service messages. A raw Telegram
MessageEmpty is preserved as kind unavailable, sentAt/editedAt/sender/reply/forward
all null, text empty and attachments empty. Only unavailable permits null sentAt.
It counts as a stored raw placeholder and advances the real message cursor without
inventing content; it is not a candidate fact. IDs and cursor
order are database-validated. Do not truncate an oversized record or skip it.

At most100 records per page AND256KiB entire wire JSON request. The database
allows300KiB for PostgreSQL canonical JSON whitespace expansion; this does not
increase the HTTP limit. Individual stored JSON records share that canonical
300KiB bound, while their actual text still has the32768-byte limit. Reduce raw page size
if needed. One oversized record is deferred with `MESSAGE_TOO_LARGE`; pause that
chat explicitly and retain its cursor. Do not advance past the offending message.

Defer adds `{jobId,jobLeaseToken,code,retryAfterSeconds?}` and returns `{ok:true}`.
Codes: FLOOD_WAIT, TELEGRAM_UNAVAILABLE, PEER_UNAVAILABLE, PEER_CACHE_MISSING,
MESSAGE_TOO_LARGE. FLOOD_WAIT requires1..604800 seconds, persists an account-wide retryAt cooldown and
releases the lease (never sleep holding it). Temporary failures use bounded
backoff; after5 attempts they pause as failed for explicit Resume. Peer/cache/
size errors pause immediately. Do not return raw provider errors or message text.
A defer acknowledgement retry with an already cleared lease may return409; reclaim
state rather than retrying indefinitely. Check connection/generation before each
Telegram request and stop immediately if invalidated.

## Capacity and privacy

Default per-recruiter bounds:200000 stored messages,256MiB JSON message bytes,
20000 discovered chats. Database quota rows enforce these under a per-owner lock;
worker bodies cannot choose higher limits. Operator changes to these bounded
quotas permit Resume without losing the cursor. Reaching a quota returns
capacity_paused without inserting a partial page or advancing its cursor.
Never label partial history completed. Quotas are a visible backpressure limit,
not a silent full-history cutoff. Private ingestion tables are distinct from
telegram_evidence; approving drafts cannot delete unprocessed history. Selecting,
pausing or cancelling does not make anything shared.

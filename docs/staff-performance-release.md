# Staff responsiveness release

This change streams dashboard data after navigation renders, pages jobs and clients in groups of 50, reuses recent previews within the active browser session, and avoids flashing skeletons for loads shorter than 150 ms.

## Deployment

Apply these additive migrations to the target database before deploying the application:

1. `20261002110000_staff_shell_capabilities.sql`
2. `20261002120000_staff_list_pagination.sql`

They add authorized read functions; existing callers remain supported. The automatic production migration workflow runs after main CI, so it does not guarantee migration-before-Vercel ordering. Confirm the target migration history before release. Application rollback can use the previous deployment without removing these functions.

## Measure after release

The app already includes Vercel Speed Insights. Temporarily set `STAFF_PERFORMANCE_LOGS=1` to capture server-side `staff-read` durations for capabilities and summary reads. These logs contain fixed operation names and milliseconds, with no user or record identifiers. Disable the flag when the sample is sufficient.

Compare cold and warm navigation, first and subsequent previews, search, pagination, and save actions using the same account and dataset. Record median and p95 timings, plus response sizes. Server read durations include connection acquisition and authorization; they are not SQL-only measurements. Use database query plans and function traces if those readings remain slow.

Verify the configured Vercel execution region is close to the database region before changing either. Region placement and production latency are not established by local synthetic tests. Do not increase connection limits without accounting for serverless instance count and database connection capacity.

## Loading behavior

Navigation remains mounted while page content changes. Skeletons use neutral greys and a CSS-only 150 ms visibility delay; content itself is never delayed. List filters and page changes use transitions so existing rows remain visible with an updating indicator. Saves keep their controls busy until refreshed data arrives.

Preview data lives only in the mounted preview component's memory: at most five records, retained for 15 seconds for reopening. Mutations, session changes, authorization failures, and window visibility/focus changes invalidate it. It is never persisted to browser storage or shared between users.

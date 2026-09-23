# Agent verification notes

- Node 22 is required (`.nvmrc`, `engines >=22 <23`); do not run checks under other majors.
- `npm test` runs unit tests only (`tests/unit`). Playwright specs live in `tests/e2e` and need Chromium plus, for `E2E_REAL_BACKEND=1`, a local Supabase stack on `http://127.0.0.1:54321` guarded by `tests/support/nonproduction.js`.
- `npm run test:db:foundation` runs `tests/database/foundation.test.js`. It needs a running Docker daemon and creates labeled, throwaway containers only. `FOUNDATION_TEST_MODE=supabase` instead spins an isolated Supabase CLI workdir under the OS temp dir with a unique project id; ports 54321 and 3000 must be free.
- `npm run test:db:staff` runs `tests/database/staff-authorization.test.js` against a labeled, throwaway published PostgreSQL 17 container; it uses the `pg` driver (dev dependency) for concurrent runtime-role connections.
- `npm run test:db:privacy` runs `tests/database/privacy-foundation.test.js` against labeled, throwaway PostgreSQL 17/16 containers covering the document and privacy foundation migrations.
- Business schema SQL lives in `supabase/migrations` and must stay portable PostgreSQL 17 (no provider schemas, no extensions); the migration operator must be able to `set role app_owner` and bypass forced RLS for the seed.

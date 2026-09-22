# Agent verification notes

- Node 22 is required (`.nvmrc`, `engines >=22 <23`); do not run checks under other majors.
- `npm test` runs unit tests only (`tests/unit`). Playwright specs live in `tests/e2e` and need Chromium plus, for `E2E_REAL_BACKEND=1`, a local Supabase stack on `http://127.0.0.1:54321` guarded by `tests/support/nonproduction.js`.
- `npm run test:db:foundation` runs `tests/database/foundation.test.js`. It needs a running Docker daemon and creates labeled, throwaway containers only. `FOUNDATION_TEST_MODE=supabase` instead spins an isolated Supabase CLI workdir under the OS temp dir with a unique project id; ports 54321 and 3000 must be free.
- Business schema SQL lives in `supabase/migrations` and must stay portable PostgreSQL 17 (no provider schemas, no extensions); the migration operator must be able to `set role app_owner` and bypass forced RLS for the seed.

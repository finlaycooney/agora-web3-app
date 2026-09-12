# Candidate Applications

## Deployment safety

Local edits and commits do not affect Vercel. Pushing this feature branch may create a preview deployment, but it must not change production unless Vercel is explicitly configured to treat this branch as its production branch.

The database migration is additive and must be applied before deploying the application code. If the code is deployed first, submissions will fail safely and uploaded CVs will be removed, but candidates will not be able to complete applications.

## Local setup

Prerequisites are Node 22 and a running Docker-compatible container runtime.

1. Run `nvm use` if you use nvm, then run `npm ci`.
2. Run `npm run local:start`.
3. Copy `.env.example` to `.env.local` and replace the Supabase values with those printed by `npm run local:status`.
4. Run `npm run local:reset` to rebuild the local database, apply every migration, and seed it.
5. Run `npm run dev` and open `http://127.0.0.1:3000/jobs`.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`, expose it to browser code, commit `.env.local`, or use a production key for local development. The standard keys printed by the local Supabase CLI are development credentials and are safe only for this isolated local stack.

Useful local services:

| Service | URL |
| --- | --- |
| Application | `http://127.0.0.1:3000` |
| Supabase API | `http://127.0.0.1:54321` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Local email inbox | `http://127.0.0.1:54324` |

Use `npm run local:status` to inspect the stack and `npm run local:stop` when finished. Local Supabase data persists between normal stops; `npm run local:reset` intentionally deletes and recreates only the local database.

GitHub OAuth is optional for direct applications. To test it locally, use a development GitHub OAuth app with callback URL `http://127.0.0.1:3000/api/auth/callback/github`.

## Verification

Run the fast checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The normal E2E suite intercepts the submission API and cannot write candidate data.

To exercise the complete API, storage, and database flow against local Supabase:

```bash
npm run test:e2e:backend
```

The integration test refuses to run against a non-local Supabase hostname and removes its test row and uploaded PDF.

## Maintainer handoff

The maintainer must:

1. Review and apply `supabase/migrations/20260911120000_candidate_applications.sql` to Supabase.
2. Confirm the existing `cv-submissions` bucket is private and accepts `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document` files up to 4 MB. The migration deliberately does not overwrite an existing bucket's settings.
3. Confirm Preview and Production have `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GITHUB_ID`, and `GITHUB_SECRET` configured.
4. Verify the Vercel preview before merging.
5. Run one controlled production submission after deployment and confirm the applicant row and private CV object.

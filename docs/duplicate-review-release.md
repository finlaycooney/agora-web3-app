# Duplicate-review release

This branch starts from `main` and includes the public-intake duplicate review, the staff comparison and merge UI, its APIs, and only the candidate-profile database prerequisites from the unmerged profile work. It does not ship the candidate add/edit UI or the unrelated open job-tools PR.

## Pre-merge checks

- Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:duplicate-review`, and `npm run test:e2e` on Node 22. Database tests require Docker; do not run them beside another Next dev/build process in this checkout.
- Confirm that the Preview Supabase project has the four migrations below and that its staff account can review and merge synthetic profiles. The `/dev/duplicate-review` page is only a UI sample and does not exercise the backend.
- Check that Vercel's Production Branch is `main`, and confirm who can approve the `production` GitHub Actions environment. These settings are not stored in the repository.

## Database-first rollout

1. The database maintainer checks the *actual* production migration history and takes a restorable backup. Do not assume every migration in this checkout is already applied or run an unchecked `db push`.
2. Apply pending migrations in order: `20260930090000_candidate_profiles.sql`, `20260930090100_candidate_intake_serialization.sql`, `20261001090000_public_intake_duplicate_review.sql`, and `20261001100000_candidate_merge.sql`. The first two are database prerequisites from the unmerged candidate-profile work; the latter two implement public intake review and merge. The existing `submit_public_application_v1` entry point remains for the currently deployed code, but verify a controlled application still succeeds after migration.
3. Confirm the migration ledger matches the applied files, public jobs and applications work, and staff read permissions remain scoped to the intended organization.
4. Merge this branch only after the database is ready. CI and Vercel deploy from `main`; the production migration workflow is an additional post-CI check, not an ordering guarantee for Vercel. Its checkout is pinned to the CI-tested commit.
5. Smoke-test `/`, `/jobs`, one controlled application with a private CV, staff sign-in, duplicate-review visibility, and a permitted merge on production. Check the candidate row, application, CV link, and old-profile redirect. Use known disposable test records; do not merge real candidates as a smoke test.

If the application deployment fails, restore the previous Vercel deployment. Do not roll back these additive migrations or delete merge records casually after new writes. Keep the unmerged candidate-profile PR separate; rebase it against this branch if it is pursued later so migration files are not duplicated or rewritten.

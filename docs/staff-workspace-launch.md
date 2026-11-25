# Staff workspace launch runbook

This is the one-time procedure for taking the staff workspace (`integration/staff-workspace`) live. Agora has a single Supabase project and it is production, so every database step below is run by hand by the project owner. Nothing in CI writes to the database: the automatic `db-migrate.yml` workflow was removed.

Order matters. The migrations must be in production **before** the new code serves `/jobs` or `/api/submit-signal`, and the Vercel environment variables must be set before that deploy.

## 1. Vercel environment variables

Set these in Vercel → Project → Settings → Environment Variables. "Server-only" means the value must never get a `NEXT_PUBLIC_` prefix.

| Variable | Status | Scope | Where the value comes from |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | new | Production, Preview | Google Cloud OAuth client (section 2) |
| `GOOGLE_CLIENT_SECRET` | new, server-only | Production, Preview | Same OAuth client |
| `STAFF_DATABASE_URL` | new, server-only | Production, Preview | Pooler connection string for the `agora_staff_runtime` login role (section 4.3) |
| `INTAKE_DATABASE_URL` | new, server-only | Production, Preview | Pooler connection string for the `agora_intake_runtime` login role (section 4.3) |
| `STAFF_ORGANIZATION_ID` | new | Production, Preview | Always `9c4edd11-2571-490b-a87c-ef30b9e0a001` (seeded by the foundation migration) |
| `NEXTAUTH_URL` | unchanged for Production; set per branch for Preview | Production, Preview | Production: `https://<production domain>`. Preview: the stable branch alias, e.g. `https://agora-web3-app-git-integration-staff-workspace-<team>.vercel.app` (Vercel lets a Preview variable target one Git branch) |
| `NEXTAUTH_SECRET` | unchanged, server-only | Production, Preview | Keep the existing value. It also signs the `staff_mfa` cookie, so rotating it signs every staff member out of MFA |
| `NEXT_PUBLIC_SUPABASE_URL` | unchanged | Production, Preview | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | unchanged, server-only | Production, Preview | Supabase → Project Settings → API. Used only by `/api/submit-signal` (CV upload) and `/api/staff/documents/[id]` (signed CV links) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | unchanged, optional | Production, Preview | Not read by the app any more; safe to keep |
| `RESEND_API_KEY` | unchanged, optional | Production, Preview | Not read by the app at the moment (invites do not send email) |
| `GITHUB_ID`, `GITHUB_SECRET` | **remove** | all | GitHub sign-in no longer exists |

Preview deployments share the production database (there is only one Supabase project). Anything done on a preview, such as a test application or a published job, lands in production data. Use a clearly marked test job and delete it afterwards.

## 2. Google OAuth client

1. Google Cloud Console → APIs & Services → OAuth consent screen. If agora4.xyz is a Google Workspace domain, choose **Internal** so Google itself refuses accounts outside the domain. Otherwise choose External and add only the scopes `openid`, `email`, `profile`.
2. Credentials → Create credentials → OAuth client ID → Web application.
3. Authorised JavaScript origins: `https://<production domain>` and each preview alias you use.
4. Authorised redirect URIs (NextAuth v4 uses `/api/auth/callback/google`):
   - `https://<production domain>/api/auth/callback/google`
   - `https://www.<production domain>/api/auth/callback/google` if `www` is served
   - `https://agora-web3-app-git-integration-staff-workspace-<team>.vercel.app/api/auth/callback/google` for this PR's preview
   - `http://127.0.0.1:3000/api/auth/callback/google` for local development
   Google does not accept wildcard redirect URIs, so per-deployment preview URLs (`agora-web3-app-<hash>-<team>.vercel.app`) cannot sign in. Use a branch alias and set `NEXTAUTH_URL` for that branch to match.
5. Copy the client ID and secret into the Vercel variables above.

The app requests `access_type=offline` and `prompt=consent`, so Google shows the consent screen on every staff sign-in. That is what gives the server a refresh token for re-checking suspended accounts.

## 3. Before you start: back up

1. Supabase → Database → Backups: confirm the latest daily backup exists (or create a PITR restore point if PITR is enabled).
2. Take your own logical dump as well, with the database password from Project Settings → Database:

   ```bash
   pg_dump "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
     --format=custom --no-owner --file=agora-pre-staff-workspace-$(date +%Y%m%d).dump
   ```

3. Download the `cv-submissions` bucket contents if it holds anything (Storage → cv-submissions). The migrations never delete objects, but a copy costs nothing.

## 4. Apply the migrations

### 4.1 Dry run

```bash
supabase link --project-ref <ref>
supabase migration list --linked      # remote column should be empty
supabase db push --linked --dry-run   # lists all 20 files from 20260911120000 to 20260930100000
```

If `20260911120000_candidate_applications.sql` was already applied by hand (the remote column is empty but `public.applicants` has `job_id`), you do not need to repair anything: the file is idempotent (`if not exists` / `on conflict do nothing`).

### 4.2 Apply

```bash
supabase db push --linked
```

The foundation roles migration grants `app_owner` to the migration user (`postgres`) because the hosted `postgres` role is not a superuser. It refuses to run if the `app_*` roles already exist with unexpected attributes.

What happens to existing objects:

- `public.applicants` is kept. The first migration adds `job_id`, `job_title`, `professional_url` and `technical_achievement` if they are missing, enables RLS and adds two indexes. Nothing writes to the table after this release; new applications go to `app.candidates`, `app.applications` and `app.documents`. No data is copied across (there is none to migrate), and the table can be dropped in a later, separate change once you are satisfied.
- The `cv-submissions` bucket is created private, 4 MB, PDF/DOCX only, **only if it does not exist**. An existing bucket's settings are not changed, so check it by hand (step 4.4). New CVs keep landing in this bucket under fresh object keys, registered in `app.file_blobs` / `app.blob_locations`.
- Everything else is new: the `app` schema (37 tables, all with forced RLS), six `NOLOGIN` roles (`app_owner`, `app_staff`, `app_intake`, `app_worker`, `app_executor`, `app_authz_reader`), the Agora organisation, its roles and permission catalogue, and the default pipeline. The `app` schema is not exposed through the Supabase REST API, and `anon`, `authenticated` and `service_role` have no privileges on it.

### 4.3 Runtime login roles

The app connects with two least-privilege login roles. Run this once in the SQL editor, with two new strong passwords:

```sql
create role agora_staff_runtime login password '<staff password>';
grant app_staff to agora_staff_runtime;

create role agora_intake_runtime login password '<intake password>';
grant app_intake to agora_intake_runtime;
```

Each login role is a member of exactly one runtime role and nothing else. Keep the default `inherit`: the permission-checked staff transactions (`withStaffTransaction`) run with the login role's inherited `app_staff` privileges rather than issuing `set role`, so a `noinherit` role is refused with `42501` on every workspace action (creating a client, a job, an invite). This matches the role the test suites create. Do not use the `postgres` password for either variable.

Vercel cannot reach the IPv6-only direct host (`db.<ref>.supabase.co`), so use the pooler (Project Settings → Database → Connection string → Transaction pooler):

```
STAFF_DATABASE_URL=postgresql://agora_staff_runtime.<ref>:<staff password>@aws-0-<region>.pooler.supabase.com:6543/postgres
INTAKE_DATABASE_URL=postgresql://agora_intake_runtime.<ref>:<intake password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

### 4.4 Check the bucket

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cv-submissions';
```

It must show `public = false`. If not, or if the limit or types differ, fix it:

```sql
update storage.buckets
   set public = false,
       file_size_limit = 4194304,
       allowed_mime_types = array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'cv-submissions';
```

## 5. Bootstrap the first admin (fin@agora4.xyz)

Invites need an existing admin, so the first one is created by hand. Staff access is limited to Google accounts whose verified email is `@agora4.xyz`.

1. Deploy the code (step 6) with the environment variables set.
2. Open `https://<production domain>/staff/sign-in` and sign in with **fin@agora4.xyz**. You land on "No workspace access", which lists your Google `subject` (a long number).
3. In the Supabase SQL editor (which runs as `postgres`), run this with the subject filled in. Do not add `set role app_owner`: every `app` table has forced RLS and `app_owner` cannot bypass it, while `postgres` has `BYPASSRLS` and inherits `app_owner`'s table privileges.

   ```sql
   begin;
   with new_user as (
       insert into app.users (id, display_name, status)
       values (gen_random_uuid(), 'Fin', 'active')
       returning id
   ), identity as (
       insert into app.auth_identities (id, user_id, provider, issuer, provider_subject, verified_at)
       select gen_random_uuid(), id, 'google', 'https://accounts.google.com', '<subject>', now()
       from new_user
   )
   insert into app.organization_memberships (id, organization_id, user_id, role_id, status, activated_at)
   select gen_random_uuid(), '9c4edd11-2571-490b-a87c-ef30b9e0a001', id,
          '9c4edd11-2571-490b-a87c-ef30b9e0a011',  -- seeded Admin role
          'active', now()
   from new_user;

   -- Pin staff invites to the Agora domain.
   update app.organizations
      set staff_invite_domains = array['agora4.xyz'], updated_at = now()
    where id = '9c4edd11-2571-490b-a87c-ef30b9e0a001';
   commit;
   ```

4. Reload `/staff`. You are sent to TOTP enrolment: scan the QR code with an authenticator app and enter a code. From then on every staff sign-in needs Google plus a TOTP code.
5. Invite everyone else from `/staff/members`. They sign in with their @agora4.xyz Google account and enrol TOTP. Invites do not send email, so tell them yourself.

## 6. Deploy and switch the public board

1. Merge the PR into `main` and let Vercel build it.
2. If Vercel's Production Branch is still `production-v1` (see `docs/candidate-applications.md`), smoke-test the `main` deployment first, then switch the Production Branch to `main` and promote it. Keep the previous production deployment for instant rollback.
3. `/jobs` now lists only jobs published in the staff workspace. It is empty until you publish at least one, so publish the current roles (previously hard-coded in `src/data/jobs.js`) straight after the switch, or before it from the preview.
4. Smoke test: `/`, `/jobs`, open a job, submit one test application with a small PDF, find it under `/staff/applications`, open the CV, then withdraw the test job and delete the test candidate.

## Rollback

- Code: promote the previous Vercel production deployment.
- Database: the migrations only add objects, so the old site keeps working against the migrated database (it writes to `public.applicants`, which still exists). Restore from the dump only if something is badly wrong, because a restore also discards any staff work done since.

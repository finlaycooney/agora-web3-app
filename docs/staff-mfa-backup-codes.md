# Staff MFA backup codes

Apply `20261003090000_staff_mfa_backup_codes.sql` before deploying the new MFA routes. Without it, verification returns a temporary-unavailability error. Existing MFA credentials and proof cookies remain valid; no user needs to enroll again.

New enrollments receive ten codes after successful authenticator confirmation. Save or download them before continuing. Existing staff can open **Backup codes** in the navigation and enter a fresh authenticator code to generate a set. Replacing a set immediately invalidates all previous codes.

After Google sign-in, select **Use a backup code** when an authenticator is unavailable. Each code works once. Only hashes are stored; plain codes appear in the generation response and browser memory, and in a downloaded file if requested. Responses are not cached. Generation and successful use are audited without codes or hashes.

MFA enrollment confirmation, verification and code generation share a per-user limit of ten submissions in ten minutes. Invalid codes, replays and successful submissions count; the response tells the user how long to wait. The limit persists across application processes.

If a generation response is lost, wait for a fresh authenticator code and generate another set. A consumed code cannot be retried if the response is lost; use another saved code. A user who loses both their authenticator and all backup codes still needs administrator-assisted recovery. Resetting or replacing an authenticator is a separate workflow.

If production already contains migrations with later timestamps than a reviewed missing file, the automatic workflow stops. Run **Migrate database** manually on the release branch with **allow_out_of_order** enabled after reviewing the pending files. The workflow prints a dry run and keeps the production environment gate. Apply the invitation recovery migration and backup-code migration successfully before merging this release.

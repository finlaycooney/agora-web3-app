# Stable authenticator setup

Apply `20261006090000_staff_totp_stable_enrollment.sql` before deploying this fix. It replaces the existing enrollment and status functions without changing its signature, owner or permissions. It does not rewrite existing credentials, backup codes or audit records.

If an earlier race left both active and pending credentials, the completed setup takes priority without deleting either row. Opening or refreshing setup reuses the stored pending credential. Concurrent requests serialize with confirmation, so a request after successful setup returns the active credential and redirects to the staff page. The server reads the stored secret in the same transaction and never displays a losing request's proposed secret.

When two tabs confirm together, only one activation and backup-code set commit. The other tab offers the existing “Continue to staff” recovery. It does not replace the codes or clear the successful MFA proof. Used authenticator codes and backup codes remain protected against replay.

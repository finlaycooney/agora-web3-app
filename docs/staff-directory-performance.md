# Staff directory performance release

Apply `20261004100000_staff_candidate_directory.sql` before deploying the candidate directory changes. It adds a function and leaves the old directory functions available, so the previous app remains compatible and can be used for rollback. Follow the existing migration operator procedure; do not run this migration as the application login.

Candidates now returns at most 50 detailed records and its edit options in a single authorized read. Search covers all active, authorized candidates, including records outside the previous 500-row cap. Counts and rows use the same statement snapshot. URL updates preserve the table while the next page loads. A full browser reload still performs fresh authentication and database authorization.

# Staff directory performance release

Apply `20261004100000_staff_candidate_directory.sql` before deploying the candidate directory changes. It adds a function and leaves the old directory functions available, so the previous app remains compatible and can be used for rollback. Follow the existing migration operator procedure; do not run this migration as the application login.

Candidates now returns at most 50 detailed records and its edit options in a single authorized read. Search covers all active, authorized candidates, including records outside the previous 500-row cap. Counts and rows use the same statement snapshot. URL updates preserve the table while the next page loads. A full browser reload still performs fresh authentication and database authorization.

Apply `20261004110000_staff_application_directory.sql` before deploying application pagination. It is also additive and supports rolling back to the previous app. Applications returns 50 rows, lightweight job/client labels and stage counts in one authorized read. Stage counts cover the whole search/client/job/review scope, independently of the selected stage or page. Each joined table is read into an authorized scope once to avoid repeated authorization work per joined row.

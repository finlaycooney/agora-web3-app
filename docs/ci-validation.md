# CI validation policy

Run checks affected by the change, not every suite for every PR. `scripts/ci-selection.mjs` selects jobs and records the selection in the Actions summary. Documentation-only changes skip application checks. Narrow staff directory changes run workspace checks; candidate pages also run their dependent review/search suites. Shared authorization changes run staff suites. Schema, dependencies, shared test infrastructure and unknown paths get full coverage. Manual CI dispatch always runs everything.

A merge into main reuses a successful PR CI run only when the merge tree exactly equals the PR head tree and the latest CI run for that same repository/head succeeded. A changed merge result, direct push, missing proof or API error runs the affected checks instead. This preserves the main CI workflow completion event used by database releases.

`CI validation` is the aggregate check: failed, cancelled or unexpectedly skipped selected jobs fail it. If branch protection is configured, require that check rather than every optional suite. Do not remove required checks through this change.

For local work, run focused checks while editing and broaden once when shared boundaries change. After checks pass, repeat only for new code, a failure, a changed merge result or an unresolved risk. An identical tested merge needs no new local suite run.

When adding a feature or suite, update the selector and its tests. Unknown files deliberately select all jobs until their dependencies are mapped.

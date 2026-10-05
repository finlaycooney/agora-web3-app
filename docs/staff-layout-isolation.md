# Public and staff layout boundaries

The root layout contains shared fonts, global design tokens and analytics only. Public pages live under the `(public)` route group, keeping `/`, `/jobs` and `/for-employers` at the same URLs. Their layout owns the public header/footer, noise overlay, HeroUI provider, animation provider and carousel CSS.

Verified staff pages use a session provider for record-preview cache invalidation. Staff sign-in and other pre-access pages do not mount it. Public pages have no session consumers and no longer mount a session provider. Staff widgets continue to use their existing Radix components and shared design tokens.

No database migration or authorization change is required. Validate public hydration and submission UI, bare staff sign-in, and authenticated record previews when changing these boundaries. Shared layout changes select browser workflows in CI, excluding dedicated database-only jobs. This establishes the dependency boundary; production latency gains still require measurement.

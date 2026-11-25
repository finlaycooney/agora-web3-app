# QA evidence for integration/staff-workspace

Everything here was captured locally against production builds (`next build && next start`), with the database on a local Supabase stack. Nothing touched the production project.

| Folder | What it is |
| --- | --- |
| `baseline/` | `origin/main` at the time of the merge: screenshots of `/`, `/jobs`, `/for-employers`, the job detail modal and the application modal at 1440px and 390px, plus `report.json` (component inventory and console errors) and `canvas-metrics.json` (the canvas pixel check below, re-run on main). |
| `after/` | The same capture against this branch. `/jobs` shows jobs published from the local staff workspace (the board is now database-backed). |
| `compare/` | Before (left) and after (right), side by side. |
| `flows/` | Screenshots and `flow-log.txt` from the Phase 5 end-to-end run (public apply, staff workspace, invites). TOTP enrolment screens are left out because they show QR codes. |

## How the comparison was read

Pixel differences over 40 levels, in the area both shots share:

| Page | Desktop | Mobile | Cause |
| --- | --- | --- | --- |
| Home | 0.9% | 0.8% | Animation frames only (Beams hero, logo marquee, the FlowingHub activity list), plus the TalentPortal button, which now reads "Browse open roles" and links to `/jobs` (Fin's decision 5). Page height is identical. |
| For employers | 0.1% | 0.0% | Animation frames. |
| Jobs | 4.8% | 6.7% | Content: the board lists jobs from the database instead of `src/data/jobs.js`. Cards have no tags (the staff workspace has no tag field) and the salary comes from the structured compensation fields. Beams background, header, card layout and footer are unchanged. |
| Job detail modal | 3.6% | 11.7% | Content as above, plus "Stealth company" for a stealth client and "Posted on <date>" instead of the hard-coded "Posted 2 days ago". |
| Application modal | 4.3% | 12.4% | The "SYNC_GITHUB_IDENTITY" block and the "OR" divider are gone (Google-only auth decision), so the form is shorter. |

Console: the branch has strictly fewer problems than main. Main's React #418 hydration error on `/` (FlowingHub rendered `<div>`s inside `<svg>`) and the external `grainy-gradients.vercel.app/noise.svg` fetch are gone. What remains is pre-existing on both: `/_vercel/insights` and `/_vercel/speed-insights` 404 outside Vercel, `/background-for-employers.webp` 404, and a 400 from `next/image` for `/why-partner-with-us.webp`.

Canvas checks (painted share, colour count and luminance range of the canvas rendered alone over a magenta backdrop) pass for Beams on `/` and `/jobs` and for FaultyTerminal at both widths, with and without `prefers-reduced-motion`, on both main and this branch:

| Canvas | main (colours / luma range) | branch (colours / luma range) |
| --- | --- | --- |
| Beams, home, 1440 | 78 / 429 | drawn (the capture script's bounding-box call timed out on this one run; the Playwright spec passes it) |
| Beams, home, 390 | 83 / 416 | 91 / 430 |
| Beams, home, 1440, reduced motion | 82 / 426 | 72 / 404 |
| Beams, home, 390, reduced motion | 71 / 393 | 81 / 405 |
| Beams, jobs, 1440 | 21 / 91 | 21 / 87 |
| Beams, jobs, 390 | 17 / 70 | 18 / 81 |
| FaultyTerminal, 1440 | 6 / 34 | 6 / 34 |
| FaultyTerminal, 390 | 7 / 552 | 6 / 35 |

FaultyTerminal draws translucent glyphs, so few colours and a small luminance range are expected; both branches match. The same check is now a Playwright spec, `tests/e2e/visual-components.spec.js`.

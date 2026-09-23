# v2.30.1 — Meta Lab layout repair

The public page inherited `body { display: flex }` from the private app shell,
placing header, main and footer in a horizontal row. Earlier functional tests
checked DOM behavior and APIs, not the CSS cascade, and missed this regression.

Fixes:
- Explicit block flow for `body.public-meta`, leaving private app flex flow intact.
- Bounded header/main/footer widths and grouped install/login actions; mobile header
  stacks cleanly instead of squeezing the brand between buttons.
- Shared Meta Lab hero uses one real content track. The decorative solar orb no
  longer reserves a fixed 19rem column. More compact title and normal telemetry margins.
- Navigation and health status have separate rows; on narrower screens navigation
  is non-sticky to avoid covering the content. Phone tabs use two columns.
- Rank Lens cards use four/two/one columns by breakpoint. Selectors, comparison
  sections, share links and scrollable tables have explicit shrink/width constraints.
- Corrected stylesheet versions in both public and private entry pages.

No API, authentication, scoring, upload, data-storage or service-worker changes.
CSS-cascade regression tests cover public/private isolation and responsive rules
at 1440, 1024, 768, 390 and 320px. These are offline rule/DOM checks, not browser
geometry or screenshot tests. Browser QA remains skipped per the user's preference.

Verification: all 346 offline tests passed, no skips/failures; syntax checks passed
for 64 JavaScript files and patch whitespace checks were clean.

Deployment: production READY on 2026-09-21, ID
`dpl_3oSM4GkxwDzPsmSscVtgChuHxvx9`, vanilla JS with Vercel functions, build 3 seconds.
URL: https://eclipseesports.vercel.app/meta-lab
Deployment: https://eclipse-esports-stats-8s0kuj27f-khusniddindev-6696s-projects.vercel.app
Both reported screenshot URLs and versioned CSS return 200 with exact source-byte
matches. Existing working-tree changes were preserved; no commit or push.

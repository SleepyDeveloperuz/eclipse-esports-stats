# v2.25 — Data trust and captain workflow

**Deployed to production on September 9, 2026 — READY.** Solar Eclipse styling and the vanilla JS architecture are retained. No browser automation was run.

Production: https://eclipse-esports-stats.vercel.app

Deployment: `dpl_D8aMwhY5xVJiTU1in9MsqdX7g32s` · remote build completed in 2 seconds. Uploaded from the tested local working tree; no Git commit was created. Read-only HTTP checks verified the v2.25 page, exact cloud.js content, anonymous auth/sync rejection, and operator-script exclusion before promotion. Browser, authenticated end-to-end flows, runtime error-log scans and monitoring configuration were not inspected in this deployment pass.

## Delivered

- Background cloud reads reject edits made while the response was pending. Shared write/ack identities protect changes across tabs; late replies cannot acknowledge newer work or lower the stored revision. Independent fields merge against a baseline; conflicting versions require an explicit captain choice.
- Creation, historical editing and submission review use the full match desk. Captain authorship no longer pretends the captain played. Archived participants can be corrected without joining the active roster.
- Probable duplicates show existing-match links and a captain-controlled link/keep-separate choice. Linking never silently replaces recorded match statistics; use the full editor for corrections. Exact duplicates still remain blocked.
- Unknown achievements stay unknown. Invalid objectives are rejected. Missing roster references remain repairable but are excluded from analytics. Match/roster limits reject saves/imports instead of truncating them.
- Briefing history is retained, polls have active/archive views, insights can be expanded, and unsaved forms survive rerenders. Closing the page with unsaved Briefing edits prompts a warning; those drafts are not durable after closing.
- Counter caches are separated by rank and period. Catalog portraits refresh, incomplete rank responses preserve the last good data, dossier failures expose stale fallback, and tied scores stay in one tier.
- PNG export reuses loaded portraits, bounds portrait loading to 45 seconds and asynchronous export work to 60 seconds, stops broad outages early, and has a cancel button. It offers an explicit missing-portrait fallback with every hero label retained. User confirmation time is not a network timeout.
- Statistical comparisons use the appropriate match context and date diversity. Partial teams cannot claim a whole-team damage share. Damage-concentration insights identify the damage leader, not merely the highest score.
- Safe foreground refresh and a last-update indicator. Forms and pending writes are not rerendered by focus refresh.
- Password-bound sessions, durable session revocation, and shared login/OCR/submission/vote rate limits. “Barcha qurilmalardan chiqish” is admin-only. Captain profile badges do not grant authorization.
- Captain-managed hero pool, secondary lane and captain badge. Briefing includes actual patch findings for declared pool heroes as well as recent picks.
- Reusable lineup presets store only roster/roles in the captain's browser (not shared or included in server backup). Applying one asks before clearing entered participant statistics.
- Shared public portrait descriptors reduce repeated reference downloads. New IDs/images automatically invalidate or fill missing references. Only an authenticated captain can publish references; private match screenshots are not retained.
- Private dated Mac backup script plus a dry-run-first, namespace-checked, revision-guarded restore tool with mandatory pre-restore backup and CAS protection. Latest-only retention removes older verified automatic copies only after the new JSON/checksum pass disk read-back verification. Manual and pre-restore backups remain untouched.

## Activation and remaining validation

- **Mac scheduling is not active:** the scripts need a private production environment file containing only the storage credentials and team namespace. No local credential file was found in the inspected project configuration. See `BACKUP-MAC.md`.
- Real-image recognition accuracy remains **unmeasured**: the user chose to continue without screenshots. Synthetic regression tests are not an accuracy benchmark.
- Browser/device visual verification and an authenticated production end-to-end check have not been performed, as requested. Production build, deployment state and limited read-only HTTP checks passed.
- On deployment, existing sessions will require one fresh login because the signing scheme changed. Configure production Redis access before deploying; auth fails closed if it cannot validate revocation state.
- Shared-password access remains a small-team trust model, not individual user accounts. Revoking sessions does not change a leaked password or erase already downloaded information; rotate the relevant password separately.
- Explicit source match IDs/timestamps and field-by-field duplicate merging remain future work; do not weaken exact-duplicate protection to force a second indistinguishable record.

## Checks

`npm test` — 189 passing tests after the re-audit fixes.

`npm run check` — 44 JS runtime/API/library files checked. Added command-line `.mjs` tools are also checked directly.

`ECLIPSE_JSDOM_PATH=/absolute/path/to/jsdom/lib/api.js node --test scripts/ui-regression.test.mjs` — 8 passing DOM-only tests (not browser automation): roster pool/permissions, Briefing drafts, lineup presets, archived historical editing and submission correction, new-match reset, viewer role transition, and refreshed history filters.

## Re-audit safeguards

- Clearing an edit explicitly ends the edit; headings, buttons and request actions agree.
- Archived submitters and substitutes are retained in correction and restored draft selectors.
- Viewer login removes expired admin credentials and refreshes protected UI.
- History filter callbacks query current records rather than a captured older list.
- Dossier skills/counters cannot replace newer canonical identity or portraits.
- Legacy absent public revisions are zero; malformed explicit revisions remain invalid. Pre-restore files are exclusive/private, flushed and verified before remote replacement.
- Test fixtures, operator scripts and Markdown documentation are excluded from website uploads.

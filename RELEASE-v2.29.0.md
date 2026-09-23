# v2.29.0 — Meta Lab research tools

Initially prepared locally; deployed together with v2.30.0 on 2026-09-21.
No team-record writes, new credentials, service provisioning or production migration
were needed. See RELEASE-v2.30.0.md for the combined deployment verification.

## Six additions

- **Rank Lens:** one canonical hero across Epic, Legend, Mythic and Glory+.
  Every request uses the same seven-day cohort. Each card shows its own snapshot
  time and freshness; unavailable ranks stay unavailable. Selecting a card changes
  the active rank for the explanation and timeline.
- **Meta Timeline:** actual saved daily Win/Pick/Ban, tier, rank-method version
  and score where recorded. Legacy history remains readable and untouched.
  New successful syncs write compact per-rank/per-period history with 90 daily
  snapshots per cohort; same-day sync replaces that day's point. No fabricated
  dates, interpolation, historical score reconstruction or patch causality claims.
- **Hero Compare:** two or three distinct canonical heroes, same selected rank
  and period, source statistics, lanes/roles, skills and per-hero freshness.
  Missing skills/rates have explicit states; no invented winner.
- **Watchlist:** canonical IDs stored only under `eclipse:public:watchlist:v1`
  in the visitor's browser. No account, team sync, notifications or shared favorites.
  Blocked storage falls back to this session with an explicit warning. Clear the
  browser's site data or unstar heroes to remove the list.
- **Why this tier:** actual per-hero adjusted win/pick/ban percentile contributions,
  pick shrinkage, median pick, weights, score, method version and relative tier bands.
  Existing scoring and tie behavior are unchanged; missing values are not zeros.
- **Share exact state:** public URL carries allowlisted rank, tab, hero/dossier,
  Lens hero, comparison IDs, query, tier filter and board/table mode. No session,
  token, team data or favorite IDs are copied. Clipboard-denied fallback exposes
  a selectable URL field. Query/tier filters work on both the board and table.

## Architecture and limits

Uses the existing vanilla JavaScript/Solar Eclipse stack. Both the public entry
and private Meta Lab load the same extension. No additional serverless function:
`GET /api/mlbb-meta?view=timeline&id=...&rank=...&days=7` is read-only and validates
the canonical ID/cohort before history access. Public GET protections, admin-only
sync and all private team endpoints remain unchanged.

`eclipse:mlbb:timeline:v2:<rank>:<days>` stores compact versioned tuples under the
existing sync lock. The old `rank-history:v1` key is never deleted or rewritten.
Readers merge legacy and new snapshots and return up to 90 actual daily points.
New heroes appear through the existing catalog sync; history begins when observed.
Snapshot dates are UTC and seven-day windows overlap. Higher rank, high visibility
or SS does not by itself establish statistical confidence or guarantee a win.

## Verification

Offline Node and DOM regression tests cover all six flows, concurrent/stale UI
responses, blocked local storage/clipboard, escaped skills, cohort isolation,
same-day deduplication, retention/payload size, legacy preservation, anonymous
timeline boundaries and exact score reconstruction. Browser QA was not run,
following the user's preference. This feature set was subsequently deployed with v2.30.0.

Final result: 334 tests passed, zero failures/skips; syntax checks passed for
61 JavaScript files and the patch whitespace check was clean.

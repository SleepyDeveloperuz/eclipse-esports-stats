# Eclipse v2.31.0 — Meta decision tools and match roles

- Match roles: removed blind primary-role fallback. A unique overlap between catalog lanes and roster primary/secondary roles is labeled as inferred; ambiguous or missing data remains unknown and does not block submission. Hero class is never used as a lane. Explicit edits are preserved; captain review shows conflicts. Role provenance survives server approval/sync. Old match roles are not rewritten and are labeled as unverified when edited. Unknown roles count in general statistics, not role-specific comparison. PNG no longer invents EXP for missing roles.

- Tier v3: Win-only performance; Pick/Ban shown separately. No forced SS quota. Missing/invalid rates are U, never D or zero. Source rates are unchanged.
- Fixed experimental thresholds: SS ≥53% plus qualifying history; S ≥52%; A ≥51%; B ≥49%; C ≥47%; D <47%. SS candidates without history display provisional S.
- Score = clamp(50 + (Win% − 50) × 10, 0, 100). These are operating thresholds, not statistically validated cutoffs or proven forecasts.
- SS requires three distinct daily observations spanning at least two days under the same rank, window, method and known patch. Each Win ≥53%, range ≤1.5 pp, full post-publication windows. Adjacent tiers use a 0.2 pp hold near boundaries; patch changes reset it.
- Quality labels: provisional, borderline, temporally stable, stale, unrated. Match counts/confidence remain unknown. Overlapping seven-day snapshots are not independent observations. Patch publication is not a verified in-game rollout timestamp.
- Patch Impact: canonical hero sections, original skill-change excerpts, watchlist filter, explicit preview and partial-parser states, safe official links. Parser-version changes reprocess a bounded number of cached articles at the next sync.
- Draft assistant: ally/enemy/bans, lane filter, optional private roster comfort/backup pool; explained ordering by lane coverage, observed matchup signals, then raw Win. Not a win-probability model. Only selected hero dossiers are requested (at most ten). Stale/failed/wrong-cohort matchups are excluded. Unknown lane coverage is disclosed.
- Meta Movers: public read-only API, same-cohort stored snapshots at least one window apart and at most two windows apart. Win/Pick/Ban percentage-point changes stay separate. No invented history, no causal/significance claims; tier comparisons require matching patch and method.
- Mobile: compact section selector, shrinkable draft grids, 44px controls, 16px inputs, dynamic viewport heights. Existing Eclipse styling retained.
- Reliability: null matchup rates no longer become zero; invalid Unicode cannot crash parsing; invalidated requests cannot repopulate stale cache; PNG includes U and quality labels.

## Rollout constraints

Old timeline scores are never recalculated. New SS history starts with successful v3 syncs; insufficient history means no SS or Movers output. Cached lane metadata is reused during catalog sync without a catalog-wide provider crawl. Missing data stays missing.

No database migration, new recurring job, paid service or historical-match rewrite is required. Production deployment is authorized by the user. Code and automated tests only. DOM/CSS assertions at 320/390/768/1024/1440px do **not** verify actual-device geometry; no browser QA was performed, as requested.

```sh
node scripts/check.mjs
ECLIPSE_JSDOM_PATH=/path/to/jsdom/lib/api.js node --test tests/*.test.js scripts/ui-regression.test.mjs
git diff --check
```

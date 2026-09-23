# v2.28.0 — Public Meta Lab

Deployed to production after the user's explicit deployment request.
Deployment: `dpl_61xLAWktZ12dkHHmuxCKgmWVPAxN` (READY).
Public page: https://eclipseesports.vercel.app/meta-lab

The earlier domain-only change retained v2.27.1. This subsequent authorized
deployment updates both `eclipseesports.vercel.app` and the previous
`eclipse-esports-stats.vercel.app` address to v2.28.0. A different origin
requires users to sign in again; server-side team records are unchanged.

## Public surface

- `/meta-lab` rewrites to `meta-lab.html`. No password needed.
- Reuses the same rank tierlists, hero skills/counters, patch views and PNG
  export as the private app; no duplicated scoring algorithm or source data.
- All four ranks remain available: Epic, Legend, Mythic, Mythical Glory+.
- A public link is available on the team login and auth-unavailable screens.
  A separate “Jamoa kirishi” link returns to the existing private team gate.
- Public entry loads only date utilities and Meta Lab scripts. It does not
  instantiate AuthManager, DataStore, CloudSync, submissions or OCR, and does
  not read admin sessions or cached team data even on a captain's device.
- Existing Solar Eclipse tokens/components are retained with a compact public
  header rather than the private team sidebar.

## Access boundary

Public GETs: `/api/mlbb-meta`, `/api/mlbb-heroes`, `/api/mlbb-patches`,
`/api/mlbb-image`. Only normalized public MLBB source data is returned.

Unchanged protected areas: team sync/statistics, roster, Briefing, submissions,
OCR, correction history, backups, admin sync and portrait-reference writes.
Public read permissions must never be reused for those endpoints.

Public cache misses have bounded refresh/cooldown controls in the existing
Redis cache. No additional paid service, AI provider call or database migration
is introduced. Stale/partial data keeps its provenance and freshness status;
unavailable data is not fabricated. Errors are not CDN-cached.

Refresh budgets: 60 dossier refresh starts/hour and 400 portrait fetch starts/hour
globally, with per-hero/cohort cooldowns and bounded shared-cache waiting for
concurrent readers. Small public portraits are cached for one day. These are
upstream-work limits, not visitor limits; already cached content remains readable.

## Verification

Mocked API and DOM checks cover anonymous reads, private endpoint protection,
canonical-ID restrictions, refresh budgets, all rank switches, dossier opening,
PNG export without Authorization, retry states and private-storage isolation.
The complete local regression suite passed: 320 tests, zero failures or skips.
Post-deploy HTTP checks passed: both domains serve v2.28.0; `/meta-lab`,
all four rank datasets, hero catalog and patches return 200 anonymously.
Private sync, Briefing and submissions return 401 anonymously.
The new deployment's initial error-level log query returned no entries.
No browser QA or team-record writes performed. No new monitoring/drains configured.

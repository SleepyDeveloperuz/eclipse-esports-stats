# Eclipse Esports

Private-team MLBB analytics and captain workflow with a Solar Eclipse visual identity.

Current production release: **v2.30.1 — Meta Lab layout repair**. Website: [eclipseesports.vercel.app](https://eclipseesports.vercel.app). The previous `eclipse-esports-stats.vercel.app` address still works. Eclipse Progress, the automatic-first scanner and local HEIC/HEIF conversion remain in place.

Public Meta Lab is live at [eclipseesports.vercel.app/meta-lab](https://eclipseesports.vercel.app/meta-lab). Team records and captain operations remain authenticated. See [RELEASE-v2.28.0.md](RELEASE-v2.28.0.md) for the access boundary and deployment verification.

Deployed: **v2.30.1**, retaining Installable Eclipse and v2.29.0 Meta Lab research
tools: Rank Lens, Meta Timeline, Hero Compare, local watchlist, per-hero scoring
explanations and shareable state links. Production verification passed on 2026-09-21.
See [RELEASE-v2.30.0.md](RELEASE-v2.30.0.md)
and [RELEASE-v2.29.0.md](RELEASE-v2.29.0.md).

## Install on your phone

- Android Chrome: open the site and choose **Ilovani o‘rnatish**, or use Chrome's
  **Install app / Add to Home screen** menu.
- iPhone/iPad Safari: **Share → Add to Home Screen**; enable **Open as Web App** if
  offered, then **Add**. Open the Eclipse home-screen icon afterwards.
- Desktop: use the supported browser's install action (or Safari **Add to Dock**).

The app opens the team entry page, which also links to public Meta Lab. Internet
is required for live data and uploads. Installation does not bypass team login or
change session expiry. It is a browser-installed app, not an App Store release.
Only the public offline page and its assets are service-worker cached; team HTML,
API responses and uploaded screenshots are not. Existing browser storage behavior
is unchanged. No offline upload queue or automatic retries are added. After an
interrupted upload, check match history before resubmitting.

Updates never force a reload. If notified, finish/save work, close all Eclipse
tabs and standalone windows, then reopen. Keep the `sw.js` cache version and shell
asset query versions aligned when changing the offline shell in future releases.

This repository contains the application source, tests, assets and operator tools. The source is public; team records, passwords, API keys and backup files are not included. Access to the deployed team's data requires an authenticated session.

## Features

- Separate Team 5 and individual/partial-squad statistics, player profiles and match insights.
- Full match entry, screenshot-assisted OCR, captain review and duplicate protection.
- Canonical hero portraits, skills, rank-specific counters, patch information and Epic/Legend/Mythic/Mythical Glory+ tier boards with PNG export.
- Briefing, polls, decisions, roster roles, hero pools and local lineup presets.
- Revision-aware synchronization, explicit conflict resolution, scoped sessions and rate limits.
- Private Mac backup and guarded restore tools, including latest-only automatic-backup retention.
- Eclipse Weekly publications and PNGs, contextual Win vs Loss comparisons, Hero Journey and Eclipse Moments cards.
- Multi-match screenshot pairing and queued uploads using the existing full scanner, plus server-side match correction history and guarded Undo.

See [RELEASE-v2.27.0.md](RELEASE-v2.27.0.md) for feature limits, journal retention and deployment verification.

## Project layout

| Path | Contents |
| --- | --- |
| `index.html`, `js/`, `css/`, `assets/` | Vanilla JavaScript frontend and visual assets |
| `api/` | Vercel API functions |
| `lib/` | Storage, validation, MLBB ingestion and recovery logic |
| `tests/` | Offline Node regression tests |
| `scripts/` | Syntax checks, optional DOM tests and backup/restore commands |

## Development and checks

Use Node.js 22 or newer. Core tests use Node's built-in test runner and do not require production credentials:

```sh
npm test
npm run check
```

The optional DOM suite requires `jsdom`. With it available in the local environment:

```sh
node --test scripts/ui-regression.test.mjs
```

Alternatively, set `ECLIPSE_JSDOM_PATH` to an existing absolute path to `jsdom/lib/api.js`.

For local API development, use the Vercel CLI with your own development configuration. Opening `index.html` directly is not a substitute for the authenticated API. Do not connect development experiments to a live team's database.

## Deployment and data safety

See [DEPLOYMENT.md](DEPLOYMENT.md) for server-side configuration. `.env.example` contains placeholders only. Keep real values in private environment files or the deployment provider's environment settings; never commit them.

The backend uses Upstash Redis for team data and MLBB caches. Preserve the configured team namespace after migration. Do not restore an old database or roll back to an old storage implementation without reviewing the recovery instructions.

See [BACKUP-MAC.md](BACKUP-MAC.md) for backup and restore procedures. Restore is dry-run by default. Daily Mac scheduling is not activated by cloning or deploying this repository.

Screenshot submission is automatic-first: loading screenshots starts extraction, original-catalog portrait matching fills heroes, and badge close-ups help read medals. The completed summary has a Submit action and optional edits; there are no mandatory hero/medal confirmation buttons. Unreadable required fields still need a clearer screenshot or correction. Date/type use the visible form choices; lanes may use a labelled roster default, not a proven lane from the screenshot.

Recognition is assistive, not guaranteed. The five-match development benchmark in the v2.26.1 notes is not a held-out accuracy guarantee. Screenshots and crops are not persisted by the application or included in this repository; the existing configured AI provider processes the original images and supplementary badge crop. Eclipse tiers are experimental derived rankings, not official Moonton ratings; source attribution is retained in Meta Lab.

Details and validation results: [v2.25 release notes](RELEASE-v2.25.md), [v2.25.1 hotfix](RELEASE-v2.25.1.md), [v2.26 historical recognition workflow](RELEASE-v2.26.md), [v2.26.1 automatic-first release](RELEASE-v2.26.1.md).

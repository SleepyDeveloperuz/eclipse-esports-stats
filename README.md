# Eclipse Esports

Private-team MLBB analytics and captain workflow with a Solar Eclipse visual identity.

Current release: **v2.25.1**. Website: [eclipse-esports-stats.vercel.app](https://eclipse-esports-stats.vercel.app).

This repository contains the application source, tests, assets and operator tools. The source is public; team records, passwords, API keys and backup files are not included. Access to the deployed team's data requires an authenticated session.

## Features

- Separate Team 5 and individual/partial-squad statistics, player profiles and match insights.
- Full match entry, screenshot-assisted OCR, captain review and duplicate protection.
- Canonical hero portraits, skills, rank-specific counters, patch information and Epic/Legend/Mythic/Mythical Glory+ tier boards with PNG export.
- Briefing, polls, decisions, roster roles, hero pools and local lineup presets.
- Revision-aware synchronization, explicit conflict resolution, scoped sessions and rate limits.
- Private Mac backup and guarded restore tools, including latest-only automatic-backup retention.

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

Hero recognition is assistive, not guaranteed. Real-image accuracy has not yet been benchmarked. Eclipse tiers are experimental derived rankings, not official Moonton ratings; source attribution is retained in Meta Lab.

Details and validation results: [v2.25 release notes](RELEASE-v2.25.md), [v2.25.1 hotfix](RELEASE-v2.25.1.md).

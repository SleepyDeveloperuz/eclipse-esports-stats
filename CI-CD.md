# Eclipse Esports — Continuous Integration & Deployment (CI/CD)

This document describes the automated testing, verification, and deployment pipeline connecting **GitHub** (`main` branch) to **Vercel** production hosting for [eclipseesports.vercel.app](https://eclipseesports.vercel.app).

---

## 1. Everyday Pipeline Architecture

```
[ Local Commit / Push ] 
          │
          ▼
   GitHub Repository (main)
          │
    ┌─────┴─────────────────────────────────┐
    ▼                                       ▼
GitHub Actions (Eclipse CI)        Vercel Production Build
  • Lockfile check (`npm ci`)        • Independent build gate
  • Syntax check (83 files)          • Runs same test & build suite
  • 480 unit & DOM tests             • Generates public/ artifact
  • Static asset build               • Atomic production swap
```

1. **Trigger:** Any commit or pull request merged into `main` automatically triggers both GitHub Actions and Vercel's native deployment runner.
2. **Dual Independent Gates:** GitHub and Vercel run the exact same verification suite independently. Vercel never publishes if `npm run build` fails.
3. **Atomic Production Deployment:** Successful Vercel builds swap traffic to the new deployment instantly. Failed builds leave the previous healthy deployment live with zero downtime.
4. **Secret-Free Pull Requests:** Pull requests from contributors run the complete test suite in a sandboxed, secret-free environment. Production secrets (Redis tokens, Gemini keys, Telegram secrets) are never exposed to PR builds.

---

## 2. Local & CI Verification Commands

The project requires **Node.js 24.x**:

```sh
# Clean install with pinned dependencies
npm ci --include=dev --ignore-scripts

# 1. Run syntax verification across all 83 files (JS, MJS, HTML, CSS, JSON)
npm run check

# 2. Run the offline test suite (480 tests, 0 external API calls)
npm test

# 3. Run the complete CI sequence (syntax, tests, and build)
npm run ci

# 4. Generate the production static directory (public/)
npm run build
```

---

## 3. Test Suite Breakdown (480 Automated Tests)

The test suite runs fully offline in Node.js using native `node:test` and `node:assert/strict` with `jsdom`:

| Test Suite | File | Focus Area |
| :--- | :--- | :--- |
| **Smart Roster Matcher** | `tests/roster-matcher.test.js` | Fuzzy matching, clan prefix removal, real name lookup, guest filtering |
| **AI OCR & Ingestion** | `tests/ocr.test.js`, `tests/ocr-ui.test.js` | Gemini Vision payload formatting, math validation (`sum(kills) == teamKills`) |
| **Telegram Bot** | `tests/telegram-bot.test.js` | Screenshot ingestion, markdown card formatting, captain callback approvals |
| **Coach Intelligence** | `tests/coach.test.js` | 5-match rolling blocks, roamer heuristics, stale data filters, JSDOM UI |
| **Weekly Focus & Progress** | `tests/weekly-focus.test.js`, `tests/progress-*.test.js` | Baseline calculations, Tashkent week fences, revision conflicts |
| **MLBB Meta & Provider** | `tests/mlbb-*.test.js` | Moonton/Rone upstream parsing, counter logic, tier lists, offline caching |
| **Data & Storage Adapters** | `tests/data.test.js`, `tests/storage-*.test.js` | Upstash Redis transactions, schema normalization, CAS revisions |

CI runners strip all production credentials from test subprocesses and reject any skipped or cancelled tests. External APIs (Gemini, Telegram, Moonton, Redis) are strictly mocked.

---

## 4. Build Pipeline & Production Packaging

When `npm run build` executes (`scripts/build.mjs`):
1. Runs `scripts/check.mjs` to ensure 100% syntax validity across all project files.
2. Creates or cleans the target `public/` directory.
3. Copies only essential client-facing runtime assets:
   - Root files: `index.html`, `manifest.json`, `robots.txt`, `favicon.ico`.
   - Folders: `css/`, `js/`, `assets/`, `meta-lab/`.
4. **Serverless Isolation:**
   - Serverless endpoints (`api/`) remain in Vercel's serverless runtime.
   - Internal scripts (`scripts/`), tests (`tests/`), helper libraries (`lib/`), and documentation (`*.md`) are excluded from public static output.
5. Vercel Hobby 12-function limit is respected: Telegram webhook routing is embedded within `/api/submissions` via query routing (`?telegram=webhook`).

---

## 5. Recovery & Rollback Procedures

If an unexpected production defect occurs:
1. **Instant Vercel Rollback:** Navigate to **Vercel Dashboard → Deployments**, select the previous known-good deployment, and click **Promote to Production**. This instantly reverts live traffic without waiting for a Git build.
2. **Git Revert:** In the repository, revert the offending commit:
   ```sh
   git revert HEAD
   git push origin main
   ```
3. **Database Consistency:** If data corruption occurred, inspect the latest automatic Mac snapshot and follow [BACKUP-MAC.md](BACKUP-MAC.md) for dry-run verification and authorized restore.

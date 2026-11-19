# Eclipse Esports

Private-team MLBB (Mobile Legends: Bang Bang) analytics, match intelligence, and captain command center with a Solar Eclipse visual identity.

Repository version: **v2.44.0 — Match kiritish va tekshirish**.
Production website: [eclipseesports.vercel.app](https://eclipseesports.vercel.app) (mirror: `eclipse-esports-stats.vercel.app`).
Public Meta Lab URL: [eclipseesports.vercel.app/meta-lab](https://eclipseesports.vercel.app/meta-lab).
Full release notes: [CHANGELOG.md](CHANGELOG.md). Local audit changes and verification limits: [AUDIT-PROGRESS.md](AUDIT-PROGRESS.md). Release verification details are recorded there.

---

## Official Team Roster

The stored roster and player IDs are authoritative. This reference list does not seed missing data. OCR identity uses full IGNs and owner-confirmed aliases; real names and shared name fragments do not establish a match:

| In-Game Nickname (IGN) | Asosiy Rol (Primary) | Qo‘shimcha Rol (Secondary) | Jamoaviy Rol / Teglar |
| :--- | :--- | :--- | :--- |
| `heavenly as always`  | Roamer | Jungler / Mid Laner | 👑 Captain, IGL, Flex |
| `Shadow as always` | Gold Laner | Jungler | 🎯 Shotcaller, Flex |
| `no one's hero` | Roamer | Gold Laner | 🛡 Passive, Rising Star |
| `Lyza the heroine` | EXP Laner | Mid Laner | ⚔️ Initiator |
| `- Kenia`  | Jungler | EXP Laner | 🗡 Core |
| `LEADER` | Mid Laner | Roamer | 🔮 Initiator |

---

## Core Capabilities & Architecture

### 1. Smart Match Ingestion & AI OCR
- **Trio (3-Player) & Team 5 Auto-Separation:** In ranked or scrim games played as a Trio (3 Eclipse members + 2 random solo-queue teammates), the system extracts our 3 roster players and cleanly excludes the 2 random pub players (`guest` rows) so team statistics remain pure.
- **Roster IGN Matching:** Complete IGNs and owner-confirmed aliases identify active roster members after normalizing clan prefixes and punctuation. Shared name fragments and real names do not establish identity; ambiguous matches stay unresolved.
- **Dual-Screenshot Fusion & Pixel Matcher:** Scoreboard and Data screenshots must agree on Battle ID and any readable result/duration before merging by IGN. Portraits come from the scoreboard's original rows even when Data rows are reordered. The website and server share portrait localization and ranking; uncertain candidates require manual selection. Result screens use standard hero portraits, not equipped skins.
- **Mathematical Integrity Validation:** Checks `sum(kills) == teamKills` only when all five friendly players are tracked roster members with known kills. Solo, duo and trio records do not invent guest statistics to complete the sum.
- **Duplicate Protection:** Scans match Battle IDs against existing official records and alerts the captain immediately if a match has already been stored.

Local evaluation uses manually transcribed roster values in `tests/fixtures/ocr-golden.json`. The four approved screenshot pairs yielded 168/168 numeric, identity and medal comparisons after enlarging medal strips. A separate nine-portrait sample yielded nine correct first candidates: seven accepted automatically and two left for manual selection. These small samples do not establish general accuracy. `node scripts/evaluate-ocr.mjs --label detail` checks local cached results without API calls; `--heroes-only --images /absolute/image/directory --label heroes` evaluates portraits locally. Original images and provider caches are excluded from Git. `--live` is a separate, potentially paid external upload and is never needed to replay cached checks.

### 2. Multi-Match Batch Upload & Production Bundling
- Supports batch uploading 3 to 10 screenshots (1 to 5 matches).
- Automatically pairs shuffled or inverted screenshot order (e.g. Damage screen uploaded before Scoreboard).
- The production pipeline concatenates the main classic scripts into one deferred JS bundle and compacts the main CSS into one bundle. Module scripts, fonts and other assets remain separate. Content hashes invalidate stale bundle URLs; browser speed improvements have not been measured.

### 3. Telegram Bot Integration
- **Direct Bot Submissions:** Teammates whose Telegram user IDs are allowed can send MLBB match screenshots directly to the bot.
- **Instant AI Extraction:** The bot parses K/D/A, heroes, medals, and multikills (Maniac/Savage) and formats a rich Telegram card.
- **Interactive Captain Inline Approval:** Captain receives instant `[✅ Tasdiqlash]` and `[❌ Rad etish]` inline buttons to approve the match directly into official statistics.
- **Protected Webhook & Callbacks:** Webhook ingestion requires its secret. Private commands/uploads require an allowed user ID, group commands require the configured team group, and review callbacks require the captain's sender ID.
- **Bot Commands:** `/start`, `/roster`, `/scrims`, `/meta` (one-click copy ban/pick recommendations for Mythical Glory+), `/stats`, and `/help`.

### 4. MLBB Meta Lab & Analytics
- Live synchronization of hero win rates, pick rates, and ban rates across Mythic and Mythical Glory+.
- Rank-specific counter recommendations, hero synergy, and patch impact tracking.
- Hero pools show captain-entered Comfort, Backup and Learning choices. Empty categories stay empty; these labels are not tournament-readiness ratings.
- Turso Serverless SQLite storage with atomic revision guards. Normal writes are limited to 2,500 matches, 50 players, 300 heroes and 1,500,000 bytes of compact core JSON. Oversized writes fail explicitly; official match history is not trimmed to fit.
- Lord/Turtle counts are not collected from screenshots or manual match forms. Legacy stored values are retained.

---

## Project Layout

| Path | Contents |
| --- | --- |
| `index.html`, `js/`, `css/`, `assets/` | Frontend single-page app and Eclipse visual design system |
| `api/` | Vercel Serverless Functions (Sync, Submissions, OCR, Meta Lab, Auth) |
| `lib/` | Core logic, smart roster matcher, storage adapters (Turso/Redis), Telegram bot, MLBB engine |
| `tests/` | Offline Node.js unit, contract and regression tests |
| `scripts/` | Syntax checks, production bundle & static build scripts, and Mac backup/restore tools |

---

## Versiya Yangiliklari & Relizlar (Changelog)

Batafsil xronologik o‘zgarishlar tarixi bilan [CHANGELOG.md](CHANGELOG.md) faylida tanishishingiz mumkin.

### Repository versiyasi: `v2.44.0`
- **Saqlash (`lib/turso-store.js`):** Turso va Redis tanlanadigan backendlar; ular o‘zaro avtomatik backup emas. Tarix, parallel yozish va tiklash tekshiruvlari audit qaydida berilgan.
- **Ikki skrinshot va hero matcher:** Bir matchga tegishliligi tekshirilgan ekranlar birlashtiriladi. Noma’lum qiymatlar taxmin bilan to‘ldirilmaydi, noaniq hero qo‘lda tanlanadi. PNG dekodlash tanish aniqligini kafolatlamaydi.
- **Frontend:** Tartibli deferred yuklash, xatoda qayta urinish, so‘rov kutish chegaralari va ixcham bundlelar.
- **Telegram:** Webhook siri, ruxsatli Telegram ID’lar va kapitan callback tekshiruvi. Bo‘sh roster yoki hero pool namunaviy ma’lumot bilan to‘ldirilmaydi.
- **Lokal audit (2026-11-18):** Natijalar, tarix saqlanishi va bajarilmagan real muhit tekshiruvlari [AUDIT-PROGRESS.md](AUDIT-PROGRESS.md) da.

---

## Development & Testing

Supported runtime: **Node.js 24.x**, matching `package.json`. See the audit record for the runtime actually used in local checks.

```sh
# Unit and contract tests, without real external API calls
npm test

# Source syntax and file checks
npm run check

# Full offline gate, including UI regression tests; fails on skips
npm run ci

# Run the full gate and generate local public/ assets
npm run build
```

`npm run bot` starts the real Telegram polling runner using configured credentials; it is not an offline test.

---

## Deployment & Security

- **Vercel Hobby 12-Function Limit:** Serverless endpoints are consolidated efficiently; Telegram webhook routes are safely integrated into `/api/submissions`.
- **Session Security:** Cryptographically signed tokens with separated Admin and Viewer scopes.
- **Database:** Turso is selected when configured; otherwise Redis is used. Backups are explicit exports. Approval retains up to 50 approved submission documents; Redis may remove closed submission documents under size pressure. Pending submissions and official match history are not this retention target. Storage limits and 413 responses remain possible.

See [DEPLOYMENT.md](DEPLOYMENT.md) for full configuration details and [BACKUP-MAC.md](BACKUP-MAC.md) for private backup procedures.

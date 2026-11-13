# Eclipse Esports

Private-team MLBB (Mobile Legends: Bang Bang) analytics, match intelligence, and captain command center with a Solar Eclipse visual identity.

Current production release: **v2.36.0+ — Trio & Team 5 Smart Ingestion, Telegram Bot & Permanent Roster Sync**.  
Production website: [eclipseesports.vercel.app](https://eclipseesports.vercel.app) (mirror: `eclipse-esports-stats.vercel.app`).  
Public Meta Lab is live at [eclipseesports.vercel.app/meta-lab](https://eclipseesports.vercel.app/meta-lab).

---

## Official Team Roster

The roster links in-game nicknames (IGNs) with permanent player identities. In-game tags and clan prefixes (`FS `, `I'm `, `[ECL]`, `亗`, `◆`) change between seasons, but real player identities remain anchored:

| In-Game Nickname (IGN) | Haqiqiy Ism (Real Name) | Asosiy Rol (Primary) | Qo‘shimcha Rol (Secondary) | Jamoaviy Rol / Teglar |
| :--- | :--- | :--- | :--- | :--- |
| `heavenly as always` | **Husniddin** | Roamer | Jungler / Mid Laner | 👑 Captain, IGL, Flex |
| `Shadow as always` | **Sanjar** | Gold Laner | Jungler | 🎯 Shotcaller, Flex |
| `no one's hero` | **Ulug'bek** | Roamer | Gold Laner | 🛡 Passive, Rising Star |
| `Lyza the heroine` | **Shohruh** | EXP Laner | Mid Laner | ⚔️ Initiator |
| `- Kenia` | **Otabek** | Jungler | EXP Laner | 🗡 Core |
| `LEADER` | **Nabixo'ja** | Mid Laner | Roamer | 🔮 Initiator |

---

## Core Capabilities & Architecture

### 1. Smart Match Ingestion & AI OCR
- **Trio (3-Player) & Team 5 Auto-Separation:** In ranked or scrim games played as a Trio (3 Eclipse members + 2 random solo-queue teammates), the system extracts our 3 roster players and cleanly excludes the 2 random pub players (`guest` rows) so team statistics remain pure.
- **Smart Roster & Real Name Matching:** Multi-level fuzzy matching automatically strips clan tags, decorative unicode (`◆`, `々`, `亗`, `★`), prefixes (`FS `, `Uchx `, `Look `), and phrases (`I'm ... as always`) to match the canonical roster and real names with 100% precision.
- **Dual-Screen Auto-Pairing:** Scoreboard (K/D/A, gold, medals, battle ID) and Data/Damage (hero damage, damage taken, turret damage, teamfight %) are paired by exact 18-digit Battle ID or duration/result sequence.
- **Mathematical Integrity Validation:** Automatically validates that individual player kills sum to the friendly score header (`sum(kills) == teamKills`).
- **Duplicate Protection:** Scans match Battle IDs against existing official records and alerts the captain immediately if a match has already been stored.

### 2. Multi-Match Batch Upload
- Supports batch uploading 3 to 10 screenshots (1 to 5 matches).
- Automatically pairs shuffled or inverted screenshot order (e.g. Damage screen uploaded before Scoreboard).
- Provides visual match cards with manual pairing fallback so no unread match is lost.

### 3. Telegram Bot Integration
- **Direct Bot Submissions:** Teammates can send MLBB match screenshots directly to the Telegram bot.
- **Instant AI Extraction:** The bot parses K/D/A, heroes, medals, and multikills (Maniac/Savage) and formats a rich Telegram card.
- **Interactive Captain Inline Approval:** Captain receives instant `[✅ Tasdiqlash]` and `[❌ Rad etish]` inline buttons to approve the match directly into official statistics.
- **Bot Commands:** `/start`, `/roster`, `/scrims`, `/meta` (one-click copy ban/pick recommendations for Mythical Glory+), `/stats`, and `/help`.

### 4. MLBB Meta Lab & Analytics
- Live synchronization of hero win rates, pick rates, and ban rates across Mythic and Mythical Glory+.
- Rank-specific counter recommendations, hero synergy, and patch impact tracking.
- Hero Pool Depth Matrix (S-Tier comfort, A-Tier backup, and Joker/Pocket picks) for tournament ban resilience.

---

## Project Layout

| Path | Contents |
| --- | --- |
| `index.html`, `js/`, `css/`, `assets/` | Frontend single-page app and Eclipse visual design system |
| `api/` | Vercel Serverless Functions (Sync, Submissions, OCR, Meta Lab, Auth) |
| `lib/` | Core logic, smart roster matcher, storage adapters, Telegram bot, MLBB engine |
| `tests/` | Offline Node.js test suite (480 unit, contract, and regression tests) |
| `scripts/` | Syntax checks, static build scripts, and Mac backup/restore tools |

---

## Development & Testing

Requires Node.js 22 or newer:

```sh
# Run the complete test suite (480 tests, 0 dependencies on external APIs)
npm test

# Run syntax and file integrity checks across all 83 project files
npm run check

# Run local Telegram bot polling runner (development/testing)
npm run bot
```

---

## Deployment & Security

- **Vercel Hobby 12-Function Limit:** Serverless endpoints are consolidated efficiently; Telegram webhook routes are safely integrated into `/api/submissions`.
- **Session Security:** Cryptographically signed tokens with separated Admin and Viewer scopes.
- **Database:** Upstash Redis with revision-aware concurrency and atomic backups.

See [DEPLOYMENT.md](DEPLOYMENT.md) for full configuration details and [BACKUP-MAC.md](BACKUP-MAC.md) for private backup procedures.

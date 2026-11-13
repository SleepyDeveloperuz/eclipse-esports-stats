# Eclipse Esports — Deployment & Infrastructure Guide

Current release: **v2.38.0 — Real Trio Matching, Mathematical Integrity Verification & Telegram Album Ingestion**

---

## Production Environment Variables

Configure these variables in **Vercel → Project Settings → Environment Variables**:

| Variable | Required | Purpose |
| :--- | :---: | :--- |
| `ADMIN_PASSWORD` | **Yes** | Captain/Admin login password. Use a long, cryptographically secure string. |
| `VIEWER_PASSWORD` | **Yes** | Shared team viewer password for authenticated teammate access. |
| `SESSION_SECRET` | **Yes** | Server-only HMAC secret (min 32 random bytes) used to sign session tokens. |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key used for screenshot OCR, hero detection, and stats extraction. |
| `TELEGRAM_BOT_TOKEN` | **Yes** | Telegram Bot API token from `@BotFather` for automated match notifications and submission bot. |
| `TELEGRAM_CHAT_ID` | Optional | Telegram chat ID of the Captain for direct match submission approval alerts. |
| `TELEGRAM_GROUP_ID` | Optional | Telegram group/supergroup ID (e.g. `-1003648509145`) for team announcements. |
| `TELEGRAM_WEBHOOK_SECRET`| Optional | Secret token to verify Telegram webhook requests. |
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | **Yes** | HTTPS REST endpoint of Upstash Redis holding team matches, roster, and MLBB cache. |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | **Yes** | Server-only REST access token for Upstash Redis. |
| `GIST_ID` | **Yes** | Team namespace identifier. Do not alter after database initialization. |
| `CRON_SECRET` | Optional | Random secret used by Vercel Cron to authorize daily MLBB Meta Lab syncs. |
| `MLBB_META_ENABLED` | Optional | Set `true` to enable Meta Lab syncing. Defaults to `true`. |
| `MLBB_PROVIDER` | Optional | Upstream MLBB provider: `rone` (default), `auto` (direct Moonton with Rone fallback), or `direct`. |

---

## Telegram Bot Integration

The Telegram bot supports two operation modes:

### 1. Production Mode (Vercel Webhook)
To satisfy Vercel's Hobby 12-function limit, the Telegram webhook route is consolidated inside `/api/submissions`:
```
Endpoint: https://eclipseesports.vercel.app/api/submissions?telegram=webhook
```
Register the webhook with Telegram:
```sh
curl -F "url=https://eclipseesports.vercel.app/api/submissions?telegram=webhook" \
     -F "secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET" \
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

### 2. Local Development Mode (Long Polling)
For local testing or offline environments, use the built-in runner:
```sh
npm run bot
```
The runner polls Telegram for updates, processes screenshot uploads via Gemini Vision, and handles interactive callback approvals without requiring a public URL.

---

## Match Submission & Roster Architecture

1. **Roster Real Names:** Roster players have both in-game nicknames (`name`) and permanent real identities (`realName`). The system links:
   - `heavenly as always` → **Husniddin** (Captain)
   - `Shadow as always` → **Sanjar**
   - `no one's hero` → **Ulug'bek**
   - `Lyza the heroine` → **Shohruh**
   - `- Kenia` → **Otabek**
   - `LEADER` → **Nabixo'ja**
2. **Trio vs Team 5 Scope:**
   - **Trio / Partial Squad (3 Eclipse members):** System captures only our 3 tracked players and marks the match as `scope: "squad"`. The 2 random pub players are kept as `guest` rows and never pollute team averages or win rate statistics.
   - **Team 5 (5 Eclipse members):** System tracks all 5 members under `scope: "team5"`.
3. **Dual-Screen Auto-Pairing:** Scoreboard and Damage screenshots are matched via 18-digit Battle ID or duration/result chronological sequence.

---

## Data Safety & Backups

- Team data is backed up in Upstash Redis with revision-aware concurrency checks (`_storageRevision`).
- Regular offline Mac backups are scheduled using `scripts/team-backup-daily.mjs`. See [BACKUP-MAC.md](BACKUP-MAC.md) for verification procedures.
- Restore scripts run in **dry-run** mode by default to prevent accidental data overwrites.

# Eclipse Esports — Deployment & Infrastructure Guide

Current release: **v2.43.0 — Team Analytics, Progress and Hero Pools**

---

## Production Environment Variables

Configure these variables in **Vercel → Project Settings → Environment Variables**:

| Variable | Required | Purpose |
| :--- | :---: | :--- |
| `ADMIN_PASSWORD` | **Yes** | Captain/Admin login password. Use a long, cryptographically secure string. |
| `VIEWER_PASSWORD` | **Yes** | Shared team viewer password for authenticated teammate access. |
| `SESSION_SECRET` | **Yes** | Server-only HMAC secret (min 32 random bytes) used to sign session tokens. |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key used for screenshot OCR, hero detection, and stats extraction. |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Server-only Bot API token for notifications and ingestion. |
| `TELEGRAM_CHAT_ID` | For notifications | Alert destination. A positive private chat ID is also the legacy captain identity; a group ID never grants approval rights. |
| `TELEGRAM_CAPTAIN_USER_ID` | For review actions | Positive numeric captain user ID, checked against the callback sender. Overrides the positive `TELEGRAM_CHAT_ID` fallback. |
| `TELEGRAM_ALLOWED_USER_IDS` | For teammate DMs | Comma-separated positive user IDs permitted private commands and photo uploads. Captain is included automatically; empty means captain only. |
| `TELEGRAM_GROUP_ID` | For group access | The only group where human members can run team commands and receive announcements. Group membership does not grant private upload or review rights. |
| `TELEGRAM_WEBHOOK_SECRET` | For webhook ingestion | Required shared secret registered with Telegram and checked on every webhook POST. Missing configuration disables ingestion. |
| `TURSO_DATABASE_URL` | For Turso | Primary team database address. Turso takes precedence over Redis when both Turso values are configured. |
| `TURSO_AUTH_TOKEN` | For Turso | Server-only Turso access token. Backup-only tools may use a read-only token. |
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | For Redis features | Upstash REST endpoint for MLBB cache and legacy team storage when Turso is not configured. |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | For Redis features | Server-only REST access token for Upstash Redis. |
| `TEAM_NAMESPACE` | Optional | Stable backup identity. Overrides `GIST_ID`; otherwise Turso-only installations derive it from the database address. Preserve it during database moves. |
| `GIST_ID` | Legacy installations | Existing team namespace and initial Gist migration source. Preserve existing values; Turso-only installations may leave it empty. |
| `CRON_SECRET` | Optional | Random secret used by Vercel Cron to authorize daily MLBB Meta Lab syncs. |
| `MLBB_META_ENABLED` | Optional | Set `true` to enable Meta Lab syncing. Defaults to `true`. |
| `MLBB_PROVIDER` | Optional | Upstream MLBB provider: `rone` (default), `auto` (direct Moonton with Rone fallback), or `direct`. |

---

## Telegram Bot Integration

The Telegram bot supports two operation modes:

Both modes check sender and chat IDs before reading private data, downloading photos, calling OCR, or processing callbacks. Unknown private users, unrelated groups, anonymous group senders and bots are ignored. All `sub_*` review callbacks, including hero selection and cancel, require the captain's sender ID. Set the allowed user list before enabling teammate DMs; IGNs and Telegram usernames do not establish access.

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

The server's `TELEGRAM_WEBHOOK_SECRET` and registration `secret_token` must match. Missing bot/secret configuration returns 503; missing or invalid request secrets return 401. Valid Telegram deliveries from unapproved users are acknowledged with an ignored result, without reaching storage or OCR.

The website's `send_daily_summary` action is separate from webhook ingestion and requires a current admin session, including the shared revocation check. The bot token's `/api/sync` read exception is limited to `collection=matches` and `collection=roster`; it cannot export the full document or write data.

### 2. Local Development Mode (Long Polling)
For local testing or offline environments, use the built-in runner:
```sh
npm run bot
```
The runner loads local environment configuration before server modules, polls Telegram for updates, and uses the same sender/chat checks as the webhook. It does not require a webhook secret, because updates come from authenticated polling. Running it connects to Telegram and may invoke paid OCR for permitted photo submissions; offline tests use stubbed requests instead.

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

- Turso saves apply all document changes and the storage revision in one conditional write batch. A concurrent save retries against the latest snapshot; a SQL failure rolls back the entire batch. Legacy Redis storage retains its revision check.
- Application reads, backup and restore use the same configured backend. Exports contain the real storage revision and team identity; export and dry-run do not initialize an empty database.
- Offline Mac backups use `scripts/team-backup-daily.mjs`; recovery can be rehearsed in a temporary local database using `scripts/verify-team-recovery.mjs`. See [BACKUP-MAC.md](BACKUP-MAC.md) for procedures.
- Restore scripts run in **dry-run** mode by default to prevent accidental data overwrites.

# Deployment checklist

Before deploying this version, set these production variables in **Vercel → Project Settings → Environment Variables**:

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | The password used for the Admin login. Use a long, unique value. |
| `VIEWER_PASSWORD` | Required shared team password. Stats, Briefing and voting fail closed without a signed viewer or Admin session. |
| `SESSION_SECRET` | Random server-only value used to sign admin sessions. Generate at least 32 random bytes. |
| `GIST_ID` | Original private Gist ID; also the permanent Redis team namespace. Do not change it after migration. |
| `GITHUB_SYNC_TOKEN` | Server-only GitHub token able to read the original private Gist for the one-time import. Not used for ongoing writes. |
| `GEMINI_API_KEY` | Server-only Gemini key for screenshot OCR. Restrict it to the deployed site/API where Google allows it. |
| `MLBB_META_ENABLED` | `true` enables Meta Lab. Set `false` for an immediate feature rollback without deleting cache. |
| `MLBB_META_RANK` | Default upstream rank cohort. Recommended: `mythic`. |
| `MLBB_META_DAYS` | Default source window. Recommended: `7`. |
| `CRON_SECRET` | Random server-only value used by Vercel Cron to authorize `/api/mlbb-sync`. |
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | HTTPS REST URL of Upstash Redis. It now holds durable team data as well as MLBB caches. Marketplace normally injects the `KV_*` form. |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | Server-only REST token for that database. Marketplace normally injects the `KV_*` form. |

After adding or changing any variable, redeploy the project. Changing `SESSION_SECRET` logs out all existing Admin and viewer sessions, which is expected. `VIEWER_PASSWORD` must be different from `ADMIN_PASSWORD`.

`VIEWER_PASSWORD` and `SESSION_SECRET` are an inseparable pair: if either is missing, too short, or the viewer password equals the Admin password, team reads fail closed with HTTP 503 instead of silently becoming public. Verify the viewer login in a private/incognito window after every environment-variable change.

Rotate `ADMIN_PASSWORD`, `GEMINI_API_KEY` and any other secret that has ever been pasted into chat or shared in plain text before the next production deployment.

The frontend no longer stores a Gemini key in `localStorage`; every OCR request uses only the server-side `GEMINI_API_KEY`. Admin sessions can scan the full match form. Signed viewer sessions can scan only a `practice_submission` request, with a stricter per-device rate limit.

Cloud sync is fixed to the same-origin `/api/sync` endpoint. Legacy custom Firebase URLs are removed automatically; do not add a browser-side sync URL or send Eclipse session tokens to another origin.

## Briefing and team voting

The `/api/briefing` endpoint keeps a logical `eclipse_briefing.json` entry in the durable Redis team document. Only a verified Admin session can create, edit, close, or delete Briefing content.

Teammates can vote without an Admin login after entering the shared `VIEWER_PASSWORD`. The browser generates an anonymous device identifier and the server binds it to the signed viewer session; Briefing ignores a replacement identity header. Only its HMAC hash is stored in Redis, so the same signed browser device cannot vote twice on one poll. This is a small trusted-team control, not a substitute for individual player accounts.

Each vote is a logical poll-and-device sidecar entry. The main Briefing response merges those entries and deduplicates their signed voter hashes on every read; the next Admin write embeds accepted totals and compacts obsolete entries. Votes, poll closure, Admin edits and match approvals all use the same atomic Redis revision check. Reopening a poll preserves previous votes but clears the previous final decision; create a new poll for a fresh vote.

The single Redis document is intentionally sized for this small roster. A server-side compare-and-swap retries conflicting operations against the latest document, so partial approvals cannot be committed. This does not provide individual-account identity or an unlimited audit log.

## Practice Lite and Submission Inbox

The `/api/submissions` endpoint lets any signed team session submit a structured 1–4 player Practice Lite match. Screenshots are processed only in memory by OCR and are never persisted. A teammate can read only submissions created by the same signed browser identity; an Admin can review the complete queue. Create/approve validation uses the same Redis hero catalog as the client. Catalog outages do not prevent reading, rejecting or deleting existing submissions.

Pending and rejected submissions never enter analytics. Approval writes the normalized match to `eclipse_data.json` with `dataSource: "submission"` and keeps review state in a deterministic `eclipse_submission_<fingerprint>.json` sidecar. The fingerprint prevents duplicate matches and makes approval retry-safe.

Official data now carries an integer `revision`. Admin sync writes send their last known revision; stale tabs receive `DATA_REVISION_CONFLICT`, merge the latest remote snapshot, and retry once instead of silently overwriting a newly approved submission.

## v2.20.1 migration and recovery — required before release

This is a storage migration, not just a UI update. Nothing in the local tests imports or edits production data.

1. Keep the existing Gist and take a private backup of all its Eclipse files, not just the browser match export. Pause team edits, votes and submissions during cutover; close old Admin tabs and protect old deployment URLs against writes. Old Gist-writing deployments and the new Redis-writing deployment must not run concurrently.
2. Use a persistent Upstash database with eviction disabled and sufficient space for the live document plus five prior snapshots. Never clear `eclipse:team:*` as a cache. Preview deployments must use separate credentials/namespaces and test Gist data, not production data.
3. Deploy v2.20.1 with the existing Gist settings and Redis credentials. The first authenticated data read imports the Eclipse data, Briefing, submissions and votes into one Redis document. Incomplete/truncated Gist responses, malformed JSON or missing main data stop migration; they never create an empty replacement database. If Gist truncates a large file, complete a reviewed offline import first; do not bypass this check.
4. Compare match/player counts, pending/approved submissions, Briefing reviews and poll totals with the pre-cutover backup. Confirm Admin save, a viewer vote and a Lite approval. Only then reopen the site to the team.
5. Export the migrated bundle using `node --env-file=/secure/path/team.env scripts/team-backup.mjs /secure/path/eclipse-team-backup.json`. It reads the existing Redis document only, never initializes or changes the server. The destination must not already exist; keep this file private. Schedule independent backups through your infrastructure before relying on this as the sole database.

The Redis key is `eclipse:team:v1:<first 24 hex characters of SHA-256(GIST_ID)>`. It has no TTL. Each successful mutation atomically retains the last five prior documents at `<key>:backups`. `<key>:initialized` prevents silently reimporting stale Gist data if the live key is lost. These snapshots are short-term recovery, not a substitute for independent backups. Keep all three keys together during recovery; never delete the initialized marker to force an import.

The old Gist remains unchanged after migration. **Do not roll back to v2.20.0 after new writes:** it would resume from that stale Gist. First freeze writes and export the current Redis bundle. Prefer rolling forward with a fix that retains this storage adapter. If an old-code rollback is unavoidable, a reviewed offline export of every logical file back into Gist is required before routing traffic there. Restoring a Redis snapshot must also be done during a write freeze with the newer writes reconciled explicitly.

The live team document is capped at 4.5 MB and additionally bounded by Redis REST response size. Full storage, lost keys and connectivity failures fail closed. They do not fall back to Gist or report a failed write as successful.

## MLBB Meta Lab sync

The daily Vercel Cron calls `/api/mlbb-sync` at `03:00 UTC` (`08:00` in Tashkent). Vercel supplies `CRON_SECRET` as the Bearer token automatically. The same endpoint accepts an Admin-authenticated `POST` for a manual refresh from Meta Lab.

Hero catalog, Mythic 7-day rank data, patch summaries, sync health, hero detail and 90 days of rank history are stored in Upstash. The browser never calls Rone or Moonton directly and never receives the Redis token. A failed or malformed upstream refresh keeps the last-known-good dataset; the UI labels stale data instead of replacing it with an empty response.

After the first deployment, open Meta Lab as Admin and run one manual sync. Confirm that the response reports hero, rank-row and patch counts before relying on the daily schedule. Once that canonical catalog is available it replaces the old hand-maintained hero rows for match and Practice Lite forms; an upstream failure never performs that replacement. Hero IDs and name snapshots are then preserved in schema v4 match data, so historical matches remain readable when a display name changes.

Rone Arena API is an unofficial BSD-3-Clause source and must remain visibly attributed in Meta Lab; patch links point to the official Mobile Legends news source. Redis operations fail closed after a bounded timeout, while upstream sync failures continue serving the last-known-good cache.

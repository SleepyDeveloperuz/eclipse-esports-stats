# Eclipse Esports — Private Mac Backup & Recovery Runbook

This runbook outlines procedures for creating atomic offline backups and executing emergency restorations of the **Eclipse Esports** production database (Upstash Redis) using macOS command-line utilities.

---

## 1. Prerequisites & Environment Setup

Backups and restorations run locally on macOS using **Node.js 22+** (recommended: Node.js 24).

Create a private environment file outside the Git workspace (e.g. at `~/.config/eclipse/production.env`) with owner-only permissions (`chmod 0600`):

```sh
mkdir -p ~/.config/eclipse
chmod 0700 ~/.config/eclipse
touch ~/.config/eclipse/production.env
chmod 0600 ~/.config/eclipse/production.env
```

Populate `~/.config/eclipse/production.env` with the following keys:

```ini
# Production Redis Namespace Identifier
GIST_ID=YOUR_TEAM_NAMESPACE_ID

# Upstash Redis REST Credentials
UPSTASH_REDIS_REST_URL=https://YOUR_CLUSTER.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_UPSTASH_REST_TOKEN
```

> [!IMPORTANT]
> Never commit this file or paste production credentials into chat or public pull requests. A read-only token is sufficient for running backups; database restorations require a read-write credential.

---

## 2. Backup Scope & Data Structure

Each backup exports a single atomic snapshot containing all team state:
- **Core Team Data (`eclipse_data.json`):**
  - Roster players with permanent real names (`realName`: Husniddin, Sanjar, Ulug'bek, Shohruh, Otabek, Nabixo'ja).
  - Match history across all scopes (`squad` for Trio matches, `team5` for 5-man tournament games).
  - Filtered guest player statistics (`guestStats`) isolated from team records.
  - 18-digit Battle IDs and mathematical verification records.
- **Captain Briefings & Announcements:** Private squad directives and pins.
- **Submission Queue:** Pending screenshot submissions, Telegram bot approvals, and audit states.
- **Weekly Focus & Progress:** Up to 104 weeks of focus tasks, baselines, and evaluation verdicts.
- **AI Usage Ledger:** Operational scan durations and modification tallies.

---

## 3. Daily Automatic Backup

To run the backup script:

```sh
node --env-file=~/.config/eclipse/production.env scripts/team-backup-daily.mjs
```

### Destination & File Security
- **Default Directory:** `~/Eclipse Backups/` (created automatically with `0700` permissions if missing).
- **Naming Pattern:** `eclipse-backup-<TIMESTAMP>-rev<REVISION>.json` accompanied by a `.sha256` checksum sidecar.
- **File Permissions:** Created strictly with `0600` (readable and writable only by the current Mac user).
- **Concurrency Lock:** Uses `.eclipse-daily-backup.lock` to prevent overlapping or duplicate runs.

### Retention & Integrity Policy
- **Latest Verified Policy:** Keeps only the latest verified automatic backup for the team namespace.
- **Two-Phase Commit Verification:** The new backup file is written, flushed to disk, re-read, SHA-256 checksummed, and schema-validated **before** any older backup file is removed.
- If verification fails at any stage, the existing older backup is retained untouched.

---

## 4. Emergency Database Restoration (Operator Only)

Restoration is a two-step procedure that requires explicit authorization and an automatic pre-restore safety dump.

### Step 1: Pre-Flight Dry Run
Verify backup integrity, schema compliance, and revision compatibility without modifying the remote database:

```sh
node --env-file=~/.config/eclipse/production.env scripts/team-restore.mjs \
  ~/Eclipse\ Backups/eclipse-backup-2026-11-13-rev142.json \
  CURRENT_REVISION
```

- Replace `CURRENT_REVISION` with the active storage revision from the live database (or `-1` if restoring into an empty database).
- The dry run verifies file format, team namespace match, JSON syntax, ID integrity, and CAS revision sequence.

### Step 2: Authorized Live Apply
Only after the dry run succeeds and team writes are paused:

```sh
node --env-file=~/.config/eclipse/production.env scripts/team-restore.mjs \
  ~/Eclipse\ Backups/eclipse-backup-2026-11-13-rev142.json \
  CURRENT_REVISION \
  --apply \
  --save-before=~/.config/eclipse/before-restore-snapshot.json
```

### Safety Guarantees During Apply
1. **Mandatory `--save-before`:** The script immediately dumps the active live state to disk and verifies it before touching the remote Redis keys.
2. **CAS Revision Check:** Restores fail immediately if another client updated the database concurrently.
3. **No HTTP Exposure:** Restoration cannot be triggered via any web endpoint or API route; it requires physical operator terminal execution.
4. **Post-Restore Validation:** After restore, verify match counts, roster names, and captain briefings on [eclipseesports.vercel.app](https://eclipseesports.vercel.app).

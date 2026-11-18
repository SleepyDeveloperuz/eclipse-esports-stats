# Eclipse Esports — Private Mac Backup & Recovery Runbook

This runbook covers offline backups and emergency restoration of the **Eclipse Esports** database. The application, backup and restore tools select **Turso** when both Turso credentials are configured. Upstash Redis remains supported for legacy installations and is selected otherwise.

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
# Turso production database
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=YOUR_TURSO_TOKEN

# Optional stable namespace. Preserve an existing GIST_ID when present.
# TEAM_NAMESPACE=YOUR_EXISTING_TEAM_NAMESPACE

# Legacy Redis installations without Turso use these instead:
# GIST_ID=YOUR_EXISTING_TEAM_NAMESPACE
# UPSTASH_REDIS_REST_URL=https://YOUR_CLUSTER.upstash.io
# UPSTASH_REDIS_REST_TOKEN=YOUR_UPSTASH_REST_TOKEN
```

> [!IMPORTANT]
> Never commit this file or paste production credentials into chat or public pull requests. A read-only token is sufficient for running backups; database restorations require a read-write credential.

Namespace selection is `TEAM_NAMESPACE`, then `GIST_ID`, then a database-specific identity derived from the Turso address. Credentials are not part of the identity. New exports include their namespace. When moving a backup to a replacement database, set `TEAM_NAMESPACE` to the original export's `namespace`; changing it arbitrarily makes the backup belong to a different team. Old exports with the generic key `turso:team` are rejected; take a new verified export from the original database instead.

---

## 2. Backup Scope & Data Structure

Each backup reads the files and their actual storage revision from one consistent database snapshot. Export does not create tables, seed data, prune submissions or change live records. Legacy `null` submission entries are preserved. The snapshot contains:
- **Core Team Data (`eclipse_data.json`):**
  - Roster players with permanent real names (`realName`: Husniddin, Sanjar, Ulug'bek, Shohruh, Otabek, Nabixo'ja).
  - Match history across all scopes (`squad` for Trio matches, `team5` for 5-man tournament games).
  - Filtered guest player statistics (`guestStats`) isolated from team records.
  - Battle IDs stored as strings, without JavaScript number rounding, and mathematical verification records.
- **Captain Briefings & Announcements:** Private squad directives and pins.
- **Submission Queue:** Pending screenshot submissions, Telegram bot approvals, and audit states.
- **Weekly Focus & Progress:** Up to 104 weeks of focus tasks, baselines, and evaluation verdicts.
- **AI Usage Ledger:** Operational scan durations and modification tallies.

---

## 3. Daily Automatic Backup

To run the backup script:

```sh
node --env-file="$HOME/.config/eclipse/production.env" scripts/team-backup-daily.mjs
```

### Destination & File Security
- **Default Directory:** `~/Eclipse Backups/` (created automatically with `0700` permissions if missing).
- **Naming Pattern:** `eclipse-<UTC-TIMESTAMP>-r<STORAGE-REVISION>.json` (timestamp colons replaced by hyphens), accompanied by a `.sha256` checksum sidecar.
- **File Permissions:** Created strictly with `0600` (readable and writable only by the current Mac user).
- **Concurrency Lock:** Uses `.eclipse-daily-backup.lock` to prevent overlapping or duplicate runs.

### Retention & Integrity Policy
- **Latest Verified Policy:** Keeps only the latest verified automatic backup for the team namespace.
- **Two-Phase Commit Verification:** The new backup file is written, flushed to disk, re-read, SHA-256 checksummed, and schema-validated **before** any older backup file is removed.
- If verification fails at any stage, the existing older backup is retained untouched.

---

## 4. Emergency Database Restoration (Operator Only)

### Capacity errors and unsynced local changes

Normal application writes allow at most 2,500 matches, 50 roster players, 300 catalog heroes, and a compact UTF-8 core document of 1,500,000 bytes. These are application limits, not a promise that every 2,500-match dataset fits: participant details and text affect the byte size. Sync, submission approvals and match edits share the same server limit. Pretty-print whitespace no longer consumes that budget.

An existing local history above the record limit is preserved without migration or truncation. It remains available for reading and export, while edits and cloud replacement are blocked. Export that browser's complete JSON before any separate, explicitly approved archiving operation. A server backup cannot contain local edits that have never synced. Do not clear browser data, pending writes or drafts to dismiss the error.

On a browser quota error, snapshot/import writes roll back the keys changed by that attempt. Drafts and backups are not evicted. Cloud downloads and conflict merges save the roster, matches, catalog and sync metadata together. If space only permits a compact conflict baseline, record hashes are retained; simultaneous edits may require manual selection instead of field-level merging.

HTTP 413 leaves local edits pending. Repeating the same oversized upload will not make it fit. Automatic deletion or archival is not performed. Backup/restore remains a separate path and does not truncate a snapshot to meet application write limits; an over-capacity restored snapshot still requires an operator plan before normal writes can resume.

Restoration is a two-step procedure that requires explicit authorization and an automatic pre-restore safety dump.

First rehearse recovery entirely offline:

```sh
node scripts/verify-team-recovery.mjs \
  "$HOME/Eclipse Backups/eclipse-2026-11-17T00-00-00.000Z-r651.json"
```

Replace the example filename with the actual backup. The rehearsal opens only a new temporary local SQLite database, restores the backup, compares every match and player field, checks the other logical files byte for byte, and removes the temporary database. It never reads production credentials or writes to a remote database. For a legacy namespaced backup without a `namespace` field, pass its original namespace as the second argument. Normal restore metadata (`revision`, `updatedAt`, `lastMutationId`) advances; match records remain unchanged.

### Step 1: Pre-Flight Dry Run
Verify backup integrity, schema compliance, and revision compatibility without modifying the remote database:

```sh
node --env-file="$HOME/.config/eclipse/production.env" scripts/team-restore.mjs \
  "$HOME/Eclipse Backups/eclipse-2026-11-17T00-00-00.000Z-r651.json" \
  CURRENT_REVISION
```

- Replace `CURRENT_REVISION` with the active storage revision from the live database (or `-1` if restoring into an empty database).
- The dry run verifies file format, team namespace match, JSON syntax, ID integrity, and CAS revision sequence.

### Step 2: Authorized Live Apply
Only after the dry run succeeds and team writes are paused:

```sh
node --env-file="$HOME/.config/eclipse/production.env" scripts/team-restore.mjs \
  "$HOME/Eclipse Backups/eclipse-2026-11-17T00-00-00.000Z-r651.json" \
  CURRENT_REVISION \
  --apply \
  --save-before="$HOME/.config/eclipse/before-restore-snapshot.json"
```

### Safety Guarantees During Apply
1. **Mandatory `--save-before`:** The script dumps the active state to disk and verifies it before changing the configured database. An existing destination is never overwritten.
2. **CAS Revision Check:** Restores fail immediately if another client updated the database concurrently.
3. **No HTTP Exposure:** Restoration cannot be triggered via any web endpoint or API route; it requires physical operator terminal execution.
4. **Post-Restore Validation:** After restore, verify match counts, roster names, and captain briefings on [eclipseesports.vercel.app](https://eclipseesports.vercel.app).

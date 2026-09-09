# Personal Mac backups

Status: scripts implemented and restore behavior tested with an in-memory repository. **Daily scheduling and the first live export are not activated yet.** No production data has been restored or changed.

Use Node 22+ and a private environment file outside this repository. Required keys:

```
GIST_ID=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`GIST_ID` identifies the existing Redis namespace; these scripts never import the old Gist. An environment file must not be committed, pasted into chat, or included in the website upload. Make its parent directory private and its mode `0600`. A read-only Redis REST token can be used for backup where available; restoration requires a separately authorized writable credential.

## Backup

From this project directory, replace `/private/path/backup.env` with the actual private credential file:

```sh
node --env-file=/private/path/backup.env scripts/team-backup-daily.mjs
```

Default destination: `Eclipse Backups` in the current Mac user's home directory. You may pass another private destination as the last argument. Each run creates a unique timestamped file and SHA-256 sidecar, with owner-only file permissions. The destination must be a dedicated owner-only directory (`0700`), not a root, home or project folder.

**Retention, as requested: keep only the latest verified automatic backup for this team.** The new JSON and checksum are written, flushed to disk, read back, checked and schema-validated before any older backup is removed. Failure before verification preserves the previous copy. Concurrent runs are excluded by a lock; a crashed run's remaining `.eclipse-daily-backup.lock` must be inspected and removed manually only after confirming no backup is running. A new snapshot older than an existing verified revision stops retention.

Only regular files with this script's exact timestamp/revision filename, a valid matching checksum, and the same team namespace are eligible for permanent deletion. Manual exports, pre-restore backups, other teams, symlinks and unverifiable files are left alone. Deletion failures are reported and may temporarily leave more than one copy; a later successful run retries eligible old pairs. This policy intentionally removes historical rollback points: a logically mistaken but structurally valid new snapshot can replace the last good one.

The backup exports core data, Briefing, submissions and vote sidecars from one existing atomic snapshot. It refuses to manufacture an empty backup or seed a missing database. The project source-code archives are unrelated and are never retention targets.

A schedule should only be activated after a successful first export. The Mac must be available at run time; a Mac-only copy cannot protect against loss of that same Mac. Keep an occasional encrypted copy on another device. Local lineup presets and unsent browser drafts are not server data and are not included.

## Restore (operator only)

Stop team writes, including old deployment URLs. Check the backup's checksum and confirm the right team. Read the current `_storageRevision` from a fresh backup. Use `-1` only when the live database is confirmed missing.

```sh
node --env-file=/private/path/restore.env scripts/team-restore.mjs /private/path/backup.json CURRENT_REVISION
```

This is a **dry-run**. It validates format, namespace, JSON files, IDs, revision and size, without writing anything.

Only after reviewing the dry-run and explicitly authorizing a restore:

```sh
node --env-file=/private/path/restore.env scripts/team-restore.mjs /private/path/backup.json CURRENT_REVISION --apply --save-before=/private/path/before-restore.json
```

The destination for `--save-before` must not already exist and its parent directory must be owner-only (`0700`), owned by the current user, and not a symlink. The pre-image is created exclusively with `0600` permissions, flushed to disk, read back exactly, and its directory is flushed before the remote CAS. Any failure aborts the restore. A concurrent update also aborts it. Legacy cores without a public revision are treated as revision zero; explicitly malformed revisions still fail. Storage and public revisions are increased, not rolled back; Redis keeps its recent rollback snapshots too. No HTTP endpoint permits restoration. A missing-database restore records the absence rather than inventing a previous state.

After restoration, verify counts, approvals and Briefing before resuming writes. Reconcile unsent local browser changes explicitly; do not allow an old pending snapshot to silently reintroduce removed data. If the live database was missing, old browser revisions may be higher than the restored revision and need a supervised reset after preserving any unsent work.

import * as fs from 'node:fs/promises';
import { resolve, join, parse } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { readExistingTeamSnapshot } from './team-store.js';
import { validateBackup } from './team-restore.js';

const automaticName = /^eclipse-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-r\d+\.json$/;
const checksum = value => createHash('sha256').update(value).digest('hex');

// Only this script's verified, same-team automatic backups are retention targets.
// Manual exports, pre-restore copies, symlinks and other teams are left alone.
export async function saveDailyMacBackup({ destination = join(homedir(), 'Eclipse Backups'), gistId = process.env.GIST_ID, readSnapshot = readExistingTeamSnapshot, io = fs, now = new Date() } = {}) {
  const requested = resolve(destination);
  await io.mkdir(requested, { recursive: true, mode: 0o700 });
  const directory = await io.realpath(requested);
  const info = await io.lstat(requested);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && info.uid !== process.getuid())
    || [parse(directory).root, homedir(), process.cwd()].includes(directory)) {
    throw new Error('Choose a dedicated owner-only backup directory, not a home, project or root directory.');
  }
  const lockPath = join(directory, '.eclipse-daily-backup.lock');
  let lock;
  try { lock = await io.open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('A backup is running or a previous run left a lock. No backups were deleted.'); throw error; }
  const created = [];
  let verified = false;
  try {
    const candidates = (await io.readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && automaticName.test(entry.name)).map(entry => entry.name);
    const backup = await readSnapshot();
    validateBackup(backup, gistId);
    const content = JSON.stringify(backup, null, 2);
    const filename = `eclipse-${now.toISOString().replaceAll(':', '-')}-r${backup.state._storageRevision}.json`;
    const hashFile = `${filename}.sha256`;
    const expectedHash = checksum(content);
    for (const [name, data] of [[filename, content], [hashFile, `${expectedHash}  ${filename}\n`]]) {
      const file = await io.open(join(directory, name), 'wx', 0o600);
      created.push(join(directory, name));
      try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
    }
    const saved = await io.readFile(join(directory, filename), 'utf8');
    const savedHash = await io.readFile(join(directory, hashFile), 'utf8');
    if (checksum(saved) !== expectedHash || savedHash !== `${expectedHash}  ${filename}\n`) throw new Error('Backup verification failed. Previous backups were preserved.');
    validateBackup(JSON.parse(saved), gistId);
    // Persist directory entries before allowing retention to remove the old pair.
    const dirHandle = await io.open(directory, 'r');
    try { await dirHandle.sync(); } finally { await dirHandle.close(); }
    verified = true;
    const eligible = [], preserved = [], warnings = [];
    for (const name of candidates) {
      if (name === filename) continue;
      try {
        const path = join(directory, name), hashPath = `${path}.sha256`;
        if (!(await io.lstat(path)).isFile() || !(await io.lstat(hashPath)).isFile()) { preserved.push(name); continue; }
        const oldContent = await io.readFile(path, 'utf8');
        const oldHash = await io.readFile(hashPath, 'utf8');
        const old = JSON.parse(oldContent);
        validateBackup(old, gistId);
        if (oldHash !== `${checksum(oldContent)}  ${name}\n`) { preserved.push(name); continue; }
        if (old.state._storageRevision > backup.state._storageRevision) throw Object.assign(new Error('The new snapshot is older than an existing backup. Retention was stopped.'), { code: 'BACKUP_REVISION_REGRESSION' });
        eligible.push({ path, hashPath, name, contentHash: checksum(oldContent) });
      } catch (error) {
        if (error.code === 'BACKUP_REVISION_REGRESSION') throw error;
        preserved.push(name);
      }
    }
    const removed = [];
    for (const old of eligible) {
      try {
        // Recheck immediately before deletion; never unlink a replaced symlink.
        if (!(await io.lstat(old.path)).isFile() || !(await io.lstat(old.hashPath)).isFile()
          || checksum(await io.readFile(old.path)) !== old.contentHash) { preserved.push(old.name); continue; }
        await io.unlink(old.path); removed.push(old.name);
        await io.unlink(old.hashPath);
      } catch (_) { warnings.push(`Could not fully remove old backup pair: ${old.name}`); }
    }
    return { filename, directory, revision: backup.state._storageRevision, files: Object.keys(backup.state.files).length, removed, preserved, warnings };
  } catch (error) {
    if (!verified) {
      for (const path of created.reverse()) { try { await io.unlink(path); } catch (_) {} }
    }
    throw error;
  } finally {
    await lock.close();
    await io.unlink(lockPath);
  }
}

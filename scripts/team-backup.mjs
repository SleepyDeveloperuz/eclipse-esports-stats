import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readExistingTeamSnapshot } from '../lib/team-store.js';

// Explicit, read-only server export; refuses to overwrite an existing backup.
const destination = process.argv[2];
if (!destination || !process.env.GIST_ID) {
  console.error('Usage: node --env-file=/secure/team.env scripts/team-backup.mjs /secure/backup.json');
  process.exitCode = 1;
} else {
  try {
    const backup = await readExistingTeamSnapshot();
    const { state } = backup;
    await writeFile(resolve(destination), JSON.stringify(backup, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Private backup saved: ${Object.keys(state.files).length} logical files, revision ${state._storageRevision}.`);
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'Destination already exists; nothing was overwritten.' : 'Backup failed. Check storage credentials, source state and destination permissions.');
    process.exitCode = 1;
  }
}

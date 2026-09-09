import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRedisStore } from '../lib/mlbb/store.js';
import { restoreTeamBackup } from '../lib/team-restore.js';
import { saveRestorePreimage } from '../lib/restore-preimage.js';

const [source, revisionText, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const beforeArg = flags.find(flag => flag.startsWith('--save-before='));
try {
  if (!source || !/^-?\d+$/.test(revisionText || '') || flags.some(flag => flag !== '--apply' && !flag.startsWith('--save-before=')) || (apply && !beforeArg)) {
    throw new Error('Usage: node --env-file=/secure/team.env scripts/team-restore.mjs backup.json EXPECTED_REVISION [--apply --save-before=/secure/before.json]. Default: dry-run; missing database revision: -1.');
  }
  const backup = JSON.parse(await readFile(resolve(source), 'utf8'));
  const result = await restoreTeamBackup({ backup, gistId: process.env.GIST_ID, store: createRedisStore(), expectedRevision: Number(revisionText), apply,
    saveBefore: beforeArg ? value => saveRestorePreimage({ destination: beforeArg.slice('--save-before='.length), backup: value }) : undefined });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Before-backup already exists. Nothing was overwritten.' : error.code === 'RESTORE_REFUSED' || error.message.startsWith('Usage:') ? error.message : 'Restore failed. Check the backup, credentials and private destination.');
  process.exitCode = 1;
}

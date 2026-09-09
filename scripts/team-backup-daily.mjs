import { saveDailyMacBackup } from '../lib/mac-backup.js';

try {
  const result = await saveDailyMacBackup({ destination: process.argv[2] });
  console.log(`Verified backup: ${result.filename}. ${result.files} logical files. Removed ${result.removed.length} older automatic backups permanently. Retention policy: keep the latest verified automatic copy.`);
  if (result.preserved.length) console.log(`Left ${result.preserved.length} unrecognized, different-team or unverifiable files untouched.`);
  for (const warning of result.warnings) console.warn(warning);
  if (result.warnings.length) process.exitCode = 1;
} catch (_) {
  console.error('Backup or retention did not complete. Check credentials, permissions and lock status. A verified latest copy is required before old backups can be removed.');
  process.exitCode = 1;
}

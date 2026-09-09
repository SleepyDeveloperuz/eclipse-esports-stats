import * as fs from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

// Return only after the exact pre-image and its directory entry are durable.
// An existing destination is never overwritten, including a symlink.
export async function saveRestorePreimage({ destination, backup, io = fs }) {
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('A private pre-restore backup destination is required.');
  const requested = resolve(destination);
  const parent = dirname(requested);
  const directory = await io.realpath(parent);
  const info = await io.lstat(parent);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    throw new Error('The pre-restore backup needs an owner-only directory.');
  }
  const path = join(directory, basename(requested));
  const content = JSON.stringify(backup, null, 2);
  const file = await io.open(path, 'wx', 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
  if (await io.readFile(path, 'utf8') !== content) throw new Error('Pre-restore backup verification failed.');
  const directoryHandle = await io.open(directory, 'r');
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
  return path;
}

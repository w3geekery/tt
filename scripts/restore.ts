#!/usr/bin/env tsx
/**
 * Restore script — restores a backup zip to ~/.tt/tt.db.
 *
 * Usage:
 *   npx tsx scripts/restore.ts <backup.zip>
 *
 * The current database is backed up before restoring.
 */

import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const DB_PATH = resolve(homedir(), '.tt', 'tt.db');

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: npx tsx scripts/restore.ts <backup.zip>');
  process.exit(1);
}

if (!existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`);
  process.exit(1);
}

// Back up the current database before restoring
if (existsSync(DB_PATH)) {
  const safeName = `${DB_PATH}.pre-restore-${Date.now()}`;
  renameSync(DB_PATH, safeName);
  console.log(`Current database moved to ${safeName}`);
}

// Extract the zip — contains a single .db file
const tmpDir = resolve(homedir(), '.tt', 'restore-tmp');
execSync(`mkdir -p "${tmpDir}" && unzip -o "${backupPath}" -d "${tmpDir}"`, { stdio: 'inherit' });

// Find the extracted .db file
const extracted = execSync(`ls "${tmpDir}"/*.db`).toString().trim();
execSync(`mv "${extracted}" "${DB_PATH}"`, { stdio: 'inherit' });
execSync(`rm -rf "${tmpDir}"`, { stdio: 'inherit' });

// Clean up WAL/SHM files if present
for (const suffix of ['-wal', '-shm']) {
  const p = `${DB_PATH}${suffix}`;
  if (existsSync(p)) execSync(`rm "${p}"`);
}

console.log(`✓ Database restored from ${backupPath}`);

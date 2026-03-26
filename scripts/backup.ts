#!/usr/bin/env tsx
/**
 * Backup script — copies ~/.tt/tt.db to a timestamped zip file.
 *
 * Usage:
 *   npx tsx scripts/backup.ts [destination-dir]
 *
 * Default destination: ~/.tt/backups/
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const DB_PATH = resolve(homedir(), '.tt', 'tt.db');
const DEFAULT_DEST = resolve(homedir(), '.tt', 'backups');
const dest = process.argv[2] ?? DEFAULT_DEST;

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

if (!existsSync(dest)) {
  mkdirSync(dest, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const zipName = `tt-backup-${timestamp}.zip`;
const zipPath = resolve(dest, zipName);

// Use SQLite's .backup to get a consistent snapshot, then zip it
const tmpPath = resolve(dest, `tt-backup-${timestamp}.db`);
execSync(`sqlite3 "${DB_PATH}" ".backup '${tmpPath}'"`, { stdio: 'inherit' });
execSync(`zip -j "${zipPath}" "${tmpPath}"`, { stdio: 'inherit' });
execSync(`rm "${tmpPath}"`, { stdio: 'inherit' });

console.log(`✓ Backup saved to ${zipPath}`);

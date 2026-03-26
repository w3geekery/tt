/**
 * SQLite connection manager.
 *
 * Uses better-sqlite3 for synchronous, fast local queries.
 * WAL mode enables safe concurrent reads (Express + MCP).
 * Auto-creates database and schema on first run.
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { applySchema } from './schema.js';

let db: Database.Database | null = null;

/** Resolve `~` to actual home directory and ensure parent dir exists. */
export function resolveDbPath(raw = '~/.tt/tt.db'): string {
  const expanded = raw.startsWith('~') ? raw.replace('~', homedir()) : raw;
  const full = resolve(expanded);
  const dir = dirname(full);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return full;
}

/** Get (or create) the singleton database connection. */
export function getDb(dbPath?: string): Database.Database {
  if (!db) {
    const resolved = resolveDbPath(dbPath);
    db = new Database(resolved);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    applySchema(db);
  }
  return db;
}

/** Close the database connection. Mostly for tests. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Create an in-memory database with schema applied. For tests. */
export function createTestDb(): Database.Database {
  const memDb = new Database(':memory:');
  memDb.pragma('foreign_keys = ON');
  applySchema(memDb);
  return memDb;
}

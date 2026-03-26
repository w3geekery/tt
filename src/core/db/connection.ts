/**
 * SQLite connection manager.
 *
 * Uses better-sqlite3 for synchronous, fast local queries.
 * WAL mode enables safe concurrent reads (Express + MCP).
 * Auto-creates database and schema on first run.
 */

// TODO: Phase 2 — implement
// import Database from 'better-sqlite3';
//
// let db: Database.Database | null = null;
//
// export function getDb(): Database.Database {
//   if (!db) {
//     const dbPath = resolveDbPath();
//     db = new Database(dbPath);
//     db.pragma('journal_mode = WAL');
//     db.pragma('foreign_keys = ON');
//     ensureSchema(db);
//   }
//   return db;
// }

/**
 * Database schema — creates all tables on first run.
 * Uses IF NOT EXISTS so it's safe to call on every startup.
 */

import type Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  name TEXT NOT NULL,
  initials TEXT,
  color TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  color TEXT,
  billable INTEGER DEFAULT 1,
  daily_cap_hrs REAL,
  weekly_cap_hrs REAL,
  overflow_company_id TEXT REFERENCES companies(id),
  overflow_project_id TEXT REFERENCES projects(id),
  overflow_task_id TEXT REFERENCES tasks(id),
  notify_on_cap INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  company_id TEXT NOT NULL REFERENCES companies(id),
  project_id TEXT REFERENCES projects(id),
  name TEXT NOT NULL,
  code TEXT,
  url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_timers (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  company_id TEXT NOT NULL REFERENCES companies(id),
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  pattern TEXT NOT NULL CHECK (pattern IN ('daily', 'weekly')),
  weekday INTEGER,
  start_time TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  skipped_dates TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timers (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  company_id TEXT NOT NULL REFERENCES companies(id),
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  slug TEXT UNIQUE,
  state TEXT DEFAULT 'stopped' CHECK (state IN ('running', 'paused', 'stopped')),
  start_at TEXT,
  started TEXT,
  ended TEXT,
  stop_at TEXT,
  duration_ms INTEGER,
  notes TEXT,
  notify_on_switch INTEGER DEFAULT 0,
  external_task TEXT,
  recurring_id TEXT REFERENCES recurring_timers(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timer_segments (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  timer_id TEXT NOT NULL REFERENCES timers(id) ON DELETE CASCADE,
  started TEXT NOT NULL,
  ended TEXT,
  duration_ms INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  timer_id TEXT REFERENCES timers(id),
  trigger_at TEXT NOT NULL,
  fired_at TEXT,
  dismissed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

export function applySchema(db: Database.Database): void {
  db.exec(SCHEMA);
}

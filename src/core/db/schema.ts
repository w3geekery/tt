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
  pattern TEXT NOT NULL CHECK (pattern IN ('daily', 'weekdays', 'weekly')),
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
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS specstory_sessions (
  path TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  company TEXT,
  started TEXT,
  ended TEXT,
  size_bytes INTEGER NOT NULL,
  summary TEXT,
  goal TEXT,
  outcome TEXT,
  user_messages INTEGER,
  agent_messages INTEGER,
  commits TEXT DEFAULT '[]',
  pr_urls TEXT DEFAULT '[]',
  cached_at TEXT DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS favorite_templates (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  company_id TEXT NOT NULL REFERENCES companies(id),
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_templates_combo
  ON favorite_templates (company_id, COALESCE(project_id, ''), COALESCE(task_id, ''));

CREATE TABLE IF NOT EXISTS weekly_tasks (
  week_start TEXT NOT NULL,
  company TEXT NOT NULL,
  zb_task_id TEXT NOT NULL,
  zb_task_code TEXT,
  zb_task_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (week_start, company)
);
`;

export function applySchema(db: Database.Database): void {
  db.exec(SCHEMA);

  // Migration: drop stored duration_ms columns (now always computed from timestamps)
  const timerCols = db.pragma('table_info(timers)') as Array<{ name: string }>;
  if (timerCols.some(c => c.name === 'duration_ms')) {
    db.exec('ALTER TABLE timers DROP COLUMN duration_ms');
  }
  const segCols = db.pragma('table_info(timer_segments)') as Array<{ name: string }>;
  if (segCols.some(c => c.name === 'duration_ms')) {
    db.exec('ALTER TABLE timer_segments DROP COLUMN duration_ms');
  }

  // One-time fix: sync single-segment timers so segment timestamps match timer timestamps.
  // Prevents stale segment data from producing wrong computed durations.
  db.exec(`
    UPDATE timer_segments SET
      started = (SELECT started FROM timers WHERE id = timer_segments.timer_id),
      ended = (SELECT ended FROM timers WHERE id = timer_segments.timer_id),
      updated_at = datetime('now')
    WHERE timer_id IN (
      SELECT timer_id FROM timer_segments GROUP BY timer_id HAVING COUNT(*) = 1
    ) AND timer_id IN (
      SELECT id FROM timers WHERE state = 'stopped' AND started IS NOT NULL AND ended IS NOT NULL
    )
  `);
}

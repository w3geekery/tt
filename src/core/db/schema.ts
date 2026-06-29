/**
 * Database schema — creates all tables on first run.
 * Uses IF NOT EXISTS so it's safe to call on every startup.
 */

import type Database from 'better-sqlite3';
import { toSlug } from './entity-slug.js';
import { derivePeriodStart } from './weekly-tasks.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  initials TEXT,
  color TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
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
  slug TEXT UNIQUE,
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
  break_note TEXT,
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

CREATE TABLE IF NOT EXISTS specstory_events (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  session_path TEXT NOT NULL REFERENCES specstory_sessions(path) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  date_pt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  content TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('message', 'commit', 'tool_call', 'session_recap', 'pr')),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_specstory_events_date ON specstory_events(date_pt);
CREATE INDEX IF NOT EXISTS idx_specstory_events_session ON specstory_events(session_path);

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

-- Recurring reminder definitions. Materialized into one-off notifications rows
-- each matching day by the cron engine (mirrors recurring_timers into timers).
CREATE TABLE IF NOT EXISTS recurring_notifications (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  type TEXT NOT NULL DEFAULT 'reminder',
  title TEXT NOT NULL,
  message TEXT,
  pattern TEXT NOT NULL CHECK (pattern IN ('daily', 'weekdays', 'weekly')),
  weekdays TEXT DEFAULT '[]',
  trigger_time TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  delivery TEXT,
  voice TEXT,
  active INTEGER DEFAULT 1,
  skipped_dates TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
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
  period_start TEXT NOT NULL,
  zb_task_id TEXT NOT NULL,
  zb_task_code TEXT,
  zb_task_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (week_start, company, period_start)
);

-- Invoice tracker: one row per semi-monthly billing period per stream (ZB | SM).
-- Tracks status through the pipeline and whether/which weekly ZB task(s) were created.
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream TEXT NOT NULL,                  -- 'ZB' | 'SM'
  company TEXT NOT NULL,                 -- 'ZeroBias' | 'W3Geekery'
  period_label TEXT NOT NULL,            -- 'March 2026 - 2nd Half'
  period_start TEXT NOT NULL,            -- '2026-03-16'
  period_end TEXT NOT NULL,              -- '2026-03-31'
  invoice_number TEXT,                   -- 'ZB0128' (when generated)
  hours REAL,
  amount REAL,
  status TEXT NOT NULL DEFAULT 'unbilled', -- unbilled|backfilled|task_created|pdf_generated|submitted|paid
  weekly_task_created INTEGER NOT NULL DEFAULT 0,
  zb_task_ids TEXT,                      -- csv/json of linked weekly ZB task codes/ids
  pdf_path TEXT,
  date_submitted TEXT,
  date_paid TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(stream, period_start)
);

-- No duplicate invoice numbers (partial: future/unbilled rows have NULL invoice_number).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON invoices(invoice_number) WHERE invoice_number IS NOT NULL;

-- Personal notes/todos/reminders/checklists, decoupled from billing.
-- A row with parent_id is a checklist child; a row with children renders as a checklist.
CREATE TABLE IF NOT EXISTS stickies (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  parent_id TEXT REFERENCES stickies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  color TEXT,
  due_at TEXT,
  notify_enabled INTEGER NOT NULL DEFAULT 0,
  notify_offset_n INTEGER,
  notify_offset_unit TEXT CHECK (notify_offset_unit IN ('min', 'hour', 'day', 'month')),
  checked INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  position REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stickies_parent ON stickies(parent_id);
CREATE INDEX IF NOT EXISTS idx_stickies_due_at ON stickies(due_at);
CREATE INDEX IF NOT EXISTS idx_stickies_board ON stickies(archived, pinned, position);

-- Namespaced tags (key:value) for stickies, e.g. scope:zb-ui, topic:financial.
CREATE TABLE IF NOT EXISTS sticky_tags (
  sticky_id TEXT NOT NULL REFERENCES stickies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (sticky_id, key, value)
);

CREATE INDEX IF NOT EXISTS idx_sticky_tags_kv ON sticky_tags(key, value);
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
  if (!segCols.some(c => c.name === 'break_note')) {
    db.exec('ALTER TABLE timer_segments ADD COLUMN break_note TEXT');
  }

  // Migration: add slug columns to companies, projects, tasks if missing
  for (const table of ['companies', 'projects', 'tasks']) {
    const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'slug')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN slug TEXT`);
      // Backfill slugs from names
      const rows = db.prepare(`SELECT id, name FROM ${table} WHERE slug IS NULL`).all() as Array<{ id: string; name: string }>;
      const used = new Set<string>();
      const stmt = db.prepare(`UPDATE ${table} SET slug = ? WHERE id = ?`);
      for (const row of rows) {
        let slug = toSlug(row.name);
        if (!slug) slug = `entity-${row.id.slice(0, 8).toLowerCase()}`;
        let candidate = slug;
        let n = 2;
        while (used.has(candidate)) { candidate = `${slug}-${n++}`; }
        used.add(candidate);
        stmt.run(candidate, row.id);
      }
      // Now add unique index
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_slug ON ${table}(slug)`);
    }
  }

  // Migration: link notifications to sticky reminders. Plain column (code-managed link,
  // no DB FK) for portability — SQLite's ALTER ADD COLUMN ... REFERENCES is unreliable.
  const notifCols = db.pragma('table_info(notifications)') as Array<{ name: string }>;
  if (!notifCols.some(c => c.name === 'sticky_id')) {
    db.exec('ALTER TABLE notifications ADD COLUMN sticky_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_sticky_id ON notifications(sticky_id)');
  }

  // Migration: spoken-notifier + recurring-notification support on existing notifications.
  // delivery: NULL=silent banner (legacy), 'bell'=banner+sound, 'voice'=spoken via `say`.
  // recurring_notification_id: code-managed link to the recurring def that materialized this row.
  if (!notifCols.some(c => c.name === 'delivery')) {
    db.exec('ALTER TABLE notifications ADD COLUMN delivery TEXT');
  }
  if (!notifCols.some(c => c.name === 'voice')) {
    db.exec('ALTER TABLE notifications ADD COLUMN voice TEXT');
  }
  if (!notifCols.some(c => c.name === 'recurring_notification_id')) {
    db.exec('ALTER TABLE notifications ADD COLUMN recurring_notification_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_recurring_notification_id ON notifications(recurring_notification_id)');
  }

  // Migration: add period_start to weekly_tasks PK so a calendar week can hold
  // both halves of a split week (one task per semi-monthly invoice period).
  // SQLite can't ALTER a PK, so rebuild the table. Backfill via the shared
  // derivePeriodStart() helper — single source of truth for the half-month rule.
  const wtCols = db.pragma('table_info(weekly_tasks)') as Array<{ name: string }>;
  if (wtCols.length && !wtCols.some(c => c.name === 'period_start')) {
    const rows = db.prepare('SELECT * FROM weekly_tasks').all() as Array<{
      week_start: string; company: string; zb_task_id: string;
      zb_task_code: string | null; zb_task_name: string | null;
      created_at: string; updated_at: string;
    }>;
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE weekly_tasks_new (
          week_start TEXT NOT NULL,
          company TEXT NOT NULL,
          period_start TEXT NOT NULL,
          zb_task_id TEXT NOT NULL,
          zb_task_code TEXT,
          zb_task_name TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (week_start, company, period_start)
        )
      `);
      const ins = db.prepare(`
        INSERT INTO weekly_tasks_new
          (week_start, company, period_start, zb_task_id, zb_task_code, zb_task_name, created_at, updated_at)
        VALUES (@week_start, @company, @period_start, @zb_task_id, @zb_task_code, @zb_task_name, @created_at, @updated_at)
      `);
      for (const r of rows) {
        ins.run({ ...r, period_start: derivePeriodStart(r.week_start) });
      }
      db.exec('DROP TABLE weekly_tasks');
      db.exec('ALTER TABLE weekly_tasks_new RENAME TO weekly_tasks');
    });
    migrate();
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

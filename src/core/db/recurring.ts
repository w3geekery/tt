import type Database from 'better-sqlite3';
import type { RecurringTimer, Timer } from '../types.js';
import { randomUUID } from 'node:crypto';
import * as timersDb from './timers.js';

export interface CreateRecurringInput {
  company_id: string;
  project_id?: string | null;
  task_id?: string | null;
  pattern: 'daily' | 'weekdays' | 'weekly';
  weekday?: number | null;
  start_time?: string | null;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
}

export interface UpdateRecurringInput {
  pattern?: 'daily' | 'weekly';
  weekday?: number | null;
  start_time?: string | null;
  end_date?: string | null;
  notes?: string | null;
  active?: boolean;
}

export function findAll(db: Database.Database): RecurringTimer[] {
  return db.prepare('SELECT * FROM recurring_timers ORDER BY created_at DESC').all().map(mapRow);
}

export function findActive(db: Database.Database): RecurringTimer[] {
  return db.prepare('SELECT * FROM recurring_timers WHERE active = 1 ORDER BY start_time').all().map(mapRow);
}

export function findById(db: Database.Database, id: string): RecurringTimer | undefined {
  const row = db.prepare('SELECT * FROM recurring_timers WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function create(db: Database.Database, input: CreateRecurringInput): RecurringTimer {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recurring_timers (id, company_id, project_id, task_id, pattern, weekday,
      start_time, start_date, end_date, notes, active, skipped_dates, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '[]', ?, ?)`,
  ).run(
    id,
    input.company_id,
    input.project_id ?? null,
    input.task_id ?? null,
    input.pattern,
    input.weekday ?? null,
    input.start_time ?? null,
    input.start_date,
    input.end_date ?? null,
    input.notes ?? null,
    now,
    now,
  );
  return findById(db, id)!;
}

export function update(db: Database.Database, id: string, input: UpdateRecurringInput): RecurringTimer | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.pattern !== undefined) { fields.push('pattern = ?'); values.push(input.pattern); }
  if (input.weekday !== undefined) { fields.push('weekday = ?'); values.push(input.weekday); }
  if (input.start_time !== undefined) { fields.push('start_time = ?'); values.push(input.start_time); }
  if (input.end_date !== undefined) { fields.push('end_date = ?'); values.push(input.end_date); }
  if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes); }
  if (input.active !== undefined) { fields.push('active = ?'); values.push(input.active ? 1 : 0); }

  if (fields.length === 0) return findById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE recurring_timers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findById(db, id);
}

export function remove(db: Database.Database, id: string): boolean {
  // Delete unstarted materialized timers — auto-created, never ran, no history to preserve
  db.prepare('DELETE FROM timers WHERE recurring_id = ? AND started IS NULL').run(id);
  // Detach started timers — preserve their time data, just remove the link
  db.prepare('UPDATE timers SET recurring_id = NULL WHERE recurring_id = ?').run(id);
  // Delete the recurring definition
  const result = db.prepare('DELETE FROM recurring_timers WHERE id = ?').run(id);
  return result.changes > 0;
}

export function skipDate(db: Database.Database, id: string, dateStr: string): RecurringTimer | undefined {
  const rec = findById(db, id);
  if (!rec) return undefined;
  const dates = [...rec.skipped_dates, dateStr];
  db.prepare(`UPDATE recurring_timers SET skipped_dates = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(dates), id);
  return findById(db, id);
}

export function unskipDate(db: Database.Database, id: string, dateStr: string): RecurringTimer | undefined {
  const rec = findById(db, id);
  if (!rec) return undefined;
  const dates = rec.skipped_dates.filter(d => d !== dateStr);
  db.prepare(`UPDATE recurring_timers SET skipped_dates = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(dates), id);
  return findById(db, id);
}

export interface SkipOccurrenceResult {
  recurring: RecurringTimer;
  /** The original materialized timer after zero-out (or unchanged if not started). Null if nothing was materialized yet. */
  skippedTimer: Timer | null;
  /** Replacement timer only created when the original was running/started. */
  replacementTimer: Timer | null;
}

/**
 * Skip an occurrence of a recurring timer for a date. Three cases:
 *   1. No materialized timer yet -> just flag the date (cron won't materialize).
 *   2. Materialized but unstarted -> flag the date; card will render as skipped.
 *   3. Running/started            -> zero out (delete segments, clear started/ended),
 *                                    create a replacement timer at the original start time.
 *      Replacement target: ZeroBias UI General Development if its daily cap is not yet
 *      hit; otherwise W3Geekery SME Mart General Development.
 */
export function skipOccurrence(
  db: Database.Database,
  recurringId: string,
  dateStr: string,
): SkipOccurrenceResult | undefined {
  const recurring = skipDate(db, recurringId, dateStr);
  if (!recurring) return undefined;

  const existing = db.prepare(
    `SELECT id FROM timers WHERE date(created_at, '-7 hours') = date(?) AND recurring_id = ?`,
  ).get(dateStr, recurringId) as { id: string } | undefined;

  if (!existing) return { recurring, skippedTimer: null, replacementTimer: null };

  const original = timersDb.findById(db, existing.id);
  if (!original) return { recurring, skippedTimer: null, replacementTimer: null };

  const wasStarted = !!original.started;
  const originalStarted = original.started ?? null;

  // Zero out: drop segments, reset state, clear started/ended. Keep recurring_id
  // so the UI can still render a dimmed "Skipped" card with the task info.
  db.prepare('DELETE FROM timer_segments WHERE timer_id = ?').run(original.id);
  db.prepare(
    `UPDATE timers SET state = 'stopped', started = NULL, ended = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).run(original.id);

  const skippedTimer = timersDb.findById(db, original.id) ?? null;

  let replacementTimer: Timer | null = null;
  if (wasStarted && originalStarted) {
    const target = resolveReplacementTarget(db, dateStr);
    if (target) {
      const created = timersDb.create(db, {
        company_id: target.company_id,
        project_id: target.project_id,
        task_id: target.task_id,
      });
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE timers SET state = 'running', started = ?, updated_at = ? WHERE id = ?`,
      ).run(originalStarted, now, created.id);
      const segId = randomUUID().replace(/-/g, '').toUpperCase();
      db.prepare(
        `INSERT INTO timer_segments (id, timer_id, started, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(segId, created.id, originalStarted, now, now);
      replacementTimer = timersDb.findById(db, created.id) ?? null;
    }
  }

  return { recurring, skippedTimer, replacementTimer };
}

interface ReplacementTarget {
  company_id: string;
  project_id: string | null;
  task_id: string | null;
}

/** Resolve the replacement company/project/task when skipping a running recurring timer. */
function resolveReplacementTarget(db: Database.Database, dateStr: string): ReplacementTarget | null {
  const zbUi = db.prepare(
    `SELECT p.id as project_id, p.company_id, p.daily_cap_hrs
     FROM projects p JOIN companies c ON c.id = p.company_id
     WHERE c.slug = 'zerobias' AND p.slug = 'ui'`,
  ).get() as { project_id: string; company_id: string; daily_cap_hrs: number | null } | undefined;

  if (zbUi && zbUi.daily_cap_hrs) {
    const logged = db.prepare(
      `SELECT COALESCE(SUM(
         CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
       ), 0) / 3600000.0 as hrs
       FROM timers t JOIN timer_segments ts ON ts.timer_id = t.id
       WHERE t.project_id = ? AND date(t.started) = date(?)`,
    ).get(zbUi.project_id, dateStr) as { hrs: number };
    if ((logged?.hrs ?? 0) < zbUi.daily_cap_hrs) {
      const task = db.prepare(
        `SELECT id FROM tasks WHERE project_id = ? AND name = 'General Development' LIMIT 1`,
      ).get(zbUi.project_id) as { id: string } | undefined;
      return { company_id: zbUi.company_id, project_id: zbUi.project_id, task_id: task?.id ?? null };
    }
  }

  const smeMart = db.prepare(
    `SELECT p.id as project_id, p.company_id
     FROM projects p JOIN companies c ON c.id = p.company_id
     WHERE c.slug = 'w3geekery' AND p.slug = 'sme-mart'`,
  ).get() as { project_id: string; company_id: string } | undefined;
  if (!smeMart) return null;
  const task = db.prepare(
    `SELECT id FROM tasks WHERE project_id = ? AND name = 'General Development' LIMIT 1`,
  ).get(smeMart.project_id) as { id: string } | undefined;
  return { company_id: smeMart.company_id, project_id: smeMart.project_id, task_id: task?.id ?? null };
}

function mapRow(row: unknown): RecurringTimer {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    active: r.active === 1,
    skipped_dates: JSON.parse(r.skipped_dates as string),
  } as RecurringTimer;
}

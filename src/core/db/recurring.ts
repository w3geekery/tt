import type Database from 'better-sqlite3';
import type { RecurringTimer } from '../types.js';
import { randomUUID } from 'node:crypto';

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

function mapRow(row: unknown): RecurringTimer {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    active: r.active === 1,
    skipped_dates: JSON.parse(r.skipped_dates as string),
  } as RecurringTimer;
}

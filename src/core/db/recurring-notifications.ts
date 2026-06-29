import type Database from 'better-sqlite3';
import type { RecurringNotification, RecurringPattern } from '../types.js';
import { randomUUID } from 'node:crypto';

export interface CreateRecurringNotificationInput {
  type?: string;
  title: string;
  message?: string | null;
  pattern: RecurringPattern;
  /** Weekdays (0=Sun..6=Sat) for pattern='weekly', e.g. [1,3,5] for Mon/Wed/Fri. */
  weekdays?: number[];
  trigger_time: string;
  start_date: string;
  end_date?: string | null;
  delivery?: 'bell' | 'voice' | null;
  voice?: string | null;
}

export interface UpdateRecurringNotificationInput {
  title?: string;
  message?: string | null;
  pattern?: RecurringPattern;
  weekdays?: number[];
  trigger_time?: string;
  end_date?: string | null;
  delivery?: 'bell' | 'voice' | null;
  voice?: string | null;
  active?: boolean;
}

export function findAll(db: Database.Database): RecurringNotification[] {
  return db
    .prepare('SELECT * FROM recurring_notifications ORDER BY created_at DESC')
    .all()
    .map(mapRow);
}

export function findActive(db: Database.Database): RecurringNotification[] {
  return db
    .prepare('SELECT * FROM recurring_notifications WHERE active = 1 ORDER BY trigger_time')
    .all()
    .map(mapRow);
}

export function findById(db: Database.Database, id: string): RecurringNotification | undefined {
  const row = db.prepare('SELECT * FROM recurring_notifications WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function create(
  db: Database.Database,
  input: CreateRecurringNotificationInput,
): RecurringNotification {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recurring_notifications
       (id, type, title, message, pattern, weekdays, trigger_time, start_date, end_date,
        delivery, voice, active, skipped_dates, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '[]', ?, ?)`,
  ).run(
    id,
    input.type ?? 'reminder',
    input.title,
    input.message ?? null,
    input.pattern,
    JSON.stringify(input.weekdays ?? []),
    input.trigger_time,
    input.start_date,
    input.end_date ?? null,
    input.delivery ?? null,
    input.voice ?? null,
    now,
    now,
  );
  return findById(db, id)!;
}

export function update(
  db: Database.Database,
  id: string,
  input: UpdateRecurringNotificationInput,
): RecurringNotification | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
  if (input.message !== undefined) { fields.push('message = ?'); values.push(input.message); }
  if (input.pattern !== undefined) { fields.push('pattern = ?'); values.push(input.pattern); }
  if (input.weekdays !== undefined) { fields.push('weekdays = ?'); values.push(JSON.stringify(input.weekdays)); }
  if (input.trigger_time !== undefined) { fields.push('trigger_time = ?'); values.push(input.trigger_time); }
  if (input.end_date !== undefined) { fields.push('end_date = ?'); values.push(input.end_date); }
  if (input.delivery !== undefined) { fields.push('delivery = ?'); values.push(input.delivery); }
  if (input.voice !== undefined) { fields.push('voice = ?'); values.push(input.voice); }
  if (input.active !== undefined) { fields.push('active = ?'); values.push(input.active ? 1 : 0); }

  if (fields.length === 0) return findById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE recurring_notifications SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findById(db, id);
}

export function remove(db: Database.Database, id: string): boolean {
  // Drop unfired materialized notifications — auto-created, never shown, nothing to preserve.
  db.prepare('DELETE FROM notifications WHERE recurring_notification_id = ? AND fired_at IS NULL').run(id);
  // Detach already-fired ones so their history survives.
  db.prepare('UPDATE notifications SET recurring_notification_id = NULL WHERE recurring_notification_id = ?').run(id);
  const result = db.prepare('DELETE FROM recurring_notifications WHERE id = ?').run(id);
  return result.changes > 0;
}

export function skipDate(
  db: Database.Database,
  id: string,
  dateStr: string,
): RecurringNotification | undefined {
  const rec = findById(db, id);
  if (!rec) return undefined;
  const dates = [...new Set([...rec.skipped_dates, dateStr])];
  db.prepare(
    `UPDATE recurring_notifications SET skipped_dates = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(dates), id);
  // Remove any not-yet-fired notification already materialized for that date.
  db.prepare(
    `DELETE FROM notifications
     WHERE recurring_notification_id = ? AND fired_at IS NULL
       AND date(trigger_at, '-7 hours') = date(?)`,
  ).run(id, dateStr);
  return findById(db, id);
}

export function unskipDate(
  db: Database.Database,
  id: string,
  dateStr: string,
): RecurringNotification | undefined {
  const rec = findById(db, id);
  if (!rec) return undefined;
  const dates = rec.skipped_dates.filter(d => d !== dateStr);
  db.prepare(
    `UPDATE recurring_notifications SET skipped_dates = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(dates), id);
  return findById(db, id);
}

function mapRow(row: unknown): RecurringNotification {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    pattern: r.pattern as RecurringPattern,
    weekdays: JSON.parse((r.weekdays as string) ?? '[]'),
    active: r.active === 1,
    skipped_dates: JSON.parse((r.skipped_dates as string) ?? '[]'),
  } as RecurringNotification;
}

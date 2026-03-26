import type Database from 'better-sqlite3';
import type { Notification } from '../types.js';
import { randomUUID } from 'node:crypto';

export interface CreateNotificationInput {
  type: string;
  title: string;
  message?: string | null;
  timer_id?: string | null;
  trigger_at: string;
}

export function findAll(db: Database.Database): Notification[] {
  return db.prepare('SELECT * FROM notifications ORDER BY trigger_at DESC').all().map(mapRow);
}

export function findPending(db: Database.Database): Notification[] {
  return db
    .prepare('SELECT * FROM notifications WHERE fired_at IS NULL AND dismissed = 0 ORDER BY trigger_at')
    .all()
    .map(mapRow);
}

export function findById(db: Database.Database, id: string): Notification | undefined {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function create(db: Database.Database, input: CreateNotificationInput): Notification {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (id, type, title, message, timer_id, trigger_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.type, input.title, input.message ?? null, input.timer_id ?? null, input.trigger_at, now);
  return findById(db, id)!;
}

export function markFired(db: Database.Database, id: string): Notification | undefined {
  db.prepare(`UPDATE notifications SET fired_at = datetime('now') WHERE id = ?`).run(id);
  return findById(db, id);
}

export function dismiss(db: Database.Database, id: string): Notification | undefined {
  db.prepare(`UPDATE notifications SET dismissed = 1 WHERE id = ?`).run(id);
  return findById(db, id);
}

export function cancel(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM notifications WHERE id = ? AND fired_at IS NULL').run(id);
  return result.changes > 0;
}

function mapRow(row: unknown): Notification {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    dismissed: r.dismissed === 1,
  } as Notification;
}

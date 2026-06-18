/**
 * Sticky reminder wiring — reuses the existing notification + cron system.
 *
 * A sticky with `notify_enabled` and a `due_at` schedules a row in `notifications`
 * at `due_at - offset`. The Express cron loop (src/core/cron/engine.ts) fires it via
 * osascript like any other notification. This module is the single seam both the MCP
 * tools and the Express routes call after mutating a sticky, so the two surfaces stay
 * in sync without duplicating logic.
 */

import type Database from 'better-sqlite3';
import type { Sticky, NotifyOffsetUnit } from './types.js';
import * as notificationsDb from './db/notifications.js';

export const STICKY_REMINDER_TYPE = 'sticky:reminder';

/** Compute the trigger instant for a reminder: `due_at` minus the chosen offset. */
export function computeTriggerAt(dueAt: string, n: number, unit: NotifyOffsetUnit): string {
  const d = new Date(dueAt);
  switch (unit) {
    case 'min':
      d.setTime(d.getTime() - n * 60_000);
      break;
    case 'hour':
      d.setTime(d.getTime() - n * 3_600_000);
      break;
    case 'day':
      d.setTime(d.getTime() - n * 86_400_000);
      break;
    case 'month':
      d.setMonth(d.getMonth() - n);
      break;
  }
  return d.toISOString();
}

/**
 * Reconcile a sticky's pending reminder to match its current state.
 * Cancels any unfired reminder for the sticky, then schedules a fresh one when the
 * sticky is actionable (notify on, has a due date, not checked, not archived).
 * Idempotent — safe to call after any sticky mutation.
 */
export function syncStickyReminder(db: Database.Database, sticky: Sticky): void {
  notificationsDb.cancelBySticky(db, sticky.id);

  const actionable = sticky.notify_enabled && !!sticky.due_at && !sticky.checked && !sticky.archived;
  if (!actionable) return;

  const triggerAt =
    sticky.notify_offset_n != null && sticky.notify_offset_unit
      ? computeTriggerAt(sticky.due_at!, sticky.notify_offset_n, sticky.notify_offset_unit)
      : sticky.due_at!;

  notificationsDb.create(db, {
    type: STICKY_REMINDER_TYPE,
    title: sticky.title,
    message: sticky.body ?? null,
    sticky_id: sticky.id,
    trigger_at: triggerAt,
  });
}

/** Cancel any pending reminder for a sticky (used on delete, before the row is gone). */
export function cancelStickyReminder(db: Database.Database, stickyId: string): number {
  return notificationsDb.cancelBySticky(db, stickyId);
}

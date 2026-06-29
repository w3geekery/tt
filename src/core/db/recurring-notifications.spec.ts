import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from './schema.js';
import * as recurringNotificationsDb from './recurring-notifications.js';
import * as notificationsDb from './notifications.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('recurring-notifications db', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  it('creates and reads a recurring notification with weekdays + voice', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'Update zb-dx docs',
      message: 'Merge the docs PR',
      pattern: 'weekly',
      weekdays: [1, 3, 5],
      trigger_time: '09:00',
      start_date: '2026-06-01',
      delivery: 'voice',
      voice: 'Zoe (Premium)',
    });

    expect(rec.weekdays).toEqual([1, 3, 5]);
    expect(rec.delivery).toBe('voice');
    expect(rec.active).toBe(true);
    expect(rec.skipped_dates).toEqual([]);

    const found = recurringNotificationsDb.findById(db, rec.id);
    expect(found?.title).toBe('Update zb-dx docs');
    expect(found?.weekdays).toEqual([1, 3, 5]);
  });

  it('defaults type to "reminder" and weekdays to []', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'Daily', pattern: 'daily', trigger_time: '08:00', start_date: '2026-06-01',
    });
    expect(rec.type).toBe('reminder');
    expect(rec.weekdays).toEqual([]);
    expect(rec.delivery == null).toBe(true);
  });

  it('findActive excludes deactivated rows', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'X', pattern: 'daily', trigger_time: '08:00', start_date: '2026-06-01',
    });
    recurringNotificationsDb.update(db, rec.id, { active: false });
    expect(recurringNotificationsDb.findActive(db)).toHaveLength(0);
    expect(recurringNotificationsDb.findAll(db)).toHaveLength(1);
  });

  it('update mutates fields and persists weekdays JSON', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'X', pattern: 'weekly', weekdays: [1], trigger_time: '08:00', start_date: '2026-06-01',
    });
    const updated = recurringNotificationsDb.update(db, rec.id, {
      weekdays: [2, 4], trigger_time: '10:30', delivery: 'bell',
    });
    expect(updated?.weekdays).toEqual([2, 4]);
    expect(updated?.trigger_time).toBe('10:30');
    expect(updated?.delivery).toBe('bell');
  });

  it('skipDate adds the date and removes an unfired materialized row for it', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'X', pattern: 'daily', trigger_time: '08:00', start_date: '2026-06-01',
    });
    // Materialize a notification for 2026-06-10 (morning PT -> same UTC date).
    notificationsDb.create(db, {
      type: 'reminder', title: 'X', trigger_at: '2026-06-10T15:00:00.000Z',
      recurring_notification_id: rec.id,
    });
    expect(notificationsDb.findAll(db)).toHaveLength(1);

    const after = recurringNotificationsDb.skipDate(db, rec.id, '2026-06-10');
    expect(after?.skipped_dates).toContain('2026-06-10');
    expect(notificationsDb.findAll(db)).toHaveLength(0);

    const unskipped = recurringNotificationsDb.unskipDate(db, rec.id, '2026-06-10');
    expect(unskipped?.skipped_dates).not.toContain('2026-06-10');
  });

  it('remove drops unfired materialized notifications but detaches fired ones', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'X', pattern: 'daily', trigger_time: '08:00', start_date: '2026-06-01',
    });
    const unfired = notificationsDb.create(db, {
      type: 'reminder', title: 'X', trigger_at: '2026-06-10T15:00:00.000Z', recurring_notification_id: rec.id,
    });
    const fired = notificationsDb.create(db, {
      type: 'reminder', title: 'X', trigger_at: '2026-06-09T15:00:00.000Z', recurring_notification_id: rec.id,
    });
    notificationsDb.markFired(db, fired.id);

    expect(recurringNotificationsDb.remove(db, rec.id)).toBe(true);
    expect(notificationsDb.findById(db, unfired.id)).toBeUndefined();
    const firedAfter = notificationsDb.findById(db, fired.id);
    expect(firedAfter).toBeTruthy();
    expect(firedAfter?.recurring_notification_id == null).toBe(true);
  });
});

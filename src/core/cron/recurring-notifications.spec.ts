import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../db/schema.js';
import * as recurringNotificationsDb from '../db/recurring-notifications.js';
import * as notificationsDb from '../db/notifications.js';

vi.mock('../server/sse.js', () => ({ broadcast: vi.fn() }));
vi.mock('./notify.js', () => ({ sendNotification: vi.fn() }));

const { materializeRecurringNotifications, pacificWallClockToUtcISO } = await import('./engine.js');

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

const ptToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const ptWeekday = () => new Date(ptToday() + 'T12:00:00').getDay();

describe('pacificWallClockToUtcISO', () => {
  it('converts a PST (winter) wall clock to UTC (+8h)', () => {
    // 2026-01-15 09:00 Pacific Standard Time = 17:00 UTC
    expect(pacificWallClockToUtcISO('2026-01-15', '09:00')).toBe('2026-01-15T17:00:00.000Z');
  });

  it('converts a PDT (summer) wall clock to UTC (+7h)', () => {
    // 2026-07-15 09:00 Pacific Daylight Time = 16:00 UTC
    expect(pacificWallClockToUtcISO('2026-07-15', '09:00')).toBe('2026-07-15T16:00:00.000Z');
  });

  it('rolls the UTC date forward for late-evening Pacific times', () => {
    // 2026-07-15 23:30 PDT = 2026-07-16 06:30 UTC
    expect(pacificWallClockToUtcISO('2026-07-15', '23:30')).toBe('2026-07-16T06:30:00.000Z');
  });
});

describe('materializeRecurringNotifications', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  it('materializes a daily reminder into a notification carrying delivery+voice', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'Stand up', message: 'stretch', pattern: 'daily',
      trigger_time: '09:00', start_date: '2020-01-01', delivery: 'voice', voice: 'Ava (Premium)',
    });

    materializeRecurringNotifications(db);

    const all = notificationsDb.findAll(db);
    expect(all).toHaveLength(1);
    expect(all[0].recurring_notification_id).toBe(rec.id);
    expect(all[0].delivery).toBe('voice');
    expect(all[0].voice).toBe('Ava (Premium)');
    expect(all[0].trigger_at).toBe(pacificWallClockToUtcISO(ptToday(), '09:00'));
  });

  it('does not duplicate across repeated ticks', () => {
    recurringNotificationsDb.create(db, {
      title: 'X', pattern: 'daily', trigger_time: '09:00', start_date: '2020-01-01',
    });
    materializeRecurringNotifications(db);
    materializeRecurringNotifications(db);
    materializeRecurringNotifications(db);
    expect(notificationsDb.findAll(db)).toHaveLength(1);
  });

  it('skips when today is in skipped_dates', () => {
    const rec = recurringNotificationsDb.create(db, {
      title: 'X', pattern: 'daily', trigger_time: '09:00', start_date: '2020-01-01',
    });
    recurringNotificationsDb.skipDate(db, rec.id, ptToday());
    materializeRecurringNotifications(db);
    expect(notificationsDb.findAll(db)).toHaveLength(0);
  });

  it('respects weekly weekdays — fires only on listed days', () => {
    const today = ptWeekday();
    const notToday = (today + 1) % 7;

    recurringNotificationsDb.create(db, {
      title: 'OnlyOtherDay', pattern: 'weekly', weekdays: [notToday],
      trigger_time: '09:00', start_date: '2020-01-01',
    });
    materializeRecurringNotifications(db);
    expect(notificationsDb.findAll(db)).toHaveLength(0);

    recurringNotificationsDb.create(db, {
      title: 'Today', pattern: 'weekly', weekdays: [today],
      trigger_time: '09:00', start_date: '2020-01-01',
    });
    materializeRecurringNotifications(db);
    expect(notificationsDb.findAll(db)).toHaveLength(1);
  });

  it('honors start_date / end_date windows', () => {
    recurringNotificationsDb.create(db, {
      title: 'Future', pattern: 'daily', trigger_time: '09:00', start_date: '2999-01-01',
    });
    recurringNotificationsDb.create(db, {
      title: 'Past', pattern: 'daily', trigger_time: '09:00', start_date: '2000-01-01', end_date: '2000-12-31',
    });
    materializeRecurringNotifications(db);
    expect(notificationsDb.findAll(db)).toHaveLength(0);
  });
});

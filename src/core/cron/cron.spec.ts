import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../db/schema.js';
import * as companiesDb from '../db/companies.js';
import * as projectsDb from '../db/projects.js';
import * as timersDb from '../db/timers.js';
import * as recurringDb from '../db/recurring.js';
import * as notificationsDb from '../db/notifications.js';

// Mock the SSE broadcast and notification modules
vi.mock('../server/sse.js', () => ({
  broadcast: vi.fn(),
}));
vi.mock('./notify.js', () => ({
  sendNotification: vi.fn(),
}));

const { materializeRecurring, autoStopTimers, fireNotifications } = await import('./engine.js');

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

/** Get today's date in Pacific Time (matches cron's pacificNow()). */
const ptToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

describe('materializeRecurring', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = companiesDb.create(db, { name: 'Co' }).id;
  });

  it('creates a timer from a daily recurring definition', () => {
    recurringDb.create(db, {
      company_id: companyId,
      pattern: 'daily',
      start_date: '2025-01-01',
      notes: 'Daily standup',
    });

    materializeRecurring(db);

    const timers = timersDb.findAll(db);
    expect(timers).toHaveLength(1);
    expect(timers[0].notes).toBe('Daily standup');
    expect(timers[0].recurring_id).toBeTruthy();
  });

  it('does not duplicate if already materialized', () => {
    recurringDb.create(db, {
      company_id: companyId,
      pattern: 'daily',
      start_date: '2025-01-01',
    });

    materializeRecurring(db);
    materializeRecurring(db);

    expect(timersDb.findAll(db)).toHaveLength(1);
  });

  it('skips dates in skipped_dates', () => {
    const today = ptToday();
    const rec = recurringDb.create(db, {
      company_id: companyId,
      pattern: 'daily',
      start_date: '2025-01-01',
    });
    recurringDb.skipDate(db, rec.id, today);

    materializeRecurring(db);

    expect(timersDb.findAll(db)).toHaveLength(0);
  });

  it('respects start_date (future dates not materialized)', () => {
    recurringDb.create(db, {
      company_id: companyId,
      pattern: 'daily',
      start_date: '2099-01-01',
    });

    materializeRecurring(db);

    expect(timersDb.findAll(db)).toHaveLength(0);
  });
});

describe('autoStopTimers', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = companiesDb.create(db, { name: 'Co' }).id;
  });

  it('stops timers past their stop_at time', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const timer = timersDb.create(db, { company_id: companyId, stop_at: past });
    timersDb.start(db, timer.id);

    autoStopTimers(db);

    const stopped = timersDb.findById(db, timer.id)!;
    expect(stopped.state).toBe('stopped');
  });

  it('does not stop timers with future stop_at', () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const timer = timersDb.create(db, { company_id: companyId, stop_at: future });
    timersDb.start(db, timer.id);

    autoStopTimers(db);

    const still = timersDb.findById(db, timer.id)!;
    expect(still.state).toBe('running');
  });
});

describe('fireNotifications', () => {
  let db: Database.Database;

  beforeEach(() => { db = freshDb(); });

  it('fires notifications past trigger_at', async () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const n = notificationsDb.create(db, {
      type: 'reminder',
      title: 'Test',
      trigger_at: past,
    });

    await fireNotifications(db);

    const fired = notificationsDb.findById(db, n.id)!;
    expect(fired.fired_at).toBeTruthy();
  });

  it('does not fire future notifications', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    notificationsDb.create(db, {
      type: 'reminder',
      title: 'Future',
      trigger_at: future,
    });

    await fireNotifications(db);

    const pending = notificationsDb.findPending(db);
    expect(pending).toHaveLength(1);
  });
});

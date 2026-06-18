import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../db/schema.js';
import * as companiesDb from '../db/companies.js';
import * as projectsDb from '../db/projects.js';
import * as tasksDb from '../db/tasks.js';
import * as timersDb from '../db/timers.js';
import * as recurringDb from '../db/recurring.js';
import * as notificationsDb from '../db/notifications.js';
import * as stickiesDb from '../db/stickies.js';
import { syncStickyReminder, cancelStickyReminder, computeTriggerAt, STICKY_REMINDER_TYPE } from '../reminders.js';

/**
 * MCP tool handlers are thin wrappers around DB modules.
 * We test the same operations the MCP tools perform,
 * validating the data flow end-to-end (minus stdio transport).
 */

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('MCP tool logic: start_timer', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = companiesDb.create(db, { name: 'Co' }).id;
  });

  it('creates and starts a new timer', () => {
    const timer = timersDb.create(db, { company_id: companyId, notes: 'From MCP' });
    const started = timersDb.start(db, timer.id);
    expect(started.state).toBe('running');
    expect(started.slug).toBeTruthy();
  });

  it('starts an existing timer by ID', () => {
    const timer = timersDb.create(db, { company_id: companyId });
    const started = timersDb.start(db, timer.id);
    expect(started.state).toBe('running');
  });

  it('auto-stops running timer when starting another', () => {
    const t1 = timersDb.create(db, { company_id: companyId });
    const t2 = timersDb.create(db, { company_id: companyId });

    timersDb.start(db, t1.id);
    timersDb.start(db, t2.id);

    expect(timersDb.findById(db, t1.id)!.state).toBe('stopped');
    expect(timersDb.findById(db, t2.id)!.state).toBe('running');
  });
});

describe('MCP tool logic: stop/pause/resume', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = companiesDb.create(db, { name: 'Co' }).id;
  });

  it('stops the running timer', () => {
    const timer = timersDb.create(db, { company_id: companyId });
    timersDb.start(db, timer.id);

    const running = timersDb.findRunning(db);
    expect(running).toBeTruthy();

    const stopped = timersDb.stop(db, running!.id);
    expect(stopped.state).toBe('stopped');
  });

  it('pause/resume creates segments', () => {
    const timer = timersDb.create(db, { company_id: companyId });
    timersDb.start(db, timer.id);
    timersDb.pause(db, timer.id);
    timersDb.resume(db, timer.id);

    const segments = timersDb.getSegments(db, timer.id);
    expect(segments).toHaveLength(2);
  });
});

describe('MCP tool logic: segments', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = companiesDb.create(db, { name: 'Co' }).id;
  });

  it('lists segments for a timer', () => {
    const timer = timersDb.create(db, { company_id: companyId });
    timersDb.start(db, timer.id);
    const segments = timersDb.getSegments(db, timer.id);
    expect(segments).toHaveLength(1);
    expect(segments[0].timer_id).toBe(timer.id);
  });

  it('updates segment start/end times', () => {
    const timer = timersDb.create(db, { company_id: companyId });
    timersDb.start(db, timer.id);
    const segments = timersDb.getSegments(db, timer.id);

    const updated = timersDb.updateSegment(db, segments[0].id, {
      started: '2026-04-01T15:30:00.000Z',
      ended: '2026-04-01T17:00:00.000Z',
    });
    expect(updated!.started).toBe('2026-04-01T15:30:00.000Z');
    expect(updated!.ended).toBe('2026-04-01T17:00:00.000Z');
  });

  it('resume creates segment with rounded start time', () => {
    const timer = timersDb.create(db, { company_id: companyId });
    timersDb.start(db, timer.id);
    timersDb.pause(db, timer.id);
    timersDb.resume(db, timer.id);

    const segments = timersDb.getSegments(db, timer.id);
    expect(segments).toHaveLength(2);

    // The resumed segment's start should be rounded to 15-min
    const resumedStart = new Date(segments[1].started);
    expect(resumedStart.getMinutes() % 15).toBe(0);
  });
});

describe('MCP tool logic: daily_summary', () => {
  it('aggregates timers by date', () => {
    const db = freshDb();
    const co = companiesDb.create(db, { name: 'Co' });
    const proj = projectsDb.create(db, { company_id: co.id, name: 'Proj' });

    const today = new Date().toISOString().slice(0, 10);
    timersDb.addEntry(db, {
      company_id: co.id,
      project_id: proj.id,
      started: `${today}T09:00:00.000Z`,
      ended: `${today}T10:30:00.000Z`,
    });
    timersDb.addEntry(db, {
      company_id: co.id,
      project_id: proj.id,
      started: `${today}T13:00:00.000Z`,
      ended: `${today}T14:00:00.000Z`,
    });

    // Same query the MCP tool uses — compute duration from segments
    const rows = db.prepare(`
      SELECT t.*, c.name as company_name, p.name as project_name,
             COALESCE(SUM(
               CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
             ), 0) as computed_ms
      FROM timers t
      LEFT JOIN companies c ON c.id = t.company_id
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN timer_segments ts ON ts.timer_id = t.id
      WHERE date(t.started) = date(?)
      GROUP BY t.id
      ORDER BY t.started
    `).all(today) as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(2);
    const totalMs = rows.reduce((sum, r) => sum + ((r.computed_ms as number) ?? 0), 0);
    expect(totalMs / 3600000).toBe(2.5); // 1.5h + 1h
  });
});

describe('MCP tool logic: cap_status', () => {
  it('returns cap data for capped projects', () => {
    const db = freshDb();
    const co = companiesDb.create(db, { name: 'Co' });
    projectsDb.create(db, { company_id: co.id, name: 'Capped', daily_cap_hrs: 8 });
    projectsDb.create(db, { company_id: co.id, name: 'Uncapped' });

    const rows = db.prepare(`
      SELECT p.name, p.daily_cap_hrs, p.weekly_cap_hrs
      FROM projects p
      WHERE p.daily_cap_hrs IS NOT NULL OR p.weekly_cap_hrs IS NOT NULL
    `).all() as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Capped');
  });
});

describe('MCP tool logic: config operations', () => {
  let db: Database.Database;

  beforeEach(() => { db = freshDb(); });

  it('creates and lists companies', () => {
    companiesDb.create(db, { name: 'Alpha' });
    companiesDb.create(db, { name: 'Beta' });
    expect(companiesDb.findAll(db)).toHaveLength(2);
  });

  it('creates projects and tasks', () => {
    const co = companiesDb.create(db, { name: 'Co' });
    const proj = projectsDb.create(db, { company_id: co.id, name: 'Web' });
    tasksDb.create(db, { company_id: co.id, project_id: proj.id, name: 'Task', code: 'T-1' });

    expect(projectsDb.findByCompany(db, co.id)).toHaveLength(1);
    expect(tasksDb.findByProject(db, proj.id)).toHaveLength(1);
  });
});

describe('MCP tool logic: recurring timers', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = companiesDb.create(db, { name: 'Co' }).id;
  });

  it('creates and lists recurring timers', () => {
    recurringDb.create(db, { company_id: companyId, pattern: 'daily', start_date: '2026-03-01' });
    recurringDb.create(db, { company_id: companyId, pattern: 'weekly', weekday: 1, start_date: '2026-03-01' });

    expect(recurringDb.findAll(db)).toHaveLength(2);
    expect(recurringDb.findActive(db)).toHaveLength(2);
  });

  it('skip/unskip dates', () => {
    const rec = recurringDb.create(db, { company_id: companyId, pattern: 'daily', start_date: '2026-03-01' });
    recurringDb.skipDate(db, rec.id, '2026-03-15');
    expect(recurringDb.findById(db, rec.id)!.skipped_dates).toEqual(['2026-03-15']);
    recurringDb.unskipDate(db, rec.id, '2026-03-15');
    expect(recurringDb.findById(db, rec.id)!.skipped_dates).toEqual([]);
  });
});

describe('MCP tool logic: notifications', () => {
  let db: Database.Database;

  beforeEach(() => { db = freshDb(); });

  it('schedule and cancel', () => {
    const n = notificationsDb.create(db, {
      type: 'cap_warning', title: 'Cap!', trigger_at: '2026-03-26T15:00:00Z',
    });
    expect(notificationsDb.findPending(db)).toHaveLength(1);
    notificationsDb.cancel(db, n.id);
    expect(notificationsDb.findPending(db)).toHaveLength(0);
  });
});

describe('MCP tool logic: invoice_report', () => {
  it('generates invoice data for a date range', () => {
    const db = freshDb();
    const co = companiesDb.create(db, { name: 'Client' });
    const proj = projectsDb.create(db, { company_id: co.id, name: 'Web' });

    timersDb.addEntry(db, {
      company_id: co.id,
      project_id: proj.id,
      started: '2026-03-15T09:00:00.000Z',
      ended: '2026-03-15T17:00:00.000Z',
      notes: 'Full day',
    });
    timersDb.addEntry(db, {
      company_id: co.id,
      project_id: proj.id,
      started: '2026-03-16T09:00:00.000Z',
      ended: '2026-03-16T13:00:00.000Z',
      notes: 'Half day',
    });

    // Same query the MCP tool uses
    const rows = db.prepare(`
      SELECT t.*, c.name as company_name, p.name as project_name,
             COALESCE(SUM(
               CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
             ), 0) as computed_ms
      FROM timers t
      LEFT JOIN companies c ON c.id = t.company_id
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN timer_segments ts ON ts.timer_id = t.id
      WHERE t.company_id = ? AND date(t.started) >= date(?) AND date(t.started) <= date(?)
      GROUP BY t.id
      ORDER BY t.started
    `).all(co.id, '2026-03-15', '2026-03-16') as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(2);
    const totalMs = rows.reduce((sum, r) => sum + ((r.computed_ms as number) ?? 0), 0);
    expect(totalMs / 3600000).toBeCloseTo(12, 1); // 8h + 4h
  });
});

describe('MCP tool logic: stickies + reminders', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  const futureIso = (): string => new Date(Date.now() + 86_400_000).toISOString();

  function pending() {
    return notificationsDb.findPending(db).filter(n => n.type === STICKY_REMINDER_TYPE);
  }

  it('computeTriggerAt subtracts the offset from due_at', () => {
    const due = '2026-07-01T09:00:00.000Z';
    expect(computeTriggerAt(due, 30, 'min')).toBe('2026-07-01T08:30:00.000Z');
    expect(computeTriggerAt(due, 2, 'hour')).toBe('2026-07-01T07:00:00.000Z');
    expect(computeTriggerAt(due, 1, 'day')).toBe('2026-06-30T09:00:00.000Z');
    expect(computeTriggerAt(due, 1, 'month')).toBe('2026-06-01T09:00:00.000Z');
  });

  it('create_sticky scopes via a scope tag', () => {
    const s = stickiesDb.create(db, { title: 'fix flaky test', tags: [{ key: 'scope', value: 'zb-ui' }] });
    expect(stickiesDb.list(db, { repo_scope: 'zb-ui' }).map(x => x.id)).toContain(s.id);
    expect(stickiesDb.list(db, { repo_scope: 'sme-mart' }).map(x => x.id)).not.toContain(s.id);
  });

  it('schedules a reminder for a notify-enabled dated sticky', () => {
    const s = stickiesDb.create(db, {
      title: 'audit MEMORY.md',
      due_at: futureIso(),
      notify_enabled: true,
      notify_offset_n: 2,
      notify_offset_unit: 'day',
    });
    syncStickyReminder(db, s);
    const reminders = pending();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].sticky_id).toBe(s.id);
    expect(reminders[0].trigger_at).toBe(computeTriggerAt(s.due_at!, 2, 'day'));
  });

  it('does not schedule when notify is off or there is no due date', () => {
    const noNotify = stickiesDb.create(db, { title: 'a', due_at: futureIso() });
    syncStickyReminder(db, noNotify);
    const noDue = stickiesDb.create(db, { title: 'b', notify_enabled: true });
    syncStickyReminder(db, noDue);
    expect(pending()).toHaveLength(0);
  });

  it('reschedules on re-sync and cancels the prior reminder (no duplicates)', () => {
    let s = stickiesDb.create(db, { title: 'r', due_at: futureIso(), notify_enabled: true });
    syncStickyReminder(db, s);
    expect(pending()).toHaveLength(1);

    s = stickiesDb.update(db, s.id, { due_at: '2026-09-09T09:00:00.000Z' })!;
    syncStickyReminder(db, s);
    const reminders = pending();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].trigger_at).toBe('2026-09-09T09:00:00.000Z');
  });

  it('cancels the reminder when the sticky is checked or archived', () => {
    const s = stickiesDb.create(db, { title: 'r', due_at: futureIso(), notify_enabled: true });
    syncStickyReminder(db, s);
    expect(pending()).toHaveLength(1);

    const checked = stickiesDb.check(db, s.id)!;
    syncStickyReminder(db, checked);
    expect(pending()).toHaveLength(0);
  });

  it('cancelStickyReminder clears pending reminders on delete', () => {
    const s = stickiesDb.create(db, { title: 'r', due_at: futureIso(), notify_enabled: true });
    syncStickyReminder(db, s);
    expect(cancelStickyReminder(db, s.id)).toBe(1);
    expect(pending()).toHaveLength(0);
  });
});

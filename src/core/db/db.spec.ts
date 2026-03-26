import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from './schema.js';
import * as companies from './companies.js';
import * as projects from './projects.js';
import * as tasks from './tasks.js';
import * as timers from './timers.js';
import * as recurring from './recurring.js';
import * as notifications from './notifications.js';
import { generateSlug } from './slug.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

// Helper: create a company and return it
function seedCompany(db: Database.Database, name = 'Acme Corp') {
  return companies.create(db, { name, initials: 'AC', color: '#ff0000' });
}

// Helper: create company + project
function seedProject(db: Database.Database) {
  const co = seedCompany(db);
  const proj = projects.create(db, { company_id: co.id, name: 'Web App', daily_cap_hrs: 8 });
  return { company: co, project: proj };
}

describe('Schema', () => {
  it('creates all tables', () => {
    const db = freshDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('companies');
    expect(names).toContain('projects');
    expect(names).toContain('tasks');
    expect(names).toContain('timers');
    expect(names).toContain('timer_segments');
    expect(names).toContain('recurring_timers');
    expect(names).toContain('notifications');
  });

  it('is idempotent', () => {
    const db = freshDb();
    expect(() => applySchema(db)).not.toThrow();
  });
});

describe('Companies', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  it('creates and retrieves a company', () => {
    const co = companies.create(db, { name: 'Test Co', initials: 'TC', color: '#00ff00' });
    expect(co.name).toBe('Test Co');
    expect(co.initials).toBe('TC');
    expect(co.id).toBeTruthy();

    const found = companies.findById(db, co.id);
    expect(found).toEqual(co);
  });

  it('lists all companies', () => {
    companies.create(db, { name: 'Alpha' });
    companies.create(db, { name: 'Beta' });
    const all = companies.findAll(db);
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('Alpha');
  });

  it('updates a company', () => {
    const co = companies.create(db, { name: 'Old Name' });
    const updated = companies.update(db, co.id, { name: 'New Name' });
    expect(updated!.name).toBe('New Name');
  });

  it('deletes a company', () => {
    const co = companies.create(db, { name: 'Doomed' });
    expect(companies.remove(db, co.id)).toBe(true);
    expect(companies.findById(db, co.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent company', () => {
    expect(companies.remove(db, 'NONEXISTENT')).toBe(false);
  });
});

describe('Projects', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  it('creates a project linked to a company', () => {
    const co = seedCompany(db);
    const proj = projects.create(db, { company_id: co.id, name: 'Dashboard', billable: true, daily_cap_hrs: 6 });
    expect(proj.name).toBe('Dashboard');
    expect(proj.company_id).toBe(co.id);
    expect(proj.billable).toBe(true);
    expect(proj.daily_cap_hrs).toBe(6);
  });

  it('finds projects by company', () => {
    const co = seedCompany(db);
    projects.create(db, { company_id: co.id, name: 'P1' });
    projects.create(db, { company_id: co.id, name: 'P2' });
    expect(projects.findByCompany(db, co.id)).toHaveLength(2);
  });

  it('updates project fields', () => {
    const co = seedCompany(db);
    const proj = projects.create(db, { company_id: co.id, name: 'Old' });
    const updated = projects.update(db, proj.id, { name: 'New', billable: false });
    expect(updated!.name).toBe('New');
    expect(updated!.billable).toBe(false);
  });

  it('maps boolean fields correctly', () => {
    const co = seedCompany(db);
    const proj = projects.create(db, { company_id: co.id, name: 'Test', billable: false, notify_on_cap: false });
    expect(proj.billable).toBe(false);
    expect(proj.notify_on_cap).toBe(false);
  });
});

describe('Tasks', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  it('creates a task', () => {
    const co = seedCompany(db);
    const task = tasks.create(db, { company_id: co.id, name: 'Fix bug', code: 'BUG-123' });
    expect(task.name).toBe('Fix bug');
    expect(task.code).toBe('BUG-123');
  });

  it('finds tasks by company and project', () => {
    const { company, project } = seedProject(db);
    tasks.create(db, { company_id: company.id, project_id: project.id, name: 'T1' });
    tasks.create(db, { company_id: company.id, project_id: project.id, name: 'T2' });
    tasks.create(db, { company_id: company.id, name: 'T3' });

    expect(tasks.findByCompany(db, company.id)).toHaveLength(3);
    expect(tasks.findByProject(db, project.id)).toHaveLength(2);
  });

  it('updates and deletes a task', () => {
    const co = seedCompany(db);
    const task = tasks.create(db, { company_id: co.id, name: 'Old' });
    const updated = tasks.update(db, task.id, { name: 'New', url: 'https://example.com' });
    expect(updated!.name).toBe('New');
    expect(updated!.url).toBe('https://example.com');
    expect(tasks.remove(db, task.id)).toBe(true);
  });
});

describe('Timers', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = seedCompany(db).id;
  });

  it('creates a timer with a slug', () => {
    const timer = timers.create(db, { company_id: companyId });
    expect(timer.state).toBe('stopped');
    expect(timer.slug).toMatch(/^\d{6}-\d+$/);
  });

  it('starts and stops a timer', () => {
    const timer = timers.create(db, { company_id: companyId });

    const started = timers.start(db, timer.id);
    expect(started.state).toBe('running');
    expect(started.started).toBeTruthy();

    const segments = timers.getSegments(db, timer.id);
    expect(segments).toHaveLength(1);
    expect(segments[0].ended).toBeNull();

    const stopped = timers.stop(db, timer.id);
    expect(stopped.state).toBe('stopped');
    expect(stopped.ended).toBeTruthy();
    expect(stopped.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('pauses and resumes a timer', () => {
    const timer = timers.create(db, { company_id: companyId });
    timers.start(db, timer.id);

    const paused = timers.pause(db, timer.id);
    expect(paused.state).toBe('paused');

    const resumed = timers.resume(db, timer.id);
    expect(resumed.state).toBe('running');

    // Should have 2 segments now
    const segments = timers.getSegments(db, timer.id);
    expect(segments).toHaveLength(2);
  });

  it('auto-stops running timer when starting another', () => {
    const t1 = timers.create(db, { company_id: companyId });
    const t2 = timers.create(db, { company_id: companyId });

    timers.start(db, t1.id);
    timers.start(db, t2.id);

    const t1After = timers.findById(db, t1.id)!;
    expect(t1After.state).toBe('stopped');

    const running = timers.findRunning(db);
    expect(running!.id).toBe(t2.id);
  });

  it('finds timer by slug', () => {
    const timer = timers.create(db, { company_id: companyId });
    const found = timers.findBySlug(db, timer.slug!);
    expect(found!.id).toBe(timer.id);
  });

  it('adds a manual entry with segment', () => {
    const entry = timers.addEntry(db, {
      company_id: companyId,
      started: '2026-03-26T09:00:00.000Z',
      ended: '2026-03-26T10:30:00.000Z',
      notes: 'Meeting',
    });
    expect(entry.state).toBe('stopped');
    expect(entry.duration_ms).toBe(90 * 60 * 1000);

    const segments = timers.getSegments(db, entry.id);
    expect(segments).toHaveLength(1);
    expect(segments[0].duration_ms).toBe(90 * 60 * 1000);
  });

  it('throws on invalid state transitions', () => {
    const timer = timers.create(db, { company_id: companyId });
    expect(() => timers.pause(db, timer.id)).toThrow('not running');
    expect(() => timers.resume(db, timer.id)).toThrow('not paused');
  });

  it('serializes and deserializes external_task JSON', () => {
    const timer = timers.create(db, {
      company_id: companyId,
      external_task: { provider: 'jira', id: 'PROJ-123' },
    });
    expect(timer.external_task).toEqual({ provider: 'jira', id: 'PROJ-123' });
  });
});

describe('Slug generation', () => {
  it('generates sequential slugs for the same day', () => {
    const db = freshDb();
    const co = seedCompany(db);
    const date = new Date('2026-03-26');

    const t1 = timers.create(db, { company_id: co.id });
    const t2 = timers.create(db, { company_id: co.id });

    // Both should be for today, sequential
    expect(t1.slug).toMatch(/^\d{6}-1$/);
    expect(t2.slug).toMatch(/^\d{6}-2$/);
  });

  it('generates slug for a specific date', () => {
    const db = freshDb();
    const slug = generateSlug(db, new Date('2025-12-25T12:00:00'));
    expect(slug).toBe('251225-1');
  });
});

describe('Recurring timers', () => {
  let db: Database.Database;
  let companyId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = seedCompany(db).id;
  });

  it('creates a recurring timer', () => {
    const rec = recurring.create(db, {
      company_id: companyId,
      pattern: 'weekly',
      weekday: 1,
      start_time: '09:00',
      start_date: '2026-03-01',
    });
    expect(rec.pattern).toBe('weekly');
    expect(rec.weekday).toBe(1);
    expect(rec.active).toBe(true);
    expect(rec.skipped_dates).toEqual([]);
  });

  it('finds active recurring timers', () => {
    recurring.create(db, { company_id: companyId, pattern: 'daily', start_date: '2026-03-01' });
    const inactive = recurring.create(db, { company_id: companyId, pattern: 'daily', start_date: '2026-03-01' });
    recurring.update(db, inactive.id, { active: false });

    expect(recurring.findActive(db)).toHaveLength(1);
    expect(recurring.findAll(db)).toHaveLength(2);
  });

  it('skips and unskips dates', () => {
    const rec = recurring.create(db, { company_id: companyId, pattern: 'daily', start_date: '2026-03-01' });

    const skipped = recurring.skipDate(db, rec.id, '2026-03-15');
    expect(skipped!.skipped_dates).toEqual(['2026-03-15']);

    const unskipped = recurring.unskipDate(db, rec.id, '2026-03-15');
    expect(unskipped!.skipped_dates).toEqual([]);
  });
});

describe('Notifications', () => {
  let db: Database.Database;

  beforeEach(() => { db = freshDb(); });

  it('creates and lists notifications', () => {
    const n = notifications.create(db, {
      type: 'cap_warning',
      title: 'Daily cap approaching',
      message: '7.5 of 8 hours',
      trigger_at: '2026-03-26T15:00:00.000Z',
    });
    expect(n.type).toBe('cap_warning');
    expect(n.dismissed).toBe(false);
    expect(n.fired_at).toBeNull();
  });

  it('marks notification as fired', () => {
    const n = notifications.create(db, {
      type: 'reminder',
      title: 'Start work',
      trigger_at: '2026-03-26T09:00:00.000Z',
    });
    const fired = notifications.markFired(db, n.id);
    expect(fired!.fired_at).toBeTruthy();
  });

  it('dismisses a notification', () => {
    const n = notifications.create(db, {
      type: 'info',
      title: 'Test',
      trigger_at: '2026-03-26T09:00:00.000Z',
    });
    const dismissed = notifications.dismiss(db, n.id);
    expect(dismissed!.dismissed).toBe(true);
  });

  it('finds pending notifications', () => {
    notifications.create(db, { type: 'a', title: 'Pending', trigger_at: '2026-03-26T09:00:00.000Z' });
    const fired = notifications.create(db, { type: 'b', title: 'Fired', trigger_at: '2026-03-26T08:00:00.000Z' });
    notifications.markFired(db, fired.id);

    const pending = notifications.findPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('Pending');
  });

  it('cancels an unfired notification', () => {
    const n = notifications.create(db, { type: 'x', title: 'Cancel me', trigger_at: '2026-03-26T12:00:00.000Z' });
    expect(notifications.cancel(db, n.id)).toBe(true);
    expect(notifications.findById(db, n.id)).toBeUndefined();
  });

  it('cannot cancel a fired notification', () => {
    const n = notifications.create(db, { type: 'x', title: 'Already fired', trigger_at: '2026-03-26T12:00:00.000Z' });
    notifications.markFired(db, n.id);
    expect(notifications.cancel(db, n.id)).toBe(false);
  });
});

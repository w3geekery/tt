import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from './schema.js';
import * as companies from './companies.js';
import * as projects from './projects.js';
import * as tasks from './tasks.js';
import * as timers from './timers.js';
import * as recurring from './recurring.js';
import * as notifications from './notifications.js';
import * as stickies from './stickies.js';
import * as specstory from './specstory.js';
import * as weeklyTasks from './weekly-tasks.js';
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

describe('SpecStory sessions', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  const session1 = {
    path: '/Users/cstacer/Projects/w3geekery/tt/.specstory/history/session1.md',
    repo: 'tt',
    company: 'W3Geekery',
    started: '2026-03-26T09:00:00.000Z',
    ended: '2026-03-26T12:00:00.000Z',
    size_bytes: 5000,
    summary: 'Built database layer with 33 tests',
  };

  const session2 = {
    path: '/Users/cstacer/Projects/zb/sme-mart/.specstory/history/session2.md',
    repo: 'sme-mart',
    company: 'ZeroBias',
    started: '2026-03-26T13:00:00.000Z',
    ended: '2026-03-26T17:00:00.000Z',
    size_bytes: 8000,
    summary: 'Refactored NoteHierarchyService',
  };

  it('upserts and retrieves by path', () => {
    specstory.upsert(db, session1);
    const found = specstory.findByPath(db, session1.path);
    expect(found).toBeTruthy();
    expect(found!.repo).toBe('tt');
    expect(found!.summary).toBe('Built database layer with 33 tests');
    expect(found!.cached_at).toBeTruthy();
  });

  it('upserts updates existing entry', () => {
    specstory.upsert(db, session1);
    specstory.upsert(db, { ...session1, size_bytes: 6000, summary: 'Updated summary' });
    const found = specstory.findByPath(db, session1.path);
    expect(found!.size_bytes).toBe(6000);
    expect(found!.summary).toBe('Updated summary');
  });

  it('finds by date', () => {
    specstory.upsert(db, session1);
    specstory.upsert(db, session2);

    const results = specstory.findByDate(db, '2026-03-26');
    expect(results).toHaveLength(2);
    expect(results[0].repo).toBe('tt');
    expect(results[1].repo).toBe('sme-mart');
  });

  it('finds by date range', () => {
    specstory.upsert(db, session1);
    specstory.upsert(db, { ...session2, started: '2026-03-27T09:00:00.000Z', ended: '2026-03-27T12:00:00.000Z' });

    const results = specstory.findByDateRange(db, '2026-03-26', '2026-03-27');
    expect(results).toHaveLength(2);

    const onlyFirst = specstory.findByDateRange(db, '2026-03-26', '2026-03-26');
    expect(onlyFirst).toHaveLength(1);
  });

  it('finds by repo', () => {
    specstory.upsert(db, session1);
    specstory.upsert(db, session2);

    expect(specstory.findByRepo(db, 'tt')).toHaveLength(1);
    expect(specstory.findByRepo(db, 'sme-mart')).toHaveLength(1);
    expect(specstory.findByRepo(db, 'nonexistent')).toHaveLength(0);
  });

  it('detects stale entries by size', () => {
    specstory.upsert(db, session1);
    expect(specstory.findStale(db, session1.path, 5000)).toBe(false);
    expect(specstory.findStale(db, session1.path, 6000)).toBe(true);
    expect(specstory.findStale(db, '/nonexistent', 100)).toBe(true);
  });

  it('batch upserts', () => {
    specstory.upsertBatch(db, [session1, session2]);
    expect(specstory.findByDate(db, '2026-03-26')).toHaveLength(2);
  });

  it('removes stale paths', () => {
    specstory.upsertBatch(db, [session1, session2]);
    const removed = specstory.removeStalePaths(db, [session1.path]);
    expect(removed).toBe(1);
    expect(specstory.findByPath(db, session1.path)).toBeTruthy();
    expect(specstory.findByPath(db, session2.path)).toBeUndefined();
  });
});

describe('Stickies', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  const pastIso = (): string => new Date(Date.now() - 3600_000).toISOString();
  const futureIso = (): string => new Date(Date.now() + 3600_000).toISOString();

  it('creates a sticky with sensible defaults', () => {
    const s = stickies.create(db, { title: 'buy milk' });
    expect(s.id).toMatch(/^[0-9A-F]{32}$/);
    expect(s.checked).toBe(false);
    expect(s.pinned).toBe(false);
    expect(s.archived).toBe(false);
    expect(s.notify_enabled).toBe(false);
    expect(s.parent_id).toBeNull();
    expect(s.tags).toEqual([]);
    expect(s.position).toBe(1);
  });

  it('persists tags, color, due, and notify offset', () => {
    const s = stickies.create(db, {
      title: 'audit MEMORY.md',
      color: 'teal',
      due_at: futureIso(),
      notify_enabled: true,
      notify_offset_n: 2,
      notify_offset_unit: 'day',
      tags: [
        { key: 'scope', value: 'zb-ui' },
        { key: 'topic', value: 'maintenance' },
      ],
    });
    const found = stickies.findById(db, s.id)!;
    expect(found.color).toBe('teal');
    expect(found.notify_enabled).toBe(true);
    expect(found.notify_offset_n).toBe(2);
    expect(found.notify_offset_unit).toBe('day');
    expect(found.tags).toEqual([
      { key: 'scope', value: 'zb-ui' },
      { key: 'topic', value: 'maintenance' },
    ]);
  });

  it('auto-increments position among siblings', () => {
    const a = stickies.create(db, { title: 'a' });
    const b = stickies.create(db, { title: 'b' });
    expect(a.position).toBe(1);
    expect(b.position).toBe(2);
  });

  it('returns undefined for a missing id', () => {
    expect(stickies.findById(db, 'NOPE')).toBeUndefined();
  });

  it('patches only provided fields on update', () => {
    const s = stickies.create(db, { title: 'draft', body: 'one' });
    const u = stickies.update(db, s.id, { title: 'final' })!;
    expect(u.title).toBe('final');
    expect(u.body).toBe('one');
  });

  it('replaces the entire tag set when tags provided', () => {
    const s = stickies.create(db, { title: 't', tags: [{ key: 'scope', value: 'tt' }] });
    const u = stickies.update(db, s.id, { tags: [{ key: 'topic', value: 'yoga' }] })!;
    expect(u.tags).toEqual([{ key: 'topic', value: 'yoga' }]);
  });

  it('checks and unchecks a standalone sticky', () => {
    const s = stickies.create(db, { title: 'task' });
    const checked = stickies.check(db, s.id)!;
    expect(checked.checked).toBe(true);
    expect(checked.checked_at).toBeTruthy();
    const un = stickies.uncheck(db, s.id)!;
    expect(un.checked).toBe(false);
    expect(un.checked_at).toBeNull();
  });

  it('auto-checks the parent when all children are checked, and reopens on uncheck', () => {
    const parent = stickies.create(db, { title: 'groceries' });
    const c1 = stickies.create(db, { title: 'milk', parent_id: parent.id });
    const c2 = stickies.create(db, { title: 'eggs', parent_id: parent.id });

    stickies.check(db, c1.id);
    expect(stickies.findById(db, parent.id)!.checked).toBe(false);

    stickies.check(db, c2.id);
    expect(stickies.findById(db, parent.id)!.checked).toBe(true);

    stickies.uncheck(db, c2.id);
    expect(stickies.findById(db, parent.id)!.checked).toBe(false);
  });

  it('pins, archives, and reorders', () => {
    const s = stickies.create(db, { title: 's' });
    expect(stickies.pin(db, s.id)!.pinned).toBe(true);
    expect(stickies.unpin(db, s.id)!.pinned).toBe(false);
    const a = stickies.archive(db, s.id)!;
    expect(a.archived).toBe(true);
    expect(a.archived_at).toBeTruthy();
    expect(stickies.unarchive(db, s.id)!.archived_at).toBeNull();
    expect(stickies.reorder(db, s.id, 42.5)!.position).toBe(42.5);
  });

  it('removes a sticky and cascades children + tags', () => {
    const parent = stickies.create(db, { title: 'p', tags: [{ key: 'scope', value: 'tt' }] });
    const child = stickies.create(db, { title: 'c', parent_id: parent.id });
    expect(stickies.remove(db, parent.id)).toBe(true);
    expect(stickies.findById(db, parent.id)).toBeUndefined();
    expect(stickies.findById(db, child.id)).toBeUndefined();
    const tagCount = db.prepare('SELECT COUNT(*) AS n FROM sticky_tags').get() as { n: number };
    expect(tagCount.n).toBe(0);
  });

  it('gathers stickies under a parent and breaks them back out', () => {
    const parent = stickies.create(db, { title: 'list' });
    const a = stickies.create(db, { title: 'a' });
    const b = stickies.create(db, { title: 'b' });

    stickies.makeChecklist(db, parent.id, [a.id, b.id]);
    expect(stickies.listChildren(db, parent.id).map(c => c.title).sort()).toEqual(['a', 'b']);

    stickies.detach(db, a.id);
    expect(stickies.findById(db, a.id)!.parent_id).toBeNull();
    expect(stickies.listChildren(db, parent.id).map(c => c.title)).toEqual(['b']);
  });

  it('ignores an attempt to parent a sticky to itself', () => {
    const parent = stickies.create(db, { title: 'list' });
    stickies.makeChecklist(db, parent.id, [parent.id]);
    expect(stickies.findById(db, parent.id)!.parent_id).toBeNull();
  });

  it('adds and removes individual tags idempotently', () => {
    const s = stickies.create(db, { title: 's' });
    stickies.addTag(db, s.id, 'scope', 'tt');
    stickies.addTag(db, s.id, 'scope', 'tt');
    expect(stickies.findById(db, s.id)!.tags).toEqual([{ key: 'scope', value: 'tt' }]);
    stickies.removeTag(db, s.id, 'scope', 'tt');
    expect(stickies.findById(db, s.id)!.tags).toEqual([]);
  });

  it('list defaults to open, top-level, pinned-first', () => {
    const a = stickies.create(db, { title: 'a' });
    const b = stickies.create(db, { title: 'b' });
    stickies.pin(db, b.id);
    stickies.check(db, a.id);
    expect(stickies.list(db).map(s => s.title)).toEqual(['b']);
  });

  it('list excludes children unless include_children is set', () => {
    const parent = stickies.create(db, { title: 'p' });
    stickies.create(db, { title: 'c', parent_id: parent.id });
    const roots = stickies.list(db);
    expect(roots.map(s => s.title)).toEqual(['p']);
    expect(roots[0]!.children).toBeUndefined();
    const nested = stickies.list(db, { include_children: true });
    expect(nested[0]!.children!.map(c => c.title)).toEqual(['c']);
  });

  it('list scopes to global + the given repo, excluding other repos', () => {
    stickies.create(db, { title: 'global note' });
    stickies.create(db, { title: 'zb thing', tags: [{ key: 'scope', value: 'zb-ui' }] });
    stickies.create(db, { title: 'sme thing', tags: [{ key: 'scope', value: 'sme-mart' }] });
    const slice = stickies.list(db, { repo_scope: 'zb-ui' });
    expect(slice.map(s => s.title).sort()).toEqual(['global note', 'zb thing']);
  });

  it('list honors the limit cap', () => {
    for (let i = 0; i < 5; i++) stickies.create(db, { title: `s${i}` });
    expect(stickies.list(db, { limit: 2 })).toHaveLength(2);
  });

  it('session slice surfaces due/overdue but not future-dated items', () => {
    stickies.create(db, { title: 'overdue', due_at: pastIso() });
    stickies.create(db, { title: 'later', due_at: futureIso() });
    expect(stickies.getSessionSlice(db).map(s => s.title)).toEqual(['overdue']);
  });

  it('session slice surfaces repo-scoped undated items but not global undated (grab-bag)', () => {
    stickies.create(db, { title: 'global grab bag' });
    stickies.create(db, { title: 'repo todo', tags: [{ key: 'scope', value: 'zb-ui' }] });
    expect(stickies.getSessionSlice(db, { repo_scope: 'zb-ui' }).map(s => s.title)).toEqual(['repo todo']);
    expect(stickies.getSessionSlice(db)).toHaveLength(0);
  });

  it('session slice excludes checked and archived items', () => {
    const a = stickies.create(db, { title: 'done', due_at: pastIso() });
    const b = stickies.create(db, { title: 'archived', due_at: pastIso() });
    stickies.check(db, a.id);
    stickies.archive(db, b.id);
    expect(stickies.getSessionSlice(db)).toHaveLength(0);
  });

  it('grab returns an open undated sticky and nothing once none remain', () => {
    stickies.create(db, { title: 'dated', due_at: futureIso() });
    const bag = stickies.create(db, { title: 'someday' });
    expect(stickies.grab(db)!.id).toBe(bag.id);
    stickies.check(db, bag.id);
    expect(stickies.grab(db)).toBeUndefined();
  });

  it('grab respects scope', () => {
    stickies.create(db, { title: 'zb idea', tags: [{ key: 'scope', value: 'zb-ui' }] });
    expect(stickies.grab(db, 'sme-mart')).toBeUndefined();
    expect(stickies.grab(db, 'zb-ui')!.title).toBe('zb idea');
  });

  it('normalizes due_at to canonical UTC Z on create, regardless of input zone', () => {
    const offset = stickies.create(db, { title: 'o', due_at: '2026-07-01T09:00:00-07:00' });
    expect(stickies.findById(db, offset.id)!.due_at).toBe('2026-07-01T16:00:00.000Z');

    const zulu = stickies.create(db, { title: 'z', due_at: '2026-07-01T16:00:00Z' });
    expect(stickies.findById(db, zulu.id)!.due_at).toBe('2026-07-01T16:00:00.000Z');
  });

  it('normalizes due_at on update and clears it on null', () => {
    const s = stickies.create(db, { title: 's' });
    expect(stickies.update(db, s.id, { due_at: '2026-07-01T09:00:00-07:00' })!.due_at).toBe('2026-07-01T16:00:00.000Z');
    expect(stickies.update(db, s.id, { due_at: null })!.due_at).toBeNull();
  });

  it('orders the session slice by true instant even across mixed input zones', () => {
    // Same calendar day, different zones: 08:00Z (offset form) is later than 00:00Z.
    stickies.create(db, { title: 'newer', due_at: '2020-01-01T00:00:00-08:00' }); // 08:00Z
    stickies.create(db, { title: 'older', due_at: '2020-01-01T00:00:00Z' });       // 00:00Z
    expect(stickies.getSessionSlice(db).map(s => s.title)).toEqual(['older', 'newer']);
  });

  it('throws on an invalid due_at', () => {
    expect(() => stickies.create(db, { title: 'bad', due_at: 'not-a-date' })).toThrow(/Invalid date/);
  });
});

describe('Weekly tasks', () => {
  let db: Database.Database;
  beforeEach(() => { db = freshDb(); });

  const task = (over: Partial<weeklyTasks.WeeklyTask> = {}): weeklyTasks.WeeklyTask => ({
    week_start: '2026-05-04',
    company: 'ZeroBias',
    period_start: '2026-05-01',
    zb_task_id: 'id-default',
    zb_task_code: null,
    zb_task_name: null,
    ...over,
  });

  describe('derivePeriodStart', () => {
    it('maps a first-half Monday to the 1st', () => {
      expect(weeklyTasks.derivePeriodStart('2026-05-04')).toBe('2026-05-01');
    });
    it('maps a second-half Monday to the 16th', () => {
      expect(weeklyTasks.derivePeriodStart('2026-05-18')).toBe('2026-05-16');
    });
    it('uses the Monday day even when the week spills across the boundary', () => {
      // Apr 27 (day 27, second half) -> Apr 16 period, regardless of the week running into May.
      expect(weeklyTasks.derivePeriodStart('2026-04-27')).toBe('2026-04-16');
    });
  });

  describe('isSplitWeek', () => {
    it('is true when the week straddles the month boundary (1st)', () => {
      expect(weeklyTasks.isSplitWeek('2026-04-27')).toBe(true); // Apr 27 - May 3
    });
    it('is true when the week straddles the mid-month boundary (16th)', () => {
      expect(weeklyTasks.isSplitWeek('2026-05-11')).toBe(true); // May 11 - 17
    });
    it('is false for a week wholly inside one half-month', () => {
      expect(weeklyTasks.isSplitWeek('2026-05-04')).toBe(false); // May 4 - 10
    });
  });

  it('stores two halves of one Monday/company under distinct period_start', () => {
    weeklyTasks.upsert(db, task({ week_start: '2026-04-27', period_start: '2026-04-16', zb_task_id: 'apr', zb_task_code: 'aha1-17' }));
    weeklyTasks.upsert(db, task({ week_start: '2026-04-27', period_start: '2026-05-01', zb_task_id: 'may', zb_task_code: 'aha1-19' }));

    const rows = weeklyTasks.findByWeek(db, '2026-04-27');
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.period_start).sort()).toEqual(['2026-04-16', '2026-05-01']);
  });

  it('upsert updates the matching 3-col row in place (no duplicate)', () => {
    weeklyTasks.upsert(db, task({ zb_task_id: 'v1', zb_task_name: 'First' }));
    weeklyTasks.upsert(db, task({ zb_task_id: 'v2', zb_task_name: 'Second' }));

    const rows = weeklyTasks.findByWeek(db, '2026-05-04');
    expect(rows).toHaveLength(1);
    expect(rows[0].zb_task_id).toBe('v2');
    expect(rows[0].zb_task_name).toBe('Second');
  });

  it('remove with a period_start deletes only that half', () => {
    weeklyTasks.upsert(db, task({ week_start: '2026-04-27', period_start: '2026-04-16', zb_task_id: 'apr' }));
    weeklyTasks.upsert(db, task({ week_start: '2026-04-27', period_start: '2026-05-01', zb_task_id: 'may' }));

    expect(weeklyTasks.remove(db, '2026-04-27', 'ZeroBias', '2026-05-01')).toBe(true);
    const rows = weeklyTasks.findByWeek(db, '2026-04-27');
    expect(rows).toHaveLength(1);
    expect(rows[0].period_start).toBe('2026-04-16');
  });

  it('remove without a period_start deletes all halves for the company', () => {
    weeklyTasks.upsert(db, task({ week_start: '2026-04-27', period_start: '2026-04-16', zb_task_id: 'apr' }));
    weeklyTasks.upsert(db, task({ week_start: '2026-04-27', period_start: '2026-05-01', zb_task_id: 'may' }));
    weeklyTasks.upsert(db, task({ week_start: '2026-04-27', company: 'W3Geekery', period_start: '2026-05-01', zb_task_id: 'sm' }));

    expect(weeklyTasks.remove(db, '2026-04-27', 'ZeroBias')).toBe(true);
    const rows = weeklyTasks.findByWeek(db, '2026-04-27');
    expect(rows).toHaveLength(1);
    expect(rows[0].company).toBe('W3Geekery');
  });

  it('migrates an old 2-col-PK table, backfilling period_start from the Monday', () => {
    const old = new Database(':memory:');
    old.exec(`
      CREATE TABLE weekly_tasks (
        week_start TEXT NOT NULL,
        company TEXT NOT NULL,
        zb_task_id TEXT NOT NULL,
        zb_task_code TEXT,
        zb_task_name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (week_start, company)
      );
    `);
    old.prepare('INSERT INTO weekly_tasks (week_start, company, zb_task_id) VALUES (?, ?, ?)')
      .run('2026-05-04', 'ZeroBias', 'first-half');
    old.prepare('INSERT INTO weekly_tasks (week_start, company, zb_task_id) VALUES (?, ?, ?)')
      .run('2026-05-18', 'W3Geekery', 'second-half');

    applySchema(old);

    const cols = old.pragma('table_info(weekly_tasks)') as Array<{ name: string }>;
    expect(cols.some(c => c.name === 'period_start')).toBe(true);

    const a = old.prepare('SELECT * FROM weekly_tasks WHERE week_start = ?').get('2026-05-04') as weeklyTasks.WeeklyTask;
    expect(a.period_start).toBe('2026-05-01');
    const b = old.prepare('SELECT * FROM weekly_tasks WHERE week_start = ?').get('2026-05-18') as weeklyTasks.WeeklyTask;
    expect(b.period_start).toBe('2026-05-16');
  });

  it('migration is idempotent (second applySchema is a no-op)', () => {
    weeklyTasks.upsert(db, task());
    expect(() => applySchema(db)).not.toThrow();
    expect(weeklyTasks.findByWeek(db, '2026-05-04')).toHaveLength(1);
  });
});

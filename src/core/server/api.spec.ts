import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../db/schema.js';

// Mock getDb to return an in-memory database
let testDb: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDb: () => testDb,
  closeDb: () => { testDb?.close(); },
  resolveDbPath: (p: string) => p,
  createTestDb: () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applySchema(db);
    return db;
  },
}));

// Import after mock is set up
const { default: request } = await import('supertest');
const { createApp } = await import('./index.js');

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

function seedCompany(name = 'Acme Corp') {
  return request(createApp())
    .post('/api/companies')
    .send({ name, initials: 'AC', color: '#ff0000' });
}

describe('Companies API', () => {
  beforeEach(() => { testDb = freshDb(); });

  it('POST /api/companies creates a company', async () => {
    const res = await seedCompany();
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme Corp');
    expect(res.body.id).toBeTruthy();
  });

  it('GET /api/companies lists companies', async () => {
    await seedCompany('Alpha');
    await seedCompany('Beta');
    const res = await request(createApp()).get('/api/companies');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /api/companies/:id returns a company', async () => {
    const created = await seedCompany();
    const res = await request(createApp()).get(`/api/companies/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Corp');
  });

  it('GET /api/companies/:id returns 404 for unknown', async () => {
    const res = await request(createApp()).get('/api/companies/NOPE');
    expect(res.status).toBe(404);
  });

  it('PATCH /api/companies/:id updates a company', async () => {
    const created = await seedCompany();
    const res = await request(createApp())
      .patch(`/api/companies/${created.body.id}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('DELETE /api/companies/:id removes a company', async () => {
    const created = await seedCompany();
    const res = await request(createApp()).delete(`/api/companies/${created.body.id}`);
    expect(res.status).toBe(204);
  });
});

describe('Projects API', () => {
  beforeEach(() => { testDb = freshDb(); });

  it('CRUD lifecycle', async () => {
    const co = await seedCompany();
    const companyId = co.body.id;

    // Create
    const created = await request(createApp())
      .post('/api/projects')
      .send({ company_id: companyId, name: 'Web App', daily_cap_hrs: 8 });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Web App');
    expect(created.body.billable).toBe(true);

    // List
    const list = await request(createApp()).get('/api/projects');
    expect(list.body).toHaveLength(1);

    // By company (query param, not path param)
    const byCo = await request(createApp()).get(`/api/projects?company_id=${companyId}`);
    expect(byCo.body).toHaveLength(1);

    // Update
    const updated = await request(createApp())
      .patch(`/api/projects/${created.body.id}`)
      .send({ name: 'Dashboard', billable: false });
    expect(updated.body.name).toBe('Dashboard');
    expect(updated.body.billable).toBe(false);

    // Delete
    const deleted = await request(createApp()).delete(`/api/projects/${created.body.id}`);
    expect(deleted.status).toBe(204);
  });
});

describe('Tasks API', () => {
  beforeEach(() => { testDb = freshDb(); });

  it('CRUD lifecycle', async () => {
    const co = await seedCompany();

    const created = await request(createApp())
      .post('/api/tasks')
      .send({ company_id: co.body.id, name: 'Fix bug', code: 'BUG-1' });
    expect(created.status).toBe(201);

    const list = await request(createApp()).get('/api/tasks');
    expect(list.body).toHaveLength(1);

    const updated = await request(createApp())
      .patch(`/api/tasks/${created.body.id}`)
      .send({ name: 'Fixed bug' });
    expect(updated.body.name).toBe('Fixed bug');

    const deleted = await request(createApp()).delete(`/api/tasks/${created.body.id}`);
    expect(deleted.status).toBe(204);
  });
});

describe('Timers API', () => {
  let companyId: string;

  beforeEach(async () => {
    testDb = freshDb();
    const co = await seedCompany();
    companyId = co.body.id;
  });

  it('creates and auto-starts a timer', async () => {
    const res = await request(createApp())
      .post('/api/timers')
      .send({ company_id: companyId, notes: 'Test timer' });
    expect(res.status).toBe(201);
    expect(res.body.state).toBe('running');
    expect(res.body.slug).toMatch(/^\d{6}-\d+$/);
  });

  it('creates a scheduled timer without auto-starting', async () => {
    const res = await request(createApp())
      .post('/api/timers')
      .send({ company_id: companyId, start_at: '2099-01-01T10:00:00.000Z' });
    expect(res.status).toBe(201);
    expect(res.body.state).toBe('stopped');
  });

  it('start/stop lifecycle', async () => {
    const app = createApp();
    // POST auto-starts, so it's already running
    const created = await request(app)
      .post('/api/timers')
      .send({ company_id: companyId });
    expect(created.body.state).toBe('running');

    const running = await request(app).get('/api/timers/running');
    expect(running.body.id).toBe(created.body.id);

    const stopped = await request(app).post(`/api/timers/${created.body.id}/stop`);
    expect(stopped.body.state).toBe('stopped');
    expect(stopped.body.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('pause/resume lifecycle', async () => {
    const app = createApp();
    // POST auto-starts, already running
    const created = await request(app)
      .post('/api/timers')
      .send({ company_id: companyId });
    expect(created.body.state).toBe('running');

    const paused = await request(app).post(`/api/timers/${created.body.id}/pause`);
    expect(paused.body.state).toBe('paused');

    const resumed = await request(app).post(`/api/timers/${created.body.id}/resume`);
    expect(resumed.body.state).toBe('running');

    const segments = await request(app).get(`/api/timers/${created.body.id}/segments`);
    expect(segments.body).toHaveLength(2);
  });

  it('adds a manual entry', async () => {
    const res = await request(createApp())
      .post('/api/timers/entry')
      .send({
        company_id: companyId,
        started: '2026-03-26T09:00:00.000Z',
        ended: '2026-03-26T10:30:00.000Z',
        notes: 'Meeting',
      });
    expect(res.status).toBe(201);
    // 9:00→10:30 rounds to 9:00→10:30 (already on 15-min boundaries)
    expect(res.body.duration_ms).toBe(90 * 60 * 1000);
  });

  it('returns 400 for invalid state transitions', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/timers')
      .send({ company_id: companyId });
    // Timer is auto-started (running), so stop it first
    await request(app).post(`/api/timers/${created.body.id}/stop`);

    // Pausing a stopped timer should fail
    const pauseRes = await request(app).post(`/api/timers/${created.body.id}/pause`);
    expect(pauseRes.status).toBe(400);

    // Resuming a stopped timer should fail
    const resumeRes = await request(app).post(`/api/timers/${created.body.id}/resume`);
    expect(resumeRes.status).toBe(400);
  });

  it('finds by slug', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/timers')
      .send({ company_id: companyId });

    const res = await request(app).get(`/api/timers/slug/${created.body.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });
});

describe('Recurring API', () => {
  let companyId: string;

  beforeEach(async () => {
    testDb = freshDb();
    const co = await seedCompany();
    companyId = co.body.id;
  });

  it('CRUD + skip/unskip', async () => {
    const app = createApp();

    const created = await request(app)
      .post('/api/timers/recurring')
      .send({ company_id: companyId, pattern: 'daily', start_date: '2026-03-01' });
    expect(created.status).toBe(201);
    expect(created.body.active).toBe(true);

    const active = await request(app).get('/api/timers/recurring?active=true');
    expect(active.body).toHaveLength(1);

    const skipped = await request(app)
      .post(`/api/timers/recurring/${created.body.id}/skip`)
      .send({ date: '2026-03-15' });
    expect(skipped.body.skipped_dates).toEqual(['2026-03-15']);

    const unskipped = await request(app)
      .post(`/api/timers/recurring/${created.body.id}/unskip`)
      .send({ date: '2026-03-15' });
    expect(unskipped.body.skipped_dates).toEqual([]);

    const deleted = await request(app).delete(`/api/timers/recurring/${created.body.id}`);
    expect(deleted.status).toBe(204);
  });
});

describe('Notifications API', () => {
  beforeEach(() => { testDb = freshDb(); });

  it('create, fire, dismiss lifecycle', async () => {
    const app = createApp();

    const created = await request(app)
      .post('/api/notifications')
      .send({ type: 'cap_warning', title: 'Cap hit', trigger_at: '2026-03-26T15:00:00Z' });
    expect(created.status).toBe(201);
    expect(created.body.dismissed).toBe(false);

    const pending = await request(app).get('/api/notifications/pending');
    expect(pending.body).toHaveLength(1);

    const fired = await request(app).post(`/api/notifications/${created.body.id}/fire`);
    expect(fired.body.fired_at).toBeTruthy();

    const dismissed = await request(app).post(`/api/notifications/${created.body.id}/dismiss`);
    expect(dismissed.body.dismissed).toBe(true);
  });

  it('cancel unfired notification', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/notifications')
      .send({ type: 'reminder', title: 'Test', trigger_at: '2026-03-26T09:00:00Z' });

    const res = await request(app).delete(`/api/notifications/${created.body.id}`);
    expect(res.status).toBe(204);
  });
});

describe('Cap Status API', () => {
  beforeEach(() => { testDb = freshDb(); });

  it('returns cap status for projects with caps', async () => {
    const app = createApp();
    const co = await request(app).post('/api/companies').send({ name: 'Co' });

    await request(app).post('/api/projects').send({
      company_id: co.body.id,
      name: 'Capped',
      daily_cap_hrs: 8,
      weekly_cap_hrs: 40,
    });

    // Project without caps should not appear
    await request(app).post('/api/projects').send({
      company_id: co.body.id,
      name: 'Uncapped',
    });

    const res = await request(app).get('/api/cap-status');
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].project).toBe('Capped');
    expect(res.body.projects[0].daily.cap).toBe(8);
    expect(res.body.projects[0].weekly.cap).toBe(40);
  });
});

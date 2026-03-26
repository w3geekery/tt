import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../db/schema.js';
import * as companiesDb from '../db/companies.js';
import * as projectsDb from '../db/projects.js';
import * as tasksDb from '../db/tasks.js';
import * as timersDb from '../db/timers.js';
import { aggregateInvoice } from './aggregate.js';
import { renderInvoiceHtml } from './template.js';

// Mock getDb for API tests
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

const { default: request } = await import('supertest');
const { createApp } = await import('../server/index.js');

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

function seedData(db: Database.Database) {
  const co = companiesDb.create(db, { name: 'Client Co' });
  const proj = projectsDb.create(db, { company_id: co.id, name: 'Web App' });
  const task = tasksDb.create(db, { company_id: co.id, project_id: proj.id, name: 'Backend API', code: 'API-1' });

  timersDb.addEntry(db, {
    company_id: co.id,
    project_id: proj.id,
    task_id: task.id,
    started: '2026-03-15T09:00:00.000Z',
    ended: '2026-03-15T17:00:00.000Z',
    notes: 'Full day backend work',
  });
  timersDb.addEntry(db, {
    company_id: co.id,
    project_id: proj.id,
    started: '2026-03-16T09:00:00.000Z',
    ended: '2026-03-16T12:20:00.000Z',
    notes: 'Morning session',
  });

  return { company: co, project: proj, task };
}

describe('Invoice aggregation', () => {
  let db: Database.Database;

  beforeEach(() => { db = freshDb(); });

  it('aggregates timers with 15-minute rounding', () => {
    const { company, project } = seedData(db);
    const result = aggregateInvoice(db, company.id, '2026-03-15', '2026-03-16');

    expect(result).toBeTruthy();
    expect(result!.lineItems).toHaveLength(2);

    // 8h stays 8h (exact)
    expect(result!.lineItems[0].rounded_hrs).toBe(8);
    // 3h 20m → 3.5h (rounds up to next 15min)
    expect(result!.lineItems[1].rounded_hrs).toBe(3.5);

    expect(result!.roundedTotalHrs).toBe(11.5);
  });

  it('returns null for unknown company', () => {
    const result = aggregateInvoice(db, 'NOPE', '2026-03-15', '2026-03-16');
    expect(result).toBeNull();
  });

  it('filters by project', () => {
    const { company, project } = seedData(db);

    // Add a timer on a different project
    const proj2 = projectsDb.create(db, { company_id: company.id, name: 'Other' });
    timersDb.addEntry(db, {
      company_id: company.id,
      project_id: proj2.id,
      started: '2026-03-15T13:00:00.000Z',
      ended: '2026-03-15T14:00:00.000Z',
    });

    const result = aggregateInvoice(db, company.id, '2026-03-15', '2026-03-16', project.id);
    expect(result!.lineItems).toHaveLength(2); // Only Web App timers
  });
});

describe('Invoice HTML template', () => {
  it('renders an HTML invoice', () => {
    const db = freshDb();
    const { company } = seedData(db);
    const result = aggregateInvoice(db, company.id, '2026-03-15', '2026-03-16');
    const html = renderInvoiceHtml(result!);

    expect(html).toContain('Client Co');
    expect(html).toContain('11.50 hours');
    expect(html).toContain('Full day backend work');
  });
});

describe('Invoice API', () => {
  beforeEach(() => { testDb = freshDb(); });

  it('GET /api/invoices returns JSON invoice', async () => {
    const { company } = seedData(testDb);
    const res = await request(createApp())
      .get('/api/invoices')
      .query({ company_id: company.id, start: '2026-03-15', end: '2026-03-16' });

    expect(res.status).toBe(200);
    expect(res.body.lineItems).toHaveLength(2);
    expect(res.body.roundedTotalHrs).toBe(11.5);
  });

  it('GET /api/invoices?format=html returns HTML', async () => {
    const { company } = seedData(testDb);
    const res = await request(createApp())
      .get('/api/invoices')
      .query({ company_id: company.id, start: '2026-03-15', end: '2026-03-16', format: 'html' });

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('Client Co');
  });

  it('returns 400 if params missing', async () => {
    const res = await request(createApp()).get('/api/invoices');
    expect(res.status).toBe(400);
  });
});

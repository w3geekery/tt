import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as recurringDb from '../../db/recurring.js';
import * as companiesDb from '../../db/companies.js';
import * as projectsDb from '../../db/projects.js';
import * as tasksDb from '../../db/tasks.js';
import { broadcast } from '../sse.js';
import { materializeRecurring } from '../../cron/engine.js';

export const recurringRouter = Router();

// Helper to enrich recurring timer with joined data
function enrichRecurring(db: any, rec: any) {
  const company = rec.company_id ? companiesDb.findById(db, rec.company_id) : null;
  const project = rec.project_id ? projectsDb.findById(db, rec.project_id) : null;
  const task = rec.task_id ? tasksDb.findById(db, rec.task_id) : null;

  return {
    ...rec,
    company_name: company?.name ?? null,
    company_color: company?.color ?? null,
    project_name: project?.name ?? null,
    project_color: project?.color ?? null,
    task_name: task?.name ?? null,
    task_code: task?.code ?? null,
    task_url: task?.url ?? null,
  };
}

// GET /api/timers/recurring?active=true — get active recurring timers
recurringRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { active } = req.query;

  let recs;
  if (active === 'true') {
    recs = recurringDb.findActive(db);
  } else {
    recs = recurringDb.findAll(db);
  }

  const enriched = recs.map(r => enrichRecurring(db, r));
  res.json(enriched);
});

// POST /api/timers/recurring/materialize — trigger materialization now
recurringRouter.post('/materialize', (_req: Request, res: Response) => {
  const db = getDb();
  materializeRecurring(db);
  // Return today's timers so caller can see what was materialized
  const todayPT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const timers = db.prepare(
    `SELECT * FROM timers WHERE substr(created_at, 1, 10) = ? AND recurring_id IS NOT NULL ORDER BY created_at`,
  ).all(todayPT);
  res.json(timers);
});

// POST /api/timers/recurring — create recurring timer
recurringRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const rec = recurringDb.create(db, req.body);
  const enriched = enrichRecurring(db, rec);
  broadcast('timer-updated', { type: 'timer-updated', data: enriched });
  res.status(201).json(enriched);
});

// GET /api/timers/recurring/:id
recurringRouter.get('/:id', (req: Request, res: Response) => {
  const rec = recurringDb.findById(getDb(), req.params.id as string);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  res.json(enrichRecurring(getDb(), rec));
});

// PATCH /api/timers/recurring/:id — update recurring timer
recurringRouter.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const rec = recurringDb.update(db, req.params.id as string, req.body);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  const enriched = enrichRecurring(db, rec);
  broadcast('timer-updated', { type: 'timer-updated', data: enriched });
  res.json(enriched);
});

// DELETE /api/timers/recurring/:id
recurringRouter.delete('/:id', (req: Request, res: Response) => {
  if (!recurringDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Recurring timer not found' }); return;
  }
  broadcast('timer-updated', { type: 'timer-updated', data: { id: req.params.id } });
  res.status(204).end();
});

// POST /api/timers/recurring/:id/skip — skip a recurring timer date
recurringRouter.post('/:id/skip', (req: Request, res: Response) => {
  const { date } = req.body;
  if (!date) { res.status(400).json({ error: 'date is required' }); return; }
  const rec = recurringDb.skipDate(getDb(), req.params.id as string, date);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  const enriched = enrichRecurring(getDb(), rec);
  broadcast('timer-updated', { type: 'timer-updated', data: enriched });
  res.json(enriched);
});

// POST /api/timers/recurring/:id/unskip — unskip a recurring timer date
recurringRouter.post('/:id/unskip', (req: Request, res: Response) => {
  const { date } = req.body;
  if (!date) { res.status(400).json({ error: 'date is required' }); return; }
  const rec = recurringDb.unskipDate(getDb(), req.params.id as string, date);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  const enriched = enrichRecurring(getDb(), rec);
  broadcast('timer-updated', { type: 'timer-updated', data: enriched });
  res.json(enriched);
});

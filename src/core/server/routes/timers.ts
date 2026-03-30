import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as timersDb from '../../db/timers.js';
import * as companiesDb from '../../db/companies.js';
import * as projectsDb from '../../db/projects.js';
import * as tasksDb from '../../db/tasks.js';
import { runHook } from '../../extensions.js';
import { broadcast } from '../sse.js';

export const timersRouter = Router();

// Helper to enrich timer with joined data
function enrichTimer(db: any, timer: any) {
  const company = timer.company_id ? companiesDb.findById(db, timer.company_id) : null;
  const project = timer.project_id ? projectsDb.findById(db, timer.project_id) : null;
  const task = timer.task_id ? tasksDb.findById(db, timer.task_id) : null;
  const segments = timersDb.getSegments(db, timer.id);

  return {
    ...timer,
    user_id: 'local',
    company_name: company?.name ?? null,
    company_color: company?.color ?? null,
    project_name: project?.name ?? null,
    project_color: project?.color ?? null,
    task_name: task?.name ?? null,
    task_code: task?.code ?? null,
    task_url: task?.url ?? null,
    segments,
  };
}

// GET /api/timers — list timers with optional filters
// Supports: ?date=YYYY-MM-DD, ?from=X&to=Y&company_id=Z, ?task_id=X&limit=N&offset=M
timersRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { date, from, to, company_id, task_id, limit, offset } = req.query;

  let timers: any[];

  if (date) {
    // Filter by single date
    timers = timersDb.findByDate(db, date as string);
  } else if (from && to) {
    // Range query — get all timers and filter in code
    timers = timersDb.findAll(db);
    const fromDate = new Date(from as string).getTime();
    const toDate = new Date(to as string).getTime();
    timers = timers.filter(t => {
      const startTime = t.started ? new Date(t.started).getTime() : 0;
      return startTime >= fromDate && startTime <= toDate;
    });

    // Apply company_id filter if provided
    if (company_id) {
      timers = timers.filter(t => t.company_id === company_id);
    }
  } else if (task_id) {
    // Filter by task_id with pagination
    timers = timersDb.findAll(db);
    timers = timers.filter(t => t.task_id === task_id);

    // Apply pagination
    const pageLimit = limit ? parseInt(limit as string, 10) : 50;
    const pageOffset = offset ? parseInt(offset as string, 10) : 0;
    timers = timers.slice(pageOffset, pageOffset + pageLimit);
  } else {
    // Return all timers
    timers = timersDb.findAll(db);
  }

  const enriched = timers.map(t => enrichTimer(db, t));
  res.json(enriched);
});

// GET /api/timers/running — get currently running timer
timersRouter.get('/running', (_req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.findRunning(db);
  if (!timer) {
    res.json(null);
    return;
  }
  res.json(enrichTimer(db, timer));
});

// GET /api/timers/templates?limit=N — most-used company/project/task combos
timersRouter.get('/templates', (req: Request, res: Response) => {
  const db = getDb();
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
  const rows = db.prepare(`
    SELECT
      t.company_id, c.name as company_name, c.color as company_color,
      t.project_id, p.name as project_name, p.color as project_color,
      t.task_id, tk.name as task_name, tk.code as task_code,
      COUNT(*) as usage_count,
      MAX(t.started) as last_used
    FROM timers t
    JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks tk ON tk.id = t.task_id
    GROUP BY t.company_id, t.project_id, t.task_id
    ORDER BY usage_count DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

// GET /api/timers/scheduled — get scheduled timers
timersRouter.get('/scheduled', (_req: Request, res: Response) => {
  // Return empty array — no scheduled timers in this version
  res.json([]);
});

// GET /api/timers/:id — get timer by id
timersRouter.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.findById(db, req.params.id as string);
  if (!timer) { res.status(404).json({ error: 'Timer not found' }); return; }
  res.json(enrichTimer(db, timer));
});

// POST /api/timers — create a new timer
timersRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.create(db, req.body);
  const enriched = enrichTimer(db, timer);
  broadcast('timer-updated', { type: 'timer-updated', data: enriched });
  res.status(201).json(enriched);
});

// PATCH /api/timers/:id — update timer
timersRouter.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.update(db, req.params.id as string, req.body);
  if (!timer) { res.status(404).json({ error: 'Timer not found' }); return; }
  const enriched = enrichTimer(db, timer);
  broadcast('timer-updated', { type: 'timer-updated', data: enriched });
  res.json(enriched);
});

// DELETE /api/timers/:id
timersRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  if (!timersDb.remove(db, req.params.id as string)) {
    res.status(404).json({ error: 'Timer not found' }); return;
  }
  broadcast('timer-updated', { type: 'timer-updated', data: { id: req.params.id } });
  res.status(204).end();
});

// POST /api/timers/:id/stop — stop a timer
timersRouter.post('/:id/stop', async (req: Request, res: Response) => {
  const db = getDb();
  try {
    const timer = timersDb.stop(db, req.params.id as string);
    const enriched = enrichTimer(db, timer);
    broadcast('timer-updated', { type: 'timer-updated', data: enriched });
    await runHook('onTimerStop', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/timers/:id/pause — pause a timer
timersRouter.post('/:id/pause', async (req: Request, res: Response) => {
  const db = getDb();
  try {
    const timer = timersDb.pause(db, req.params.id as string);
    const enriched = enrichTimer(db, timer);
    broadcast('timer-updated', { type: 'timer-updated', data: enriched });
    await runHook('onTimerPause', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/timers/:id/resume — resume a paused timer
timersRouter.post('/:id/resume', async (req: Request, res: Response) => {
  const db = getDb();
  try {
    const timer = timersDb.resume(db, req.params.id as string);
    const enriched = enrichTimer(db, timer);
    broadcast('timer-updated', { type: 'timer-updated', data: enriched });
    await runHook('onTimerResume', enriched);
    res.json(enriched);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/timers/start-scheduled — start scheduled timers
timersRouter.post('/start-scheduled', (_req: Request, res: Response) => {
  // Return empty array
  res.json([]);
});

// PATCH /api/timers/:timerId/segments/:segmentId — update segment notes
timersRouter.patch('/:timerId/segments/:segmentId', (req: Request, res: Response) => {
  const db = getDb();
  const { notes } = req.body;

  const segment = timersDb.updateSegmentNotes(db, req.params.segmentId as string, notes ?? null);
  if (!segment) {
    res.status(404).json({ error: 'Segment not found' });
    return;
  }

  res.json(segment);
});

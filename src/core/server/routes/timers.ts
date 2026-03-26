import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as timersDb from '../../db/timers.js';
import { runHook } from '../../extensions.js';
import { broadcast } from '../sse.js';

export const timersRouter = Router();

// GET /api/timers — list all timers
timersRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  res.json(timersDb.findAll(db));
});

// GET /api/timers/running — get currently running timer
timersRouter.get('/running', (_req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.findRunning(db);
  res.json(timer ?? null);
});

// GET /api/timers/date/:date — timers for a specific date
timersRouter.get('/date/:date', (req: Request, res: Response) => {
  const db = getDb();
  res.json(timersDb.findByDate(db, req.params.date as string));
});

// GET /api/timers/slug/:slug — find by slug
timersRouter.get('/slug/:slug', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.findBySlug(db, req.params.slug as string);
  if (!timer) { res.status(404).json({ error: 'Timer not found' }); return; }
  res.json(timer);
});

// GET /api/timers/:id — get by id
timersRouter.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.findById(db, req.params.id as string);
  if (!timer) { res.status(404).json({ error: 'Timer not found' }); return; }
  res.json(timer);
});

// GET /api/timers/:id/segments — get segments for a timer
timersRouter.get('/:id/segments', (req: Request, res: Response) => {
  const db = getDb();
  res.json(timersDb.getSegments(db, req.params.id as string));
});

// POST /api/timers — create a new timer
timersRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.create(db, req.body);
  broadcast('timer:created', timer);
  res.status(201).json(timer);
});

// POST /api/timers/entry — add a manual time entry
timersRouter.post('/entry', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.addEntry(db, req.body);
  broadcast('timer:created', timer);
  res.status(201).json(timer);
});

// PUT /api/timers/:id — update timer
timersRouter.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const timer = timersDb.update(db, req.params.id as string, req.body);
  if (!timer) { res.status(404).json({ error: 'Timer not found' }); return; }
  broadcast('timer:updated', timer);
  res.json(timer);
});

// DELETE /api/timers/:id
timersRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  if (!timersDb.remove(db, req.params.id as string)) {
    res.status(404).json({ error: 'Timer not found' }); return;
  }
  broadcast('timer:deleted', { id: req.params.id });
  res.status(204).end();
});

// POST /api/timers/:id/start
timersRouter.post('/:id/start', async (req: Request, res: Response) => {
  const db = getDb();
  try {
    const timer = timersDb.start(db, req.params.id as string);
    broadcast('timer:started', timer);
    await runHook('onTimerStart', timer);
    res.json(timer);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/timers/:id/stop
timersRouter.post('/:id/stop', async (req: Request, res: Response) => {
  const db = getDb();
  try {
    const timer = timersDb.stop(db, req.params.id as string);
    broadcast('timer:stopped', timer);
    await runHook('onTimerStop', timer);
    res.json(timer);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/timers/:id/pause
timersRouter.post('/:id/pause', async (req: Request, res: Response) => {
  const db = getDb();
  try {
    const timer = timersDb.pause(db, req.params.id as string);
    broadcast('timer:paused', timer);
    await runHook('onTimerPause', timer);
    res.json(timer);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/timers/:id/resume
timersRouter.post('/:id/resume', async (req: Request, res: Response) => {
  const db = getDb();
  try {
    const timer = timersDb.resume(db, req.params.id as string);
    broadcast('timer:resumed', timer);
    await runHook('onTimerResume', timer);
    res.json(timer);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

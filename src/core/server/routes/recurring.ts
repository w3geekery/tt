import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as recurringDb from '../../db/recurring.js';
import { broadcast } from '../sse.js';

export const recurringRouter = Router();

recurringRouter.get('/', (_req: Request, res: Response) => {
  res.json(recurringDb.findAll(getDb()));
});

recurringRouter.get('/active', (_req: Request, res: Response) => {
  res.json(recurringDb.findActive(getDb()));
});

recurringRouter.get('/:id', (req: Request, res: Response) => {
  const rec = recurringDb.findById(getDb(), req.params.id as string);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  res.json(rec);
});

recurringRouter.post('/', (req: Request, res: Response) => {
  const rec = recurringDb.create(getDb(), req.body);
  broadcast('recurring:created', rec);
  res.status(201).json(rec);
});

recurringRouter.put('/:id', (req: Request, res: Response) => {
  const rec = recurringDb.update(getDb(), req.params.id as string, req.body);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  broadcast('recurring:updated', rec);
  res.json(rec);
});

recurringRouter.delete('/:id', (req: Request, res: Response) => {
  if (!recurringDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Recurring timer not found' }); return;
  }
  broadcast('recurring:deleted', { id: req.params.id });
  res.status(204).end();
});

recurringRouter.post('/:id/skip', (req: Request, res: Response) => {
  const { date } = req.body;
  if (!date) { res.status(400).json({ error: 'date is required' }); return; }
  const rec = recurringDb.skipDate(getDb(), req.params.id as string, date);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  broadcast('recurring:updated', rec);
  res.json(rec);
});

recurringRouter.post('/:id/unskip', (req: Request, res: Response) => {
  const { date } = req.body;
  if (!date) { res.status(400).json({ error: 'date is required' }); return; }
  const rec = recurringDb.unskipDate(getDb(), req.params.id as string, date);
  if (!rec) { res.status(404).json({ error: 'Recurring timer not found' }); return; }
  broadcast('recurring:updated', rec);
  res.json(rec);
});

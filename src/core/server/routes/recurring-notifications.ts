import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as recurringNotificationsDb from '../../db/recurring-notifications.js';
import { broadcast } from '../sse.js';
import { materializeRecurringNotifications } from '../../cron/engine.js';

export const recurringNotificationsRouter = Router();

// GET /api/notifications/recurring?active=true
recurringNotificationsRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const list = req.query.active === 'true'
    ? recurringNotificationsDb.findActive(db)
    : recurringNotificationsDb.findAll(db);
  res.json(list);
});

// POST /api/notifications/recurring/materialize — run materialization now
recurringNotificationsRouter.post('/materialize', (_req: Request, res: Response) => {
  const db = getDb();
  materializeRecurringNotifications(db);
  res.json({ ok: true });
});

// POST /api/notifications/recurring — create
recurringNotificationsRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  if (req.body?.pattern === 'weekly' && !(req.body?.weekdays?.length)) {
    res.status(400).json({ error: 'pattern "weekly" requires at least one weekday (0=Sun..6=Sat)' });
    return;
  }
  const rec = recurringNotificationsDb.create(db, req.body);
  broadcast('notification:recurring-updated', rec);
  res.status(201).json(rec);
});

// GET /api/notifications/recurring/:id
recurringNotificationsRouter.get('/:id', (req: Request, res: Response) => {
  const rec = recurringNotificationsDb.findById(getDb(), req.params.id as string);
  if (!rec) { res.status(404).json({ error: 'Recurring notification not found' }); return; }
  res.json(rec);
});

// PATCH /api/notifications/recurring/:id
recurringNotificationsRouter.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const rec = recurringNotificationsDb.update(db, req.params.id as string, req.body);
  if (!rec) { res.status(404).json({ error: 'Recurring notification not found' }); return; }
  broadcast('notification:recurring-updated', rec);
  res.json(rec);
});

// DELETE /api/notifications/recurring/:id
recurringNotificationsRouter.delete('/:id', (req: Request, res: Response) => {
  if (!recurringNotificationsDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Recurring notification not found' }); return;
  }
  broadcast('notification:recurring-updated', { id: req.params.id, deleted: true });
  res.status(204).end();
});

// POST /api/notifications/recurring/:id/skip { date }
recurringNotificationsRouter.post('/:id/skip', (req: Request, res: Response) => {
  const { date } = req.body;
  if (!date) { res.status(400).json({ error: 'date is required' }); return; }
  const rec = recurringNotificationsDb.skipDate(getDb(), req.params.id as string, date);
  if (!rec) { res.status(404).json({ error: 'Recurring notification not found' }); return; }
  broadcast('notification:recurring-updated', rec);
  res.json(rec);
});

// POST /api/notifications/recurring/:id/unskip { date }
recurringNotificationsRouter.post('/:id/unskip', (req: Request, res: Response) => {
  const { date } = req.body;
  if (!date) { res.status(400).json({ error: 'date is required' }); return; }
  const rec = recurringNotificationsDb.unskipDate(getDb(), req.params.id as string, date);
  if (!rec) { res.status(404).json({ error: 'Recurring notification not found' }); return; }
  broadcast('notification:recurring-updated', rec);
  res.json(rec);
});

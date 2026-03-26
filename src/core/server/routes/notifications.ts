import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as notificationsDb from '../../db/notifications.js';
import { broadcast } from '../sse.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', (_req: Request, res: Response) => {
  res.json(notificationsDb.findAll(getDb()));
});

notificationsRouter.get('/pending', (_req: Request, res: Response) => {
  res.json(notificationsDb.findPending(getDb()));
});

notificationsRouter.get('/:id', (req: Request, res: Response) => {
  const n = notificationsDb.findById(getDb(), req.params.id as string);
  if (!n) { res.status(404).json({ error: 'Notification not found' }); return; }
  res.json(n);
});

notificationsRouter.post('/', (req: Request, res: Response) => {
  const n = notificationsDb.create(getDb(), req.body);
  broadcast('notification:created', n);
  res.status(201).json(n);
});

notificationsRouter.post('/:id/fire', (req: Request, res: Response) => {
  const n = notificationsDb.markFired(getDb(), req.params.id as string);
  if (!n) { res.status(404).json({ error: 'Notification not found' }); return; }
  broadcast('notification:fired', n);
  res.json(n);
});

notificationsRouter.post('/:id/dismiss', (req: Request, res: Response) => {
  const n = notificationsDb.dismiss(getDb(), req.params.id as string);
  if (!n) { res.status(404).json({ error: 'Notification not found' }); return; }
  broadcast('notification:dismissed', n);
  res.json(n);
});

notificationsRouter.delete('/:id', (req: Request, res: Response) => {
  if (!notificationsDb.cancel(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Notification not found or already fired' }); return;
  }
  broadcast('notification:cancelled', { id: req.params.id });
  res.status(204).end();
});

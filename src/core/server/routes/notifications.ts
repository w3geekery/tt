import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as notificationsDb from '../../db/notifications.js';
import { broadcast } from '../sse.js';

export const notificationsRouter = Router();

// GET /api/notifications?date=X&from=X&to=X&status=X
notificationsRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { date, from, to, status } = req.query;

  let notifications = notificationsDb.findAll(db);

  // Filter by single date
  if (date) {
    const dateStr = date as string;
    notifications = notifications.filter(n => {
      const nDate = new Date(n.trigger_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      return nDate === dateStr;
    });
  }

  // Filter by date range
  if (from && to) {
    const fromTime = new Date(from as string).getTime();
    const toTime = new Date(to as string).getTime();
    notifications = notifications.filter(n => {
      const nTime = new Date(n.trigger_at).getTime();
      return nTime >= fromTime && nTime <= toTime;
    });
  }

  // Filter by status
  if (status === 'pending') {
    notifications = notifications.filter(n => !n.fired_at && !n.dismissed);
  } else if (status === 'fired') {
    notifications = notifications.filter(n => n.fired_at !== null);
  } else if (status === 'dismissed') {
    notifications = notifications.filter(n => n.dismissed);
  }

  res.json(notifications);
});

// GET /api/notifications/:id
notificationsRouter.get('/:id', (req: Request, res: Response) => {
  const n = notificationsDb.findById(getDb(), req.params.id as string);
  if (!n) { res.status(404).json({ error: 'Notification not found' }); return; }
  res.json(n);
});

// POST /api/notifications — create notification
notificationsRouter.post('/', (req: Request, res: Response) => {
  const n = notificationsDb.create(getDb(), req.body);
  broadcast('timer-updated', { type: 'timer-updated', data: n });
  res.status(201).json(n);
});

// PATCH /api/notifications/:id — update notification (mark as fired or dismissed)
notificationsRouter.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { fired_at, dismissed } = req.body;

  let n;
  if (fired_at) {
    n = notificationsDb.markFired(db, req.params.id as string);
  } else if (dismissed) {
    n = notificationsDb.dismiss(db, req.params.id as string);
  } else {
    n = notificationsDb.findById(db, req.params.id as string);
  }

  if (!n) { res.status(404).json({ error: 'Notification not found' }); return; }
  broadcast('timer-updated', { type: 'timer-updated', data: n });
  res.json(n);
});

// DELETE /api/notifications/:id — cancel notification
notificationsRouter.delete('/:id', (req: Request, res: Response) => {
  if (!notificationsDb.cancel(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Notification not found or already fired' }); return;
  }
  broadcast('timer-updated', { type: 'timer-updated', data: { id: req.params.id } });
  res.status(204).end();
});

// GET /api/notifications/settings — get user notification settings
notificationsRouter.get('/settings', (_req: Request, res: Response) => {
  // Return default settings — no user-specific settings yet
  res.json({
    id: 'local',
    notify_on_cap: true,
    notify_on_timer_start: false,
    notify_on_timer_stop: false,
  });
});

// PATCH /api/notifications/settings — update user notification settings
notificationsRouter.patch('/settings', (req: Request, res: Response) => {
  // Accept but don't persist — local-first, stateless
  res.json({
    id: 'local',
    ...req.body,
  });
});

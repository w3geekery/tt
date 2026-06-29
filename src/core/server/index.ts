/**
 * Express server entry point.
 *
 * Serves the API routes on port 4301.
 * SSE broadcasts for real-time UI updates.
 * Extension hooks called at timer lifecycle points.
 */

import express from 'express';
import type { Request, Response } from 'express';
import config from '../../../tt.config.js';
import { getDb } from '../db/connection.js';
import { loadExtensions } from '../extensions.js';
import * as weeklyTasksDb from '../db/weekly-tasks.js';
import { sseHandler } from './sse.js';
import { timersRouter } from './routes/timers.js';
import { companiesRouter } from './routes/companies.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { capStatusRouter } from './routes/cap-status.js';
import { notificationsRouter } from './routes/notifications.js';
import { recurringNotificationsRouter } from './routes/recurring-notifications.js';
import { recurringRouter } from './routes/recurring.js';
import { invoicesRouter } from './routes/invoices.js';
import { autocapRouter } from './routes/autocap.js';
import { templatesRouter } from './routes/templates.js';
import { favoritesRouter } from './routes/favorites.js';
import { stickiesRouter } from './routes/stickies.js';
import { startCron } from '../cron/engine.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  // Auth stub — GET /api/auth/me
  app.get('/api/auth/me', (_req: Request, res: Response) => {
    res.json({
      id: 'local',
      username: 'clark',
      avatar_url: null,
    });
  });

  // API routes — recurring BEFORE timers (so /api/timers/recurring doesn't match /:id)
  app.use('/api/timers/recurring', recurringRouter);
  app.use('/api/timers', timersRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/cap-status', capStatusRouter);
  // recurring BEFORE notifications (so /api/notifications/recurring doesn't match /:id)
  app.use('/api/notifications/recurring', recurringNotificationsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/autocap', autocapRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/favorites', favoritesRouter);
  app.use('/api/stickies', stickiesRouter);
  // Weekly tasks
  app.get('/api/weekly-tasks', (req: Request, res: Response) => {
    const db = getDb(config.db);
    let weekStart = req.query.week_start as string | undefined;
    if (!weekStart) {
      const ptDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      const d = new Date(ptDate + 'T12:00:00');
      const day = d.getDay();
      d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
      weekStart = d.toISOString().slice(0, 10);
    }
    res.json(weeklyTasksDb.findByWeek(db, weekStart));
  });
  app.post('/api/weekly-tasks', (req: Request, res: Response) => {
    const db = getDb(config.db);
    const body = req.body as Partial<weeklyTasksDb.WeeklyTask>;
    if (!body.week_start || !body.company || !body.zb_task_id) {
      return res.status(400).json({ error: 'week_start, company, and zb_task_id are required' });
    }
    let period_start = body.period_start;
    if (!period_start) {
      if (weeklyTasksDb.isSplitWeek(body.week_start)) {
        return res.status(400).json({ error: `Week of ${body.week_start} is a split week; period_start is required (YYYY-MM-01 or YYYY-MM-16)` });
      }
      period_start = weeklyTasksDb.derivePeriodStart(body.week_start);
    }
    const task: weeklyTasksDb.WeeklyTask = {
      week_start: body.week_start,
      company: body.company,
      period_start,
      zb_task_id: body.zb_task_id,
      zb_task_code: body.zb_task_code ?? null,
      zb_task_name: body.zb_task_name ?? null,
    };
    weeklyTasksDb.upsert(db, task);
    res.status(201).json(task);
  });

  app.get('/api/sse', sseHandler);

  return app;
}

// Start server when run directly
const isDirectRun = process.argv[1]?.includes('server');
if (isDirectRun) {
  // Initialize DB, extensions, and cron
  const db = getDb(config.db);
  loadExtensions(config.extensions);

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`tt running on http://localhost:${config.port}`);
    startCron(db);
  });
}

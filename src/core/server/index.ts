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
import { recurringRouter } from './routes/recurring.js';
import { invoicesRouter } from './routes/invoices.js';
import { autocapRouter } from './routes/autocap.js';
import { templatesRouter } from './routes/templates.js';
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
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/autocap', autocapRouter);
  app.use('/api/templates', templatesRouter);
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
    weeklyTasksDb.upsert(db, req.body);
    res.status(201).json(req.body);
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

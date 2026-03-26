/**
 * Express server entry point.
 *
 * Serves the API routes on port 4301.
 * SSE broadcasts for real-time UI updates.
 * Extension hooks called at timer lifecycle points.
 */

import express from 'express';
import config from '../../../tt.config.js';
import { getDb } from '../db/connection.js';
import { loadExtensions } from '../extensions.js';
import { sseHandler } from './sse.js';
import { timersRouter } from './routes/timers.js';
import { companiesRouter } from './routes/companies.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { capStatusRouter } from './routes/cap-status.js';
import { notificationsRouter } from './routes/notifications.js';
import { recurringRouter } from './routes/recurring.js';
import { invoicesRouter } from './routes/invoices.js';
import { startCron } from '../cron/engine.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  // API routes
  app.use('/api/timers', timersRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/cap-status', capStatusRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/recurring', recurringRouter);
  app.use('/api/invoices', invoicesRouter);
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

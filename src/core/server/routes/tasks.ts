import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as tasksDb from '../../db/tasks.js';
import { broadcast } from '../sse.js';

export const tasksRouter = Router();

// GET /api/tasks?project_id=X — list tasks with optional project_id filter
tasksRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { project_id } = req.query;

  let tasks;
  if (project_id) {
    tasks = tasksDb.findByProject(db, project_id as string);
  } else {
    tasks = tasksDb.findAll(db);
  }

  res.json(tasks);
});

// GET /api/tasks/:id
tasksRouter.get('/:id', (req: Request, res: Response) => {
  const task = tasksDb.findById(getDb(), req.params.id as string);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json(task);
});

// POST /api/tasks — create task
tasksRouter.post('/', (req: Request, res: Response) => {
  const task = tasksDb.create(getDb(), req.body);
  broadcast('timer-updated', { type: 'timer-updated', data: task });
  res.status(201).json(task);
});

// PATCH /api/tasks/:id — update task
tasksRouter.patch('/:id', (req: Request, res: Response) => {
  const task = tasksDb.update(getDb(), req.params.id as string, req.body);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  broadcast('timer-updated', { type: 'timer-updated', data: task });
  res.json(task);
});

// DELETE /api/tasks/:id
tasksRouter.delete('/:id', (req: Request, res: Response) => {
  if (!tasksDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Task not found' }); return;
  }
  broadcast('timer-updated', { type: 'timer-updated', data: { id: req.params.id } });
  res.status(204).end();
});

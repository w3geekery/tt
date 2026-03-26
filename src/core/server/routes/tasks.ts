import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as tasksDb from '../../db/tasks.js';
import { broadcast } from '../sse.js';

export const tasksRouter = Router();

tasksRouter.get('/', (_req: Request, res: Response) => {
  res.json(tasksDb.findAll(getDb()));
});

tasksRouter.get('/company/:companyId', (req: Request, res: Response) => {
  res.json(tasksDb.findByCompany(getDb(), req.params.companyId as string));
});

tasksRouter.get('/project/:projectId', (req: Request, res: Response) => {
  res.json(tasksDb.findByProject(getDb(), req.params.projectId as string));
});

tasksRouter.get('/:id', (req: Request, res: Response) => {
  const task = tasksDb.findById(getDb(), req.params.id as string);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json(task);
});

tasksRouter.post('/', (req: Request, res: Response) => {
  const task = tasksDb.create(getDb(), req.body);
  broadcast('task:created', task);
  res.status(201).json(task);
});

tasksRouter.put('/:id', (req: Request, res: Response) => {
  const task = tasksDb.update(getDb(), req.params.id as string, req.body);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  broadcast('task:updated', task);
  res.json(task);
});

tasksRouter.delete('/:id', (req: Request, res: Response) => {
  if (!tasksDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Task not found' }); return;
  }
  broadcast('task:deleted', { id: req.params.id });
  res.status(204).end();
});

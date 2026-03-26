import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as projectsDb from '../../db/projects.js';
import { broadcast } from '../sse.js';

export const projectsRouter = Router();

projectsRouter.get('/', (_req: Request, res: Response) => {
  res.json(projectsDb.findAll(getDb()));
});

projectsRouter.get('/company/:companyId', (req: Request, res: Response) => {
  res.json(projectsDb.findByCompany(getDb(), req.params.companyId as string));
});

projectsRouter.get('/:id', (req: Request, res: Response) => {
  const proj = projectsDb.findById(getDb(), req.params.id as string);
  if (!proj) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json(proj);
});

projectsRouter.post('/', (req: Request, res: Response) => {
  const proj = projectsDb.create(getDb(), req.body);
  broadcast('project:created', proj);
  res.status(201).json(proj);
});

projectsRouter.put('/:id', (req: Request, res: Response) => {
  const proj = projectsDb.update(getDb(), req.params.id as string, req.body);
  if (!proj) { res.status(404).json({ error: 'Project not found' }); return; }
  broadcast('project:updated', proj);
  res.json(proj);
});

projectsRouter.delete('/:id', (req: Request, res: Response) => {
  if (!projectsDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Project not found' }); return;
  }
  broadcast('project:deleted', { id: req.params.id });
  res.status(204).end();
});

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as projectsDb from '../../db/projects.js';
import { broadcast } from '../sse.js';

export const projectsRouter = Router();

// GET /api/projects?company_id=X — list projects with optional company_id filter
projectsRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { company_id } = req.query;

  let projects;
  if (company_id) {
    projects = projectsDb.findByCompany(db, company_id as string);
  } else {
    projects = projectsDb.findAll(db);
  }

  res.json(projects);
});

// GET /api/projects/:id
projectsRouter.get('/:id', (req: Request, res: Response) => {
  const proj = projectsDb.findById(getDb(), req.params.id as string);
  if (!proj) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json(proj);
});

// POST /api/projects — create project
projectsRouter.post('/', (req: Request, res: Response) => {
  const proj = projectsDb.create(getDb(), req.body);
  broadcast('timer-updated', { type: 'timer-updated', data: proj });
  res.status(201).json(proj);
});

// PATCH /api/projects/:id — update project
projectsRouter.patch('/:id', (req: Request, res: Response) => {
  const proj = projectsDb.update(getDb(), req.params.id as string, req.body);
  if (!proj) { res.status(404).json({ error: 'Project not found' }); return; }
  broadcast('timer-updated', { type: 'timer-updated', data: proj });
  res.json(proj);
});

// DELETE /api/projects/:id
projectsRouter.delete('/:id', (req: Request, res: Response) => {
  if (!projectsDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Project not found' }); return;
  }
  broadcast('timer-updated', { type: 'timer-updated', data: { id: req.params.id } });
  res.status(204).end();
});

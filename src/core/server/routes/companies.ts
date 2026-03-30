import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as companiesDb from '../../db/companies.js';
import { broadcast } from '../sse.js';

export const companiesRouter = Router();

// GET /api/companies — list all companies
companiesRouter.get('/', (_req: Request, res: Response) => {
  const companies = companiesDb.findAll(getDb());
  // Add user_id field set to 'local' for each company
  const withUserId = companies.map(co => ({ ...co, user_id: 'local' }));
  res.json(withUserId);
});

// GET /api/companies/:id
companiesRouter.get('/:id', (req: Request, res: Response) => {
  const co = companiesDb.findById(getDb(), req.params.id as string);
  if (!co) { res.status(404).json({ error: 'Company not found' }); return; }
  res.json({ ...co, user_id: 'local' });
});

// POST /api/companies — create company
companiesRouter.post('/', (req: Request, res: Response) => {
  const co = companiesDb.create(getDb(), req.body);
  broadcast('timer-updated', { type: 'timer-updated', data: co });
  res.status(201).json({ ...co, user_id: 'local' });
});

// PATCH /api/companies/:id — update company
companiesRouter.patch('/:id', (req: Request, res: Response) => {
  const co = companiesDb.update(getDb(), req.params.id as string, req.body);
  if (!co) { res.status(404).json({ error: 'Company not found' }); return; }
  broadcast('timer-updated', { type: 'timer-updated', data: co });
  res.json({ ...co, user_id: 'local' });
});

// DELETE /api/companies/:id
companiesRouter.delete('/:id', (req: Request, res: Response) => {
  if (!companiesDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Company not found' }); return;
  }
  broadcast('timer-updated', { type: 'timer-updated', data: { id: req.params.id } });
  res.status(204).end();
});

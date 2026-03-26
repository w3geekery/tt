import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as companiesDb from '../../db/companies.js';
import { broadcast } from '../sse.js';

export const companiesRouter = Router();

companiesRouter.get('/', (_req: Request, res: Response) => {
  res.json(companiesDb.findAll(getDb()));
});

companiesRouter.get('/:id', (req: Request, res: Response) => {
  const co = companiesDb.findById(getDb(), req.params.id as string);
  if (!co) { res.status(404).json({ error: 'Company not found' }); return; }
  res.json(co);
});

companiesRouter.post('/', (req: Request, res: Response) => {
  const co = companiesDb.create(getDb(), req.body);
  broadcast('company:created', co);
  res.status(201).json(co);
});

companiesRouter.put('/:id', (req: Request, res: Response) => {
  const co = companiesDb.update(getDb(), req.params.id as string, req.body);
  if (!co) { res.status(404).json({ error: 'Company not found' }); return; }
  broadcast('company:updated', co);
  res.json(co);
});

companiesRouter.delete('/:id', (req: Request, res: Response) => {
  if (!companiesDb.remove(getDb(), req.params.id as string)) {
    res.status(404).json({ error: 'Company not found' }); return;
  }
  broadcast('company:deleted', { id: req.params.id });
  res.status(204).end();
});

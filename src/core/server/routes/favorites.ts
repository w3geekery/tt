import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as favoritesDb from '../../db/favorites.js';

export const favoritesRouter = Router();

// GET /api/favorites — list all favorites with joined names
favoritesRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  res.json(favoritesDb.findAll(db));
});

// POST /api/favorites — create a favorite template
favoritesRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const { company_id, project_id, task_id } = req.body;
  if (!company_id) {
    res.status(400).json({ error: 'company_id is required' });
    return;
  }
  const existing = favoritesDb.findByTemplate(db, company_id, project_id, task_id);
  if (existing) {
    res.status(409).json({ error: 'Favorite already exists', favorite: existing });
    return;
  }
  const fav = favoritesDb.create(db, { company_id, project_id, task_id });
  res.status(201).json(fav);
});

// DELETE /api/favorites/:id — remove a favorite
favoritesRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const ok = favoritesDb.remove(db, req.params.id as string);
  if (!ok) {
    res.status(404).json({ error: 'Favorite not found' });
    return;
  }
  res.json({ ok: true });
});

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import { getAutocapStatus } from '../../cron/engine.js';

export const autocapRouter = Router();

// GET /api/autocap — get current autocap status
autocapRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const status = getAutocapStatus(db);
  res.json(status);
});

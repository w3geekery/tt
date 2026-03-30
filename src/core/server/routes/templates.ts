import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';

export const templatesRouter = Router();

// GET /api/templates — most-used company/project/task combinations
templatesRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      t.company_id, c.name as company_name, c.color as company_color,
      t.project_id, p.name as project_name, p.color as project_color,
      t.task_id, tk.name as task_name,
      COUNT(*) as usage_count
    FROM timers t
    JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks tk ON tk.id = t.task_id
    GROUP BY t.company_id, t.project_id, t.task_id
    ORDER BY usage_count DESC
    LIMIT 10
  `).all();

  res.json(rows);
});

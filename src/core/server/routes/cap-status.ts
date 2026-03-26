import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';

export const capStatusRouter = Router();

interface CapStatusRow {
  project_id: string;
  project_name: string;
  company_id: string;
  company_name: string;
  daily_cap_hrs: number | null;
  weekly_cap_hrs: number | null;
  daily_used_hrs: number;
  weekly_used_hrs: number;
}

export interface CapStatus {
  project_id: string;
  project_name: string;
  company_id: string;
  company_name: string;
  daily: { cap_hrs: number | null; used_hrs: number; remaining_hrs: number | null; pct: number | null } | null;
  weekly: { cap_hrs: number | null; used_hrs: number; remaining_hrs: number | null; pct: number | null } | null;
}

const CAP_QUERY = `
  WITH daily_totals AS (
    SELECT project_id, COALESCE(SUM(duration_ms), 0) / 3600000.0 AS hrs
    FROM timers
    WHERE date(started) = date('now')
      AND state IN ('running', 'paused', 'stopped')
      AND project_id IS NOT NULL
    GROUP BY project_id
  ),
  weekly_totals AS (
    SELECT project_id, COALESCE(SUM(duration_ms), 0) / 3600000.0 AS hrs
    FROM timers
    WHERE date(started) >= date('now', 'weekday 0', '-7 days')
      AND state IN ('running', 'paused', 'stopped')
      AND project_id IS NOT NULL
    GROUP BY project_id
  )
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    c.id AS company_id,
    c.name AS company_name,
    p.daily_cap_hrs,
    p.weekly_cap_hrs,
    COALESCE(d.hrs, 0) AS daily_used_hrs,
    COALESCE(w.hrs, 0) AS weekly_used_hrs
  FROM projects p
  JOIN companies c ON c.id = p.company_id
  LEFT JOIN daily_totals d ON d.project_id = p.id
  LEFT JOIN weekly_totals w ON w.project_id = p.id
  WHERE p.daily_cap_hrs IS NOT NULL OR p.weekly_cap_hrs IS NOT NULL
  ORDER BY c.name, p.sort_order, p.name
`;

// GET /api/cap-status
capStatusRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(CAP_QUERY).all() as CapStatusRow[];

  const result: CapStatus[] = rows.map(r => ({
    project_id: r.project_id,
    project_name: r.project_name,
    company_id: r.company_id,
    company_name: r.company_name,
    daily: r.daily_cap_hrs != null ? {
      cap_hrs: r.daily_cap_hrs,
      used_hrs: Math.round(r.daily_used_hrs * 100) / 100,
      remaining_hrs: Math.round((r.daily_cap_hrs - r.daily_used_hrs) * 100) / 100,
      pct: Math.round((r.daily_used_hrs / r.daily_cap_hrs) * 100),
    } : null,
    weekly: r.weekly_cap_hrs != null ? {
      cap_hrs: r.weekly_cap_hrs,
      used_hrs: Math.round(r.weekly_used_hrs * 100) / 100,
      remaining_hrs: Math.round((r.weekly_cap_hrs - r.weekly_used_hrs) * 100) / 100,
      pct: Math.round((r.weekly_used_hrs / r.weekly_cap_hrs) * 100),
    } : null,
  }));

  res.json(result);
});

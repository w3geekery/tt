import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import * as timersDb from '../../db/timers.js';
import * as companiesDb from '../../db/companies.js';

export const capStatusRouter = Router();

interface CapDetail {
  logged: number;
  cap: number;
  remaining: number;
  pct: number;
  status: 'ok' | 'warning' | 'at_cap' | 'over_cap';
}

interface ProjectCapStatus {
  company: string;
  companyInitials: string;
  companyId: string;
  project: string;
  projectId: string;
  daily: CapDetail | null;
  weekly: CapDetail | null;
}

interface CapStatusResponse {
  date: string;
  weekStart: string;
  weekEnd: string;
  projects: ProjectCapStatus[];
  runningTimer: any | null;
}

// Helper to calculate cap status
function getCapStatus(logged: number, cap: number): CapDetail | null {
  if (cap === null || cap === undefined) return null;

  const remaining = Math.max(0, cap - logged);
  const pct = Math.round((logged / cap) * 100);
  let status: 'ok' | 'warning' | 'at_cap' | 'over_cap';

  if (logged > cap) {
    status = 'over_cap';
  } else if (pct >= 100) {
    status = 'at_cap';
  } else if (pct >= 80) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  return {
    logged: Math.round(logged * 100) / 100,
    cap,
    remaining: Math.round(remaining * 100) / 100,
    pct,
    status,
  };
}

// GET /api/cap-status?date=X
capStatusRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const dateStr = (req.query.date as string) || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const date = new Date(dateStr + 'T12:00:00'); // noon to avoid DST edge cases

  // Calculate week start (Monday) and end (Sunday)
  const dayOfWeek = date.getDay();
  const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // adjust when day is Sunday
  const weekStart = new Date(date);
  weekStart.setDate(diff);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekStartStr = weekStart.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const weekEndStr = weekEnd.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  // Query all capped projects
  const query = `
    SELECT p.id, p.name, p.daily_cap_hrs, p.weekly_cap_hrs, c.id as company_id, c.name as company_name, c.initials as company_initials
    FROM projects p
    JOIN companies c ON c.id = p.company_id
    WHERE p.daily_cap_hrs IS NOT NULL OR p.weekly_cap_hrs IS NOT NULL
    ORDER BY c.name, p.name
  `;

  const projects = db.prepare(query).all() as any[];

  const projectStatuses: ProjectCapStatus[] = projects.map(p => {
    // Calculate daily hours
    const dailyQuery = `
      SELECT COALESCE(SUM(duration_ms), 0) / 3600000.0 as hrs
      FROM timers
      WHERE project_id = ? AND date(started) = date(?)
    `;
    const dailyResult = db.prepare(dailyQuery).get(p.id, dateStr) as any;
    const dailyLogged = dailyResult?.hrs || 0;

    // Calculate weekly hours
    const weeklyQuery = `
      SELECT COALESCE(SUM(duration_ms), 0) / 3600000.0 as hrs
      FROM timers
      WHERE project_id = ? AND date(started) BETWEEN date(?) AND date(?)
    `;
    const weeklyResult = db.prepare(weeklyQuery).get(p.id, weekStartStr, weekEndStr) as any;
    const weeklyLogged = weeklyResult?.hrs || 0;

    return {
      company: p.company_name,
      companyInitials: p.company_initials,
      companyId: p.company_id,
      project: p.name,
      projectId: p.id,
      daily: p.daily_cap_hrs ? getCapStatus(dailyLogged, p.daily_cap_hrs) : null,
      weekly: p.weekly_cap_hrs ? getCapStatus(weeklyLogged, p.weekly_cap_hrs) : null,
    };
  });

  // Get running timer if any
  const running = timersDb.findRunning(db);
  let runningTimer = null;
  if (running) {
    const company = running.company_id ? companiesDb.findById(db, running.company_id) : null;
    runningTimer = {
      id: running.id,
      company_id: running.company_id,
      company_name: company?.name ?? null,
      project_id: running.project_id,
      task_id: running.task_id,
      started: running.started,
    };
  }

  const response: CapStatusResponse = {
    date: dateStr,
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    projects: projectStatuses,
    runningTimer,
  };

  res.json(response);
});

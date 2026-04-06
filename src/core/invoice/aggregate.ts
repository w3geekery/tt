/**
 * Invoice data aggregation.
 *
 * Collects timer data for a company/project over a date range
 * and groups by date with 15-minute rounding.
 */

import type Database from 'better-sqlite3';
import type { Company, Project, Timer, InvoiceData } from '../types.js';
import * as companiesDb from '../db/companies.js';
import * as projectsDb from '../db/projects.js';

export interface InvoiceLineItem {
  date: string;
  slug: string;
  project_name: string;
  task_name: string | null;
  notes: string | null;
  raw_ms: number;
  rounded_hrs: number;
}

export interface InvoiceResult {
  data: InvoiceData;
  lineItems: InvoiceLineItem[];
  roundedTotalHrs: number;
}

export function aggregateInvoice(
  db: Database.Database,
  companyId: string,
  startDate: string,
  endDate: string,
  projectId?: string,
  roundingMinutes = 15,
): InvoiceResult | null {
  const company = companiesDb.findById(db, companyId);
  if (!company) return null;

  const params: unknown[] = [companyId, startDate, endDate];
  let projectFilter = '';
  if (projectId) {
    projectFilter = 'AND t.project_id = ?';
    params.push(projectId);
  }

  const rows = db.prepare(`
    SELECT t.slug, t.started, t.notes, t.project_id, t.task_id,
           p.name as project_name, tk.name as task_name,
           COALESCE(SUM(
             CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
           ), 0) as computed_ms
    FROM timers t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks tk ON tk.id = t.task_id
    LEFT JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE t.company_id = ?
      AND date(t.started) >= date(?)
      AND date(t.started) <= date(?)
      AND t.state = 'stopped'
      ${projectFilter}
    GROUP BY t.id
    ORDER BY t.started
  `).all(...params) as Array<Record<string, unknown>>;

  const lineItems: InvoiceLineItem[] = rows.map(r => {
    const rawMs = (r.computed_ms as number) ?? 0;
    return {
      date: (r.started as string)?.slice(0, 10) ?? '',
      slug: r.slug as string,
      project_name: (r.project_name as string) ?? '—',
      task_name: (r.task_name as string) ?? null,
      notes: (r.notes as string) ?? null,
      raw_ms: rawMs,
      rounded_hrs: roundToInterval(rawMs, roundingMinutes),
    };
  });

  const roundedTotalHrs = lineItems.reduce((sum, li) => sum + li.rounded_hrs, 0);
  const totalRawMs = lineItems.reduce((sum, li) => sum + li.raw_ms, 0);

  const project = projectId ? projectsDb.findById(db, projectId) : undefined;
  const timers = rows.map(r => ({ id: r.slug, duration_ms: r.computed_ms }) as unknown as Timer);

  return {
    data: {
      company,
      project: project ?? { id: '', company_id: companyId, name: 'All Projects' } as Project,
      timers,
      periodStart: startDate,
      periodEnd: endDate,
      totalHours: roundedTotalHrs,
    },
    lineItems,
    roundedTotalHrs,
  };
}

/** Round milliseconds to the nearest interval (e.g. 15 minutes). */
function roundToInterval(ms: number, intervalMinutes: number): number {
  const hrs = ms / 3600000;
  const intervalHrs = intervalMinutes / 60;
  return Math.ceil(hrs / intervalHrs) * intervalHrs;
}

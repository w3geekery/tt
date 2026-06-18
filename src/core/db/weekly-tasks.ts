import type Database from 'better-sqlite3';

export interface WeeklyTask {
  week_start: string;
  company: string;
  period_start: string;
  zb_task_id: string;
  zb_task_code: string | null;
  zb_task_name: string | null;
}

/**
 * The semi-monthly invoice period a given Monday bills to.
 * Day 1-15 -> the 1st of that month; day 16+ -> the 16th.
 * Single source of truth for the half-month boundary rule (used by upsert
 * derivation, the MCP/server tools, and the schema backfill migration).
 */
export function derivePeriodStart(weekStart: string): string {
  const day = Number(weekStart.slice(8, 10)); // weekStart is YYYY-MM-DD (a Monday)
  const half = day <= 15 ? '01' : '16';
  return `${weekStart.slice(0, 7)}-${half}`;
}

/**
 * True when the week (Monday..Sunday) straddles a semi-monthly boundary,
 * so it bills to two periods and period_start cannot be inferred from the
 * Monday alone — the caller must specify it.
 */
export function isSplitWeek(weekStart: string): boolean {
  const mon = new Date(weekStart + 'T12:00:00Z');
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return derivePeriodStart(weekStart) !== derivePeriodStart(sun.toISOString().slice(0, 10));
}

export function findByWeek(db: Database.Database, weekStart: string): WeeklyTask[] {
  return db.prepare(
    'SELECT * FROM weekly_tasks WHERE week_start = ? ORDER BY company, period_start',
  ).all(weekStart) as WeeklyTask[];
}

export function upsert(db: Database.Database, input: WeeklyTask): void {
  db.prepare(`
    INSERT INTO weekly_tasks (week_start, company, period_start, zb_task_id, zb_task_code, zb_task_name, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (week_start, company, period_start) DO UPDATE SET
      zb_task_id = excluded.zb_task_id,
      zb_task_code = excluded.zb_task_code,
      zb_task_name = excluded.zb_task_name,
      updated_at = datetime('now')
  `).run(input.week_start, input.company, input.period_start, input.zb_task_id, input.zb_task_code, input.zb_task_name);
}

/**
 * Remove weekly task(s). With periodStart, deletes the single half; without it,
 * deletes all halves for that (week, company).
 */
export function remove(db: Database.Database, weekStart: string, company: string, periodStart?: string): boolean {
  const result = periodStart
    ? db.prepare('DELETE FROM weekly_tasks WHERE week_start = ? AND company = ? AND period_start = ?').run(weekStart, company, periodStart)
    : db.prepare('DELETE FROM weekly_tasks WHERE week_start = ? AND company = ?').run(weekStart, company);
  return result.changes > 0;
}

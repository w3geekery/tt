import type Database from 'better-sqlite3';

export interface WeeklyTask {
  week_start: string;
  company: string;
  zb_task_id: string;
  zb_task_code: string | null;
  zb_task_name: string | null;
}

export function findByWeek(db: Database.Database, weekStart: string): WeeklyTask[] {
  return db.prepare(
    'SELECT * FROM weekly_tasks WHERE week_start = ? ORDER BY company',
  ).all(weekStart) as WeeklyTask[];
}

export function findByWeekAndCompany(db: Database.Database, weekStart: string, company: string): WeeklyTask | undefined {
  return db.prepare(
    'SELECT * FROM weekly_tasks WHERE week_start = ? AND company = ?',
  ).get(weekStart, company) as WeeklyTask | undefined;
}

export function upsert(db: Database.Database, input: WeeklyTask): void {
  db.prepare(`
    INSERT INTO weekly_tasks (week_start, company, zb_task_id, zb_task_code, zb_task_name, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (week_start, company) DO UPDATE SET
      zb_task_id = excluded.zb_task_id,
      zb_task_code = excluded.zb_task_code,
      zb_task_name = excluded.zb_task_name,
      updated_at = datetime('now')
  `).run(input.week_start, input.company, input.zb_task_id, input.zb_task_code, input.zb_task_name);
}

export function remove(db: Database.Database, weekStart: string, company: string): boolean {
  const result = db.prepare('DELETE FROM weekly_tasks WHERE week_start = ? AND company = ?').run(weekStart, company);
  return result.changes > 0;
}

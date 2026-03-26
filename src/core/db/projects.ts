import type Database from 'better-sqlite3';
import type { Project } from '../types.js';
import { randomUUID } from 'node:crypto';

export interface CreateProjectInput {
  company_id: string;
  name: string;
  color?: string | null;
  billable?: boolean;
  daily_cap_hrs?: number | null;
  weekly_cap_hrs?: number | null;
  overflow_company_id?: string | null;
  overflow_project_id?: string | null;
  overflow_task_id?: string | null;
  notify_on_cap?: boolean;
  sort_order?: number;
}

export interface UpdateProjectInput {
  name?: string;
  color?: string | null;
  billable?: boolean;
  daily_cap_hrs?: number | null;
  weekly_cap_hrs?: number | null;
  overflow_company_id?: string | null;
  overflow_project_id?: string | null;
  overflow_task_id?: string | null;
  notify_on_cap?: boolean;
  sort_order?: number;
}

export function findAll(db: Database.Database): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY sort_order, name').all().map(mapRow);
}

export function findByCompany(db: Database.Database, companyId: string): Project[] {
  return db
    .prepare('SELECT * FROM projects WHERE company_id = ? ORDER BY sort_order, name')
    .all(companyId)
    .map(mapRow);
}

export function findById(db: Database.Database, id: string): Project | undefined {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return row ? mapRow(row) : undefined;
}

export function create(db: Database.Database, input: CreateProjectInput): Project {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, company_id, name, color, billable, daily_cap_hrs, weekly_cap_hrs,
      overflow_company_id, overflow_project_id, overflow_task_id, notify_on_cap, sort_order,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.company_id,
    input.name,
    input.color ?? null,
    input.billable !== false ? 1 : 0,
    input.daily_cap_hrs ?? null,
    input.weekly_cap_hrs ?? null,
    input.overflow_company_id ?? null,
    input.overflow_project_id ?? null,
    input.overflow_task_id ?? null,
    input.notify_on_cap !== false ? 1 : 0,
    input.sort_order ?? 0,
    now,
    now,
  );
  return findById(db, id)!;
}

export function update(db: Database.Database, id: string, input: UpdateProjectInput): Project | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
  if (input.color !== undefined) { fields.push('color = ?'); values.push(input.color); }
  if (input.billable !== undefined) { fields.push('billable = ?'); values.push(input.billable ? 1 : 0); }
  if (input.daily_cap_hrs !== undefined) { fields.push('daily_cap_hrs = ?'); values.push(input.daily_cap_hrs); }
  if (input.weekly_cap_hrs !== undefined) { fields.push('weekly_cap_hrs = ?'); values.push(input.weekly_cap_hrs); }
  if (input.overflow_company_id !== undefined) { fields.push('overflow_company_id = ?'); values.push(input.overflow_company_id); }
  if (input.overflow_project_id !== undefined) { fields.push('overflow_project_id = ?'); values.push(input.overflow_project_id); }
  if (input.overflow_task_id !== undefined) { fields.push('overflow_task_id = ?'); values.push(input.overflow_task_id); }
  if (input.notify_on_cap !== undefined) { fields.push('notify_on_cap = ?'); values.push(input.notify_on_cap ? 1 : 0); }
  if (input.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(input.sort_order); }

  if (fields.length === 0) return findById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findById(db, id);
}

export function remove(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

function mapRow(row: unknown): Project {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    billable: r.billable === 1,
    notify_on_cap: r.notify_on_cap === 1,
  } as Project;
}

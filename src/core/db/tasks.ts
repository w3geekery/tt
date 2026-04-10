import type Database from 'better-sqlite3';
import type { Task } from '../types.js';
import { randomUUID } from 'node:crypto';
import { generateEntitySlug } from './entity-slug.js';

export interface CreateTaskInput {
  company_id: string;
  project_id?: string | null;
  name: string;
  slug?: string | null;
  code?: string | null;
  url?: string | null;
}

export interface UpdateTaskInput {
  name?: string;
  slug?: string | null;
  code?: string | null;
  url?: string | null;
  project_id?: string | null;
}

export function findAll(db: Database.Database): Task[] {
  return db.prepare('SELECT * FROM tasks ORDER BY name').all() as Task[];
}

export function findByCompany(db: Database.Database, companyId: string): Task[] {
  return db.prepare('SELECT * FROM tasks WHERE company_id = ? ORDER BY name').all(companyId) as Task[];
}

export function findByProject(db: Database.Database, projectId: string): Task[] {
  return db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY name').all(projectId) as Task[];
}

export function findById(db: Database.Database, id: string): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
}

export function findBySlug(db: Database.Database, slug: string): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE slug = ? COLLATE NOCASE').get(slug) as Task | undefined;
}

export function create(db: Database.Database, input: CreateTaskInput): Task {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const now = new Date().toISOString();
  const slug = input.slug || generateEntitySlug(db, 'tasks', input.name);
  db.prepare(
    `INSERT INTO tasks (id, company_id, project_id, name, slug, code, url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.company_id, input.project_id ?? null, input.name, slug, input.code ?? null, input.url ?? null, now, now);
  return findById(db, id)!;
}

export function update(db: Database.Database, id: string, input: UpdateTaskInput): Task | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
  if (input.slug !== undefined) { fields.push('slug = ?'); values.push(input.slug); }
  if (input.code !== undefined) { fields.push('code = ?'); values.push(input.code); }
  if (input.url !== undefined) { fields.push('url = ?'); values.push(input.url); }
  if (input.project_id !== undefined) { fields.push('project_id = ?'); values.push(input.project_id); }

  if (fields.length === 0) return findById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findById(db, id);
}

export function remove(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

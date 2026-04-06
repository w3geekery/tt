import type Database from 'better-sqlite3';
import type { FavoriteTemplate } from '../types.js';
import { randomUUID } from 'node:crypto';

export interface CreateFavoriteInput {
  company_id: string;
  project_id?: string | null;
  task_id?: string | null;
  sort_order?: number;
}

export function findAll(db: Database.Database): FavoriteTemplate[] {
  return db.prepare(`
    SELECT f.*, c.name as company_name, c.color as company_color,
           p.name as project_name, p.color as project_color,
           tk.name as task_name
    FROM favorite_templates f
    JOIN companies c ON c.id = f.company_id
    LEFT JOIN projects p ON p.id = f.project_id
    LEFT JOIN tasks tk ON tk.id = f.task_id
    ORDER BY f.sort_order, c.name, p.name, tk.name
  `).all() as FavoriteTemplate[];
}

export function findById(db: Database.Database, id: string): FavoriteTemplate | undefined {
  return db.prepare('SELECT * FROM favorite_templates WHERE id = ?').get(id) as FavoriteTemplate | undefined;
}

export function findByTemplate(
  db: Database.Database,
  companyId: string,
  projectId?: string | null,
  taskId?: string | null,
): FavoriteTemplate | undefined {
  return db.prepare(
    `SELECT * FROM favorite_templates
     WHERE company_id = ? AND COALESCE(project_id, '') = COALESCE(?, '') AND COALESCE(task_id, '') = COALESCE(?, '')`,
  ).get(companyId, projectId ?? '', taskId ?? '') as FavoriteTemplate | undefined;
}

export function create(db: Database.Database, input: CreateFavoriteInput): FavoriteTemplate {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO favorite_templates (id, company_id, project_id, task_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.company_id, input.project_id ?? null, input.task_id ?? null, input.sort_order ?? 0, now, now);
  return findById(db, id)!;
}

export function remove(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM favorite_templates WHERE id = ?').run(id);
  return result.changes > 0;
}

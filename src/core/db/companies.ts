import type Database from 'better-sqlite3';
import type { Company } from '../types.js';
import { randomUUID } from 'node:crypto';
import { generateEntitySlug } from './entity-slug.js';

export interface CreateCompanyInput {
  name: string;
  slug?: string | null;
  initials?: string | null;
  color?: string | null;
}

export interface UpdateCompanyInput {
  name?: string;
  slug?: string | null;
  initials?: string | null;
  color?: string | null;
}

export function findAll(db: Database.Database): Company[] {
  return db.prepare('SELECT * FROM companies ORDER BY name').all() as Company[];
}

export function findById(db: Database.Database, id: string): Company | undefined {
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined;
}

export function findBySlug(db: Database.Database, slug: string): Company | undefined {
  return db.prepare('SELECT * FROM companies WHERE slug = ? COLLATE NOCASE').get(slug) as Company | undefined;
}

export function create(db: Database.Database, input: CreateCompanyInput): Company {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const slug = input.slug || generateEntitySlug(db, 'companies', input.name);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO companies (id, name, slug, initials, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, slug, input.initials ?? null, input.color ?? null, now, now);
  return findById(db, id)!;
}

export function update(db: Database.Database, id: string, input: UpdateCompanyInput): Company | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
  if (input.slug !== undefined) { fields.push('slug = ?'); values.push(input.slug); }
  if (input.initials !== undefined) { fields.push('initials = ?'); values.push(input.initials); }
  if (input.color !== undefined) { fields.push('color = ?'); values.push(input.color); }

  if (fields.length === 0) return findById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findById(db, id);
}

export function remove(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM companies WHERE id = ?').run(id);
  return result.changes > 0;
}

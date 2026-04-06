import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from './schema.js';
import * as companiesDb from './companies.js';
import * as projectsDb from './projects.js';
import * as tasksDb from './tasks.js';
import * as favoritesDb from './favorites.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

describe('favorites', () => {
  let db: Database.Database;
  let companyId: string;
  let projectId: string;
  let taskId: string;

  beforeEach(() => {
    db = freshDb();
    companyId = companiesDb.create(db, { name: 'ZeroBias' }).id;
    projectId = projectsDb.create(db, { company_id: companyId, name: 'UI' }).id;
    taskId = tasksDb.create(db, { company_id: companyId, project_id: projectId, name: 'General Dev', code: 'GD' }).id;
  });

  it('creates and retrieves a favorite', () => {
    const fav = favoritesDb.create(db, { company_id: companyId, project_id: projectId, task_id: taskId });
    expect(fav.id).toBeTruthy();
    expect(fav.company_id).toBe(companyId);
    expect(fav.project_id).toBe(projectId);
    expect(fav.task_id).toBe(taskId);
  });

  it('findAll joins company/project/task names', () => {
    favoritesDb.create(db, { company_id: companyId, project_id: projectId, task_id: taskId });
    const all = favoritesDb.findAll(db);
    expect(all).toHaveLength(1);
    expect(all[0].company_name).toBe('ZeroBias');
    expect(all[0].project_name).toBe('UI');
    expect(all[0].task_name).toBe('General Dev');
  });

  it('findByTemplate matches exact combo', () => {
    favoritesDb.create(db, { company_id: companyId, project_id: projectId, task_id: taskId });
    const found = favoritesDb.findByTemplate(db, companyId, projectId, taskId);
    expect(found).toBeTruthy();
    const notFound = favoritesDb.findByTemplate(db, companyId, projectId, null);
    expect(notFound).toBeUndefined();
  });

  it('findByTemplate handles null project/task', () => {
    favoritesDb.create(db, { company_id: companyId });
    const found = favoritesDb.findByTemplate(db, companyId, null, null);
    expect(found).toBeTruthy();
  });

  it('prevents duplicate favorites (same combo)', () => {
    favoritesDb.create(db, { company_id: companyId, project_id: projectId, task_id: taskId });
    expect(() => {
      favoritesDb.create(db, { company_id: companyId, project_id: projectId, task_id: taskId });
    }).toThrow();
  });

  it('removes a favorite', () => {
    const fav = favoritesDb.create(db, { company_id: companyId, project_id: projectId });
    expect(favoritesDb.remove(db, fav.id)).toBe(true);
    expect(favoritesDb.findAll(db)).toHaveLength(0);
  });

  it('remove returns false for non-existent id', () => {
    expect(favoritesDb.remove(db, 'NONEXISTENT')).toBe(false);
  });
});

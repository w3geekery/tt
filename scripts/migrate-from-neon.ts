#!/usr/bin/env tsx
/**
 * Migration script: Neon (timetracker-ui) → SQLite (tt)
 *
 * Reads from the Neon database via the timetracker MCP server's
 * Express API and writes to the local SQLite database.
 *
 * Usage:
 *   npx tsx scripts/migrate-from-neon.ts [--dry-run]
 *
 * Prerequisites:
 *   - timetracker-ui server running on port 4300
 *   - Or: set NEON_API_URL environment variable
 */

import { getDb, closeDb } from '../src/core/db/connection.js';
import * as companiesDb from '../src/core/db/companies.js';
import * as projectsDb from '../src/core/db/projects.js';
import * as tasksDb from '../src/core/db/tasks.js';
import * as timersDb from '../src/core/db/timers.js';
import * as recurringDb from '../src/core/db/recurring.js';

const API_BASE = process.env.NEON_API_URL ?? 'http://localhost:4300';
const DRY_RUN = process.argv.includes('--dry-run');

interface NeonEntity {
  id: string;
  [key: string]: unknown;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function migrate() {
  console.log(`Migrating from ${API_BASE} ${DRY_RUN ? '(DRY RUN)' : ''}`);

  const db = getDb();

  // Maps from old Neon IDs to new SQLite IDs
  const companyMap = new Map<string, string>();
  const projectMap = new Map<string, string>();
  const taskMap = new Map<string, string>();

  // 1. Companies
  console.log('\n--- Companies ---');
  const companies = await fetchJson<NeonEntity[]>('/api/companies');
  for (const co of companies) {
    console.log(`  ${co.name}`);
    if (!DRY_RUN) {
      const created = companiesDb.create(db, {
        name: co.name as string,
        initials: co.initials as string | undefined,
        color: co.color as string | undefined,
      });
      companyMap.set(co.id, created.id);
    }
  }
  console.log(`  Total: ${companies.length}`);

  // 2. Projects
  console.log('\n--- Projects ---');
  const projects = await fetchJson<NeonEntity[]>('/api/projects');
  for (const proj of projects) {
    const newCompanyId = companyMap.get(proj.company_id as string);
    console.log(`  ${proj.name} (company: ${newCompanyId ? 'mapped' : 'MISSING'})`);
    if (!DRY_RUN && newCompanyId) {
      const created = projectsDb.create(db, {
        company_id: newCompanyId,
        name: proj.name as string,
        color: proj.color as string | undefined,
        billable: (proj.billable as boolean) ?? true,
        daily_cap_hrs: proj.daily_cap_hrs as number | undefined,
        weekly_cap_hrs: proj.weekly_cap_hrs as number | undefined,
        overflow_company_id: proj.overflow_company_id ? companyMap.get(proj.overflow_company_id as string) : undefined,
        notify_on_cap: (proj.notify_on_cap as boolean) ?? true,
        sort_order: proj.sort_order as number ?? 0,
      });
      projectMap.set(proj.id, created.id);
    }
  }
  console.log(`  Total: ${projects.length}`);

  // 3. Tasks
  console.log('\n--- Tasks ---');
  const tasks = await fetchJson<NeonEntity[]>('/api/tasks');
  for (const task of tasks) {
    const newCompanyId = companyMap.get(task.company_id as string);
    const newProjectId = task.project_id ? projectMap.get(task.project_id as string) : undefined;
    console.log(`  ${task.name} ${task.code ? `[${task.code}]` : ''}`);
    if (!DRY_RUN && newCompanyId) {
      const created = tasksDb.create(db, {
        company_id: newCompanyId,
        project_id: newProjectId,
        name: task.name as string,
        code: task.code as string | undefined,
        url: task.url as string | undefined,
      });
      taskMap.set(task.id, created.id);
    }
  }
  console.log(`  Total: ${tasks.length}`);

  // 4. Timers (as manual entries since they're all historical)
  console.log('\n--- Timers ---');
  const timers = await fetchJson<NeonEntity[]>('/api/timers');
  let migrated = 0;
  let skipped = 0;
  for (const timer of timers) {
    const newCompanyId = companyMap.get(timer.company_id as string);
    if (!newCompanyId) { skipped++; continue; }
    if (!timer.started || !timer.ended) { skipped++; continue; }

    const newProjectId = timer.project_id ? projectMap.get(timer.project_id as string) : undefined;
    const newTaskId = timer.task_id ? taskMap.get(timer.task_id as string) : undefined;

    if (!DRY_RUN) {
      timersDb.addEntry(db, {
        company_id: newCompanyId,
        project_id: newProjectId,
        task_id: newTaskId,
        started: timer.started as string,
        ended: timer.ended as string,
        notes: timer.notes as string | undefined,
        external_task: timer.external_task as Record<string, unknown> | undefined,
      });
    }
    migrated++;
  }
  console.log(`  Migrated: ${migrated}, Skipped: ${skipped}`);

  // 5. Recurring timers
  console.log('\n--- Recurring Timers ---');
  try {
    const recurring = await fetchJson<NeonEntity[]>('/api/recurring');
    for (const rec of recurring) {
      const newCompanyId = companyMap.get(rec.company_id as string);
      if (!newCompanyId) continue;
      if (!DRY_RUN) {
        recurringDb.create(db, {
          company_id: newCompanyId,
          project_id: rec.project_id ? projectMap.get(rec.project_id as string) : undefined,
          task_id: rec.task_id ? taskMap.get(rec.task_id as string) : undefined,
          pattern: rec.pattern as 'daily' | 'weekly',
          weekday: rec.weekday as number | undefined,
          start_time: rec.start_time as string | undefined,
          start_date: rec.start_date as string,
          end_date: rec.end_date as string | undefined,
          notes: rec.notes as string | undefined,
        });
      }
    }
    console.log(`  Total: ${recurring.length}`);
  } catch {
    console.log('  Skipped (endpoint not available)');
  }

  closeDb();
  console.log('\n✓ Migration complete!');
  if (DRY_RUN) console.log('  (No data was written — remove --dry-run to execute)');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

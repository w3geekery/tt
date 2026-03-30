#!/usr/bin/env tsx
/**
 * Migration script: Neon (timetracker-ui) → SQLite (tt)
 *
 * Reads directly from Neon PostgreSQL and writes to local SQLite.
 * No Express server needed — connects to Neon directly.
 *
 * Usage:
 *   npx tsx scripts/migrate-from-neon.ts [--dry-run]
 *
 * Prerequisites:
 *   - NEON_DATABASE_URL env var (or uses the one from timetracker MCP config)
 */

import { getDb, closeDb } from '../src/core/db/connection.js';
import * as companiesDb from '../src/core/db/companies.js';
import * as projectsDb from '../src/core/db/projects.js';
import * as tasksDb from '../src/core/db/tasks.js';
import * as timersDb from '../src/core/db/timers.js';
import * as recurringDb from '../src/core/db/recurring.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');

// Get Neon connection string from env or from ~/.claude.json
function getNeonUrl(): string {
  if (process.env.NEON_DATABASE_URL) return process.env.NEON_DATABASE_URL;

  try {
    const claudeConfig = JSON.parse(readFileSync(resolve(homedir(), '.claude.json'), 'utf-8'));
    return claudeConfig.mcpServers?.timetracker?.env?.DATABASE_URL;
  } catch {
    throw new Error('Set NEON_DATABASE_URL or ensure ~/.claude.json has timetracker MCP config');
  }
}

// Get the user_id from the old system
function getUserId(): string {
  if (process.env.TT_USER_ID) return process.env.TT_USER_ID;

  try {
    const claudeConfig = JSON.parse(readFileSync(resolve(homedir(), '.claude.json'), 'utf-8'));
    return claudeConfig.mcpServers?.timetracker?.env?.TT_USER_ID ?? '';
  } catch {
    return '';
  }
}

async function migrate() {
  const neonUrl = getNeonUrl();
  const userId = getUserId();
  console.log(`Migrating from Neon ${DRY_RUN ? '(DRY RUN)' : ''}`);
  if (!userId) {
    console.error('No TT_USER_ID found — cannot filter by user');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: neonUrl });
  await client.connect();

  const db = getDb();

  // Disable FK checks during migration — we'll re-enable after
  db.pragma('foreign_keys = OFF');

  // Maps from old Neon UUIDs to new SQLite IDs
  const companyMap = new Map<string, string>();
  const projectMap = new Map<string, string>();
  const taskMap = new Map<string, string>();

  try {
    // 1. Companies
    console.log('\n--- Companies ---');
    const { rows: companies } = await client.query(
      'SELECT * FROM companies WHERE user_id = $1 ORDER BY name', [userId]
    );
    for (const co of companies) {
      console.log(`  ${co.name} ${co.initials ? '(' + co.initials + ')' : ''}`);
      if (!DRY_RUN) {
        const created = companiesDb.create(db, {
          name: co.name,
          initials: co.initials,
          color: co.color,
        });
        companyMap.set(co.id, created.id);
      } else {
        companyMap.set(co.id, co.id);
      }
    }
    console.log(`  Total: ${companies.length}`);

    // 2. Projects
    console.log('\n--- Projects ---');
    const { rows: projects } = await client.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY name', [userId]
    );
    for (const proj of projects) {
      const newCompanyId = companyMap.get(proj.company_id);
      console.log(`  ${proj.name} (company: ${newCompanyId ? 'mapped' : 'MISSING'})`);
      if (!DRY_RUN && newCompanyId) {
        const created = projectsDb.create(db, {
          company_id: newCompanyId,
          name: proj.name,
          color: proj.color,
          billable: proj.billable ?? true,
          daily_cap_hrs: proj.daily_cap_hrs,
          weekly_cap_hrs: proj.weekly_cap_hrs,
          overflow_company_id: proj.overflow_company_id ? companyMap.get(proj.overflow_company_id) : undefined,
          overflow_project_id: proj.overflow_project_id ? undefined : undefined, // resolve after all projects created
          notify_on_cap: proj.notify_on_cap ?? true,
          sort_order: proj.sort_order ?? 0,
        });
        projectMap.set(proj.id, created.id);
      } else {
        projectMap.set(proj.id, proj.id);
      }
    }
    console.log(`  Total: ${projects.length}`);

    // Resolve overflow project references now that all projects exist
    if (!DRY_RUN) {
      for (const proj of projects) {
        if (proj.overflow_project_id) {
          const newId = projectMap.get(proj.id);
          const overflowId = projectMap.get(proj.overflow_project_id);
          if (newId && overflowId) {
            projectsDb.update(db, newId, { overflow_project_id: overflowId });
          }
        }
      }
    }

    // 3. Tasks (Neon tasks have project_id but no company_id — derive from project)
    console.log('\n--- Tasks ---');
    const { rows: tasks } = await client.query(
      'SELECT t.*, p.company_id FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.user_id = $1 ORDER BY t.name', [userId]
    );
    for (const task of tasks) {
      // Derive company_id from the project's company
      const neonCompanyId = task.company_id;
      const newCompanyId = neonCompanyId ? companyMap.get(neonCompanyId) : undefined;
      const newProjectId = task.project_id ? projectMap.get(task.project_id) : undefined;

      if (!newCompanyId) {
        console.log(`  SKIP: ${task.name} (no company — orphan task)`);
        continue;
      }

      console.log(`  ${task.name} ${task.code ? '[' + task.code + ']' : ''}`);
      if (!DRY_RUN) {
        const created = tasksDb.create(db, {
          company_id: newCompanyId,
          project_id: newProjectId,
          name: task.name,
          code: task.code,
          url: task.url,
        });
        taskMap.set(task.id, created.id);
      } else {
        taskMap.set(task.id, task.id);
      }
    }
    console.log(`  Total: ${tasks.length}`);

    // 4. Timers (as manual entries since they're all historical)
    console.log('\n--- Timers ---');
    const { rows: timers } = await client.query(
      'SELECT * FROM timers WHERE user_id = $1 ORDER BY started', [userId]
    );
    let migrated = 0;
    let skipped = 0;
    for (const timer of timers) {
      const newCompanyId = companyMap.get(timer.company_id);
      if (!newCompanyId) { skipped++; continue; }
      if (!timer.started || !timer.ended) { skipped++; continue; }

      const newProjectId = timer.project_id ? projectMap.get(timer.project_id) : undefined;
      const newTaskId = timer.task_id ? taskMap.get(timer.task_id) : undefined;

      if (!DRY_RUN) {
        try {
          timersDb.addEntry(db, {
            company_id: newCompanyId,
            project_id: newProjectId,
            task_id: newTaskId,
            started: timer.started instanceof Date ? timer.started.toISOString() : timer.started,
            ended: timer.ended instanceof Date ? timer.ended.toISOString() : timer.ended,
            notes: timer.notes,
            external_task: timer.external_task,
          });
        } catch (err) {
          console.error(`  Skipped timer ${timer.id}: ${(err as Error).message}`);
          skipped++;
          continue;
        }
      }
      migrated++;
    }
    console.log(`  Migrated: ${migrated}, Skipped: ${skipped}`);

    // 5. Recurring timers
    console.log('\n--- Recurring Timers ---');
    try {
      const { rows: recurring } = await client.query(
        'SELECT * FROM recurring_timers WHERE user_id = $1', [userId]
      );
      for (const rec of recurring) {
        const newCompanyId = companyMap.get(rec.company_id);
        if (!newCompanyId) continue;
        if (!DRY_RUN) {
          recurringDb.create(db, {
            company_id: newCompanyId,
            project_id: rec.project_id ? projectMap.get(rec.project_id) : undefined,
            task_id: rec.task_id ? taskMap.get(rec.task_id) : undefined,
            pattern: rec.pattern as 'daily' | 'weekly',
            weekday: rec.weekday,
            start_time: rec.start_time,
            start_date: rec.start_date instanceof Date ? rec.start_date.toISOString().slice(0, 10) : rec.start_date,
            end_date: rec.end_date ? (rec.end_date instanceof Date ? rec.end_date.toISOString().slice(0, 10) : rec.end_date) : undefined,
            notes: rec.notes,
          });
        }
      }
      console.log(`  Total: ${recurring.length}`);
    } catch (err) {
      console.log(`  Skipped (table not found or error: ${(err as Error).message})`);
    }

    // Re-enable FK checks
    db.pragma('foreign_keys = ON');

    // Verify integrity
    const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    console.log(`\nIntegrity check: ${integrity[0]?.integrity_check}`);

    // Count final records
    const counts = {
      companies: (db.prepare('SELECT COUNT(*) as n FROM companies').get() as any).n,
      projects: (db.prepare('SELECT COUNT(*) as n FROM projects').get() as any).n,
      tasks: (db.prepare('SELECT COUNT(*) as n FROM tasks').get() as any).n,
      timers: (db.prepare('SELECT COUNT(*) as n FROM timers').get() as any).n,
      recurring: (db.prepare('SELECT COUNT(*) as n FROM recurring_timers').get() as any).n,
    };
    console.log('Final counts:', counts);

    console.log('\n✓ Migration complete!');
    if (DRY_RUN) console.log('  (No data was written — remove --dry-run to execute)');

  } finally {
    await client.end();
    closeDb();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

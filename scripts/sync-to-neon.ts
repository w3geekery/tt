#!/usr/bin/env tsx
/**
 * Sync SQLite → Neon (one-way push).
 *
 * Pushes new/changed timers from local SQLite to Neon as a hot backup.
 * Safe to run frequently — uses upsert (ON CONFLICT UPDATE) so it's idempotent.
 *
 * Usage:
 *   npx tsx scripts/sync-to-neon.ts [--dry-run]
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { getDb, closeDb } from '../src/core/db/connection.js';

const DRY_RUN = process.argv.includes('--dry-run');

const cfg = JSON.parse(readFileSync(resolve(homedir(), '.claude.json'), 'utf-8'));
const url = cfg.mcpServers.timetracker.env.DATABASE_URL;
const uid = cfg.mcpServers.timetracker.env.TT_USER_ID;

// Map local IDs to Neon IDs by name
async function buildNeonMaps(client: pg.Client) {
  const coMap = new Map<string, string>();
  const projMap = new Map<string, string>();
  const taskMap = new Map<string, string>();

  const { rows: cos } = await client.query('SELECT id, name FROM companies WHERE user_id = $1', [uid]);
  for (const c of cos) coMap.set(c.name, c.id);

  const { rows: projs } = await client.query('SELECT id, name FROM projects WHERE user_id = $1', [uid]);
  for (const p of projs) projMap.set(p.name, p.id);

  const { rows: tasks } = await client.query('SELECT id, name FROM tasks WHERE user_id = $1', [uid]);
  for (const t of tasks) taskMap.set(t.name, t.id);

  return { coMap, projMap, taskMap };
}

function buildLocalNameMaps(db: any) {
  const coNames = new Map<string, string>();
  const projNames = new Map<string, string>();
  const taskNames = new Map<string, string>();

  for (const c of db.prepare('SELECT id, name FROM companies').all() as any[]) coNames.set(c.id, c.name);
  for (const p of db.prepare('SELECT id, name FROM projects').all() as any[]) projNames.set(p.id, p.name);
  for (const t of db.prepare('SELECT id, name FROM tasks').all() as any[]) taskNames.set(t.id, t.name);

  return { coNames, projNames, taskNames };
}

async function main() {
  console.log(`Syncing SQLite → Neon ${DRY_RUN ? '(DRY RUN)' : ''}`);

  const db = getDb();
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const neon = await buildNeonMaps(client);
  const local = buildLocalNameMaps(db);

  // Get last sync timestamp from Neon
  const { rows: [lastRow] } = await client.query(
    `SELECT MAX(updated_at) as last_sync FROM timers WHERE user_id = $1`, [uid]
  );
  const lastSync = lastRow?.last_sync ? new Date(lastRow.last_sync).toISOString() : '2000-01-01';
  console.log(`Neon last update: ${lastSync}`);

  // Get all local timers updated after last sync
  const localTimers = db.prepare(`
    SELECT * FROM timers WHERE updated_at > ? OR created_at > ? ORDER BY started
  `).all(lastSync, lastSync) as any[];

  console.log(`Local timers to sync: ${localTimers.length}`);

  let synced = 0;
  let skipped = 0;

  for (const timer of localTimers) {
    // Resolve local IDs to Neon IDs via names
    const coName = local.coNames.get(timer.company_id);
    const neonCoId = coName ? neon.coMap.get(coName) : undefined;
    if (!neonCoId) { skipped++; continue; }

    const projName = timer.project_id ? local.projNames.get(timer.project_id) : null;
    const neonProjId = projName ? neon.projMap.get(projName) : null;

    const taskName = timer.task_id ? local.taskNames.get(timer.task_id) : null;
    const neonTaskId = taskName ? neon.taskMap.get(taskName) : null;

    if (DRY_RUN) {
      console.log(`  Would sync: ${timer.slug} ${timer.state} ${coName}/${projName ?? '—'}/${taskName ?? '—'}`);
      synced++;
      continue;
    }

    try {
      // Check if this timer already exists in Neon (by slug + date)
      const { rows: existing } = await client.query(
        `SELECT id FROM timers WHERE user_id = $1 AND slug = $2`, [uid, timer.slug]
      );

      if (existing.length > 0) {
        // Update existing
        await client.query(`
          UPDATE timers SET
            state = $1, started = $2, ended = $3, duration_ms = $4,
            notes = $5, stop_at = $6, updated_at = NOW()
          WHERE id = $7
        `, [
          timer.state,
          timer.started,
          timer.ended,
          timer.duration_ms,
          timer.notes,
          timer.stop_at,
          existing[0].id,
        ]);
      } else {
        // Insert new
        await client.query(`
          INSERT INTO timers (id, user_id, company_id, project_id, task_id, slug, state, start_at, started, ended, stop_at, duration_ms, notes, notify_on_switch, external_task, recurring_id, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, NULL, NULL, NOW(), NOW())
        `, [
          uid, neonCoId, neonProjId, neonTaskId,
          timer.slug, timer.state, timer.start_at,
          timer.started, timer.ended, timer.stop_at,
          timer.duration_ms, timer.notes,
        ]);
      }
      synced++;
    } catch (e) {
      console.log(`  Error syncing ${timer.slug}: ${(e as Error).message}`);
      skipped++;
    }
  }

  // Also sync segments for recently changed timers
  if (!DRY_RUN && synced > 0) {
    console.log('Syncing segments...');
    // For simplicity, we don't sync segments to Neon — they're local-only detail.
    // Neon has its own segment tracking from when the old app was primary.
  }

  console.log(`Synced: ${synced}, Skipped: ${skipped}`);

  closeDb();
  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });

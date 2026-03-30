#!/usr/bin/env tsx
/**
 * Incremental sync: pull new timers from Neon that are newer than our latest.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { getDb, closeDb } from '../src/core/db/connection.js';
import * as timersDb from '../src/core/db/timers.js';

const cfg = JSON.parse(readFileSync(resolve(homedir(), '.claude.json'), 'utf-8'));
const url = cfg.mcpServers.timetracker.env.DATABASE_URL;
const uid = cfg.mcpServers.timetracker.env.TT_USER_ID;

async function main() {
  const db = getDb();
  const latest = db.prepare('SELECT MAX(started) as t FROM timers').get() as { t: string };
  console.log('Local latest:', latest.t);

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  // Build name→ID maps for local entities
  const companyMap = new Map<string, string>();
  for (const co of db.prepare('SELECT id, name FROM companies').all() as any[]) companyMap.set(co.name, co.id);
  const projectMap = new Map<string, string>();
  for (const p of db.prepare('SELECT id, name FROM projects').all() as any[]) projectMap.set(p.name, p.id);
  const taskMap = new Map<string, string>();
  for (const t of db.prepare('SELECT id, name FROM tasks').all() as any[]) taskMap.set(t.name, t.id);

  // Build Neon ID→name maps
  const neonCoNames = new Map<string, string>();
  const { rows: neonCos } = await client.query('SELECT id, name FROM companies WHERE user_id = $1', [uid]);
  for (const co of neonCos) neonCoNames.set(co.id, co.name);
  const neonProjNames = new Map<string, string>();
  const { rows: neonProjs } = await client.query('SELECT id, name FROM projects WHERE user_id = $1', [uid]);
  for (const p of neonProjs) neonProjNames.set(p.id, p.name);
  const neonTaskNames = new Map<string, string>();
  const { rows: neonTasks } = await client.query('SELECT id, name FROM tasks WHERE user_id = $1', [uid]);
  for (const t of neonTasks) neonTaskNames.set(t.id, t.name);

  // Get new completed timers
  const { rows } = await client.query(
    `SELECT * FROM timers WHERE user_id = $1 AND started > $2 AND ended IS NOT NULL ORDER BY started`,
    [uid, latest.t]
  );
  console.log('New completed timers:', rows.length);

  db.pragma('foreign_keys = OFF');
  let synced = 0;
  for (const timer of rows) {
    const coName = neonCoNames.get(timer.company_id);
    const localCoId = coName ? companyMap.get(coName) : undefined;
    if (!localCoId) continue;

    const projName = timer.project_id ? neonProjNames.get(timer.project_id) : null;
    const localProjId = projName ? projectMap.get(projName) : undefined;
    const taskName = timer.task_id ? neonTaskNames.get(timer.task_id) : null;
    const localTaskId = taskName ? taskMap.get(taskName) : undefined;

    try {
      timersDb.addEntry(db, {
        company_id: localCoId,
        project_id: localProjId,
        task_id: localTaskId,
        started: timer.started instanceof Date ? timer.started.toISOString() : timer.started,
        ended: timer.ended instanceof Date ? timer.ended.toISOString() : timer.ended,
        notes: timer.notes,
      });
      synced++;
    } catch (e) {
      console.log('  skip:', (e as Error).message);
    }
  }

  db.pragma('foreign_keys = ON');
  console.log(`Synced ${synced} new entries`);
  console.log('Total timers:', (db.prepare('SELECT COUNT(*) as n FROM timers').get() as any).n);

  closeDb();
  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });

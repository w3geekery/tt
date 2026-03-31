/**
 * State file sync — writes current timer state to ~/.tt/state.json
 * for external tools (statusline, menubar, etc).
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import * as timersDb from '../db/timers.js';

const STATE_PATH = resolve(homedir(), '.tt', 'state.json');

function isPortListening(port: number): boolean {
  try {
    execSync(`lsof -ti:${port}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export interface StateFile {
  running: {
    id: string;
    slug: string | null;
    company_id: string;
    project_id: string | null;
    started: string | null;
    notes: string | null;
    elapsed_ms: number;
  } | null;
  today_total_ms: number;
  server: {
    heartbeat: string;
    pid: number;
    api_up: boolean;
    ui_up: boolean;
  };
  updated_at: string;
}

export function syncState(db: Database.Database): void {
  const running = timersDb.findRunning(db);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const todayTimers = timersDb.findByDate(db, today);
  const todayTotalMs = todayTimers.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);

  const state: StateFile = {
    running: running ? {
      id: running.id,
      slug: running.slug ?? null,
      company_id: running.company_id,
      project_id: running.project_id ?? null,
      started: running.started ?? null,
      notes: running.notes ?? null,
      elapsed_ms: running.started ? Date.now() - new Date(running.started).getTime() : 0,
    } : null,
    today_total_ms: todayTotalMs,
    server: {
      heartbeat: new Date().toISOString(),
      pid: process.pid,
      api_up: true, // If we're writing state, API is up
      ui_up: isPortListening(4302),
    },
    updated_at: new Date().toISOString(),
  };

  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

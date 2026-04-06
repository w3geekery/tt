import type Database from 'better-sqlite3';
import type { Timer, TimerSegment } from '../types.js';
import { randomUUID } from 'node:crypto';
import { generateSlug } from './slug.js';

/** Round an ISO timestamp to the nearest 15 minutes. */
function roundTo15(iso: string): string {
  const ms = new Date(iso).getTime();
  const fifteen = 15 * 60 * 1000;
  return new Date(Math.round(ms / fifteen) * fifteen).toISOString();
}

export interface CreateTimerInput {
  company_id: string;
  project_id?: string | null;
  task_id?: string | null;
  start_at?: string | null;
  stop_at?: string | null;
  notes?: string | null;
  notify_on_switch?: boolean;
  external_task?: Record<string, unknown> | null;
  recurring_id?: string | null;
}

export interface UpdateTimerInput {
  company_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  start_at?: string | null;
  stop_at?: string | null;
  started?: string | null;
  ended?: string | null;
  notes?: string | null;
  notify_on_switch?: boolean;
  external_task?: Record<string, unknown> | null;
}

// Correlated subquery that computes duration_ms from segment timestamps.
// Replaces the dropped duration_ms column — always derived, never stored.
const DURATION_SUBQUERY = `(SELECT COALESCE(SUM(
  CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
), 0) FROM timer_segments ts WHERE ts.timer_id = timers.id) as duration_ms`;

// --- Timer CRUD ---

export function findAll(db: Database.Database): Timer[] {
  return db.prepare(`SELECT *, ${DURATION_SUBQUERY} FROM timers ORDER BY created_at DESC`).all().map(mapTimer);
}

export function findById(db: Database.Database, id: string): Timer | undefined {
  const row = db.prepare(`SELECT *, ${DURATION_SUBQUERY} FROM timers WHERE id = ?`).get(id);
  return row ? mapTimer(row) : undefined;
}

export function findBySlug(db: Database.Database, slug: string): Timer | undefined {
  const row = db.prepare(`SELECT *, ${DURATION_SUBQUERY} FROM timers WHERE slug = ?`).get(slug);
  return row ? mapTimer(row) : undefined;
}

export function findRunning(db: Database.Database): Timer | undefined {
  const row = db.prepare(`SELECT *, ${DURATION_SUBQUERY} FROM timers WHERE state = 'running' LIMIT 1`).get();
  return row ? mapTimer(row) : undefined;
}

export function findByDate(db: Database.Database, dateStr: string): Timer[] {
  return db
    .prepare(
      `SELECT *, ${DURATION_SUBQUERY} FROM timers
       WHERE date(started, '-7 hours') = date(?)
          OR (started IS NULL AND date(created_at, '-7 hours') = date(?))
       ORDER BY started`,
    )
    .all(dateStr, dateStr)
    .map(mapTimer);
}

export function create(db: Database.Database, input: CreateTimerInput): Timer {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const slug = generateSlug(db);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO timers (id, company_id, project_id, task_id, slug, state, start_at, stop_at,
      notes, notify_on_switch, external_task, recurring_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'stopped', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.company_id,
    input.project_id ?? null,
    input.task_id ?? null,
    slug,
    input.start_at ?? null,
    input.stop_at ?? null,
    input.notes ?? null,
    input.notify_on_switch ? 1 : 0,
    input.external_task ? JSON.stringify(input.external_task) : null,
    input.recurring_id ?? null,
    now,
    now,
  );
  return findById(db, id)!;
}

export function update(db: Database.Database, id: string, input: UpdateTimerInput): Timer | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.project_id !== undefined) { fields.push('project_id = ?'); values.push(input.project_id); }
  if (input.task_id !== undefined) { fields.push('task_id = ?'); values.push(input.task_id); }
  if (input.start_at !== undefined) { fields.push('start_at = ?'); values.push(input.start_at); }
  if (input.stop_at !== undefined) { fields.push('stop_at = ?'); values.push(input.stop_at); }
  if (input.started !== undefined) { fields.push('started = ?'); values.push(input.started ? roundTo15(input.started) : null); }
  if (input.ended !== undefined) { fields.push('ended = ?'); values.push(input.ended ? roundTo15(input.ended) : null); }
  if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes); }
  if (input.notify_on_switch !== undefined) { fields.push('notify_on_switch = ?'); values.push(input.notify_on_switch ? 1 : 0); }
  if (input.external_task !== undefined) { fields.push('external_task = ?'); values.push(input.external_task ? JSON.stringify(input.external_task) : null); }

  if (fields.length === 0) return findById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE timers SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // When timer times are edited, sync to the corresponding segment
  // so computed durations stay consistent with displayed times
  if (input.started !== undefined && input.started) {
    const rounded = roundTo15(input.started);
    db.prepare(
      `UPDATE timer_segments SET started = ?, updated_at = datetime('now')
       WHERE id = (SELECT id FROM timer_segments WHERE timer_id = ? ORDER BY started ASC LIMIT 1)`,
    ).run(rounded, id);
  }
  if (input.ended !== undefined && input.ended) {
    const rounded = roundTo15(input.ended);
    db.prepare(
      `UPDATE timer_segments SET ended = ?, updated_at = datetime('now')
       WHERE id = (SELECT id FROM timer_segments WHERE timer_id = ? ORDER BY started DESC LIMIT 1)`,
    ).run(rounded, id);
  }

  return findById(db, id);
}

export function remove(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM timers WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Timer state transitions ---

export function start(db: Database.Database, id: string): Timer {
  const timer = findById(db, id);
  if (!timer) throw new Error(`Timer ${id} not found`);
  if (timer.state === 'running') return timer;

  const exactNow = new Date().toISOString();
  const roundedNow = roundTo15(exactNow);

  // Stop any currently running timer first
  const running = findRunning(db);
  if (running && running.id !== id) {
    stop(db, running.id);
  }

  // Timer-level started uses rounded time; segment also uses rounded time
  db.prepare(
    `UPDATE timers SET state = 'running', started = COALESCE(started, ?), updated_at = ? WHERE id = ?`,
  ).run(roundedNow, exactNow, id);

  createSegment(db, id, roundedNow);

  return findById(db, id)!;
}

export function stop(db: Database.Database, id: string): Timer {
  const timer = findById(db, id);
  if (!timer) throw new Error(`Timer ${id} not found`);
  if (timer.state === 'stopped') return timer;

  const exactNow = new Date().toISOString();
  const roundedNow = roundTo15(exactNow);

  // Close open segment with rounded time so durations align to 15-min grid
  closeOpenSegment(db, id, roundedNow);

  // Timer-level ended uses rounded time
  db.prepare(
    `UPDATE timers SET state = 'stopped', ended = ?, updated_at = ? WHERE id = ?`,
  ).run(roundedNow, exactNow, id);

  return findById(db, id)!;
}

export function pause(db: Database.Database, id: string): Timer {
  const timer = findById(db, id);
  if (!timer) throw new Error(`Timer ${id} not found`);
  if (timer.state !== 'running') throw new Error(`Timer ${id} is not running`);

  const now = new Date().toISOString();
  const roundedNow = roundTo15(now);

  // Close open segment with rounded time so break durations align to 15-min grid
  closeOpenSegment(db, id, roundedNow);

  db.prepare(
    `UPDATE timers SET state = 'paused', updated_at = ? WHERE id = ?`,
  ).run(now, id);

  return findById(db, id)!;
}

export function resume(db: Database.Database, id: string): Timer {
  const timer = findById(db, id);
  if (!timer) throw new Error(`Timer ${id} not found`);
  if (timer.state !== 'paused') throw new Error(`Timer ${id} is not paused`);

  const now = new Date().toISOString();
  const roundedNow = roundTo15(now);

  // Stop any currently running timer first
  const running = findRunning(db);
  if (running && running.id !== id) {
    stop(db, running.id);
  }

  db.prepare(
    `UPDATE timers SET state = 'running', updated_at = ? WHERE id = ?`,
  ).run(now, id);

  // Create a new segment with rounded time so autocap cutover boundaries align
  createSegment(db, id, roundedNow);

  return findById(db, id)!;
}

// --- Segments ---

export function getSegments(db: Database.Database, timerId: string): TimerSegment[] {
  return db
    .prepare('SELECT * FROM timer_segments WHERE timer_id = ? ORDER BY started')
    .all(timerId) as TimerSegment[];
}

export function updateSegmentNotes(db: Database.Database, segmentId: string, notes: string | null): TimerSegment | undefined {
  const segment = db.prepare('SELECT * FROM timer_segments WHERE id = ?').get(segmentId) as TimerSegment | undefined;
  if (!segment) return undefined;

  db.prepare(`UPDATE timer_segments SET notes = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(notes, segmentId);

  return db.prepare('SELECT * FROM timer_segments WHERE id = ?').get(segmentId) as TimerSegment;
}

export function updateSegment(db: Database.Database, segmentId: string, input: { started?: string; ended?: string; notes?: string | null }): TimerSegment | undefined {
  const segment = db.prepare('SELECT * FROM timer_segments WHERE id = ?').get(segmentId) as TimerSegment | undefined;
  if (!segment) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.started !== undefined) { fields.push('started = ?'); values.push(input.started); }
  if (input.ended !== undefined) { fields.push('ended = ?'); values.push(input.ended); }
  if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes); }
  if (fields.length === 0) return segment;

  fields.push("updated_at = datetime('now')");
  values.push(segmentId);
  db.prepare(`UPDATE timer_segments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM timer_segments WHERE id = ?').get(segmentId) as TimerSegment;
}

function createSegment(db: Database.Database, timerId: string, started: string): void {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO timer_segments (id, timer_id, started, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, timerId, started, now, now);
}

function closeOpenSegment(db: Database.Database, timerId: string, ended: string): void {
  const segment = db
    .prepare("SELECT * FROM timer_segments WHERE timer_id = ? AND ended IS NULL ORDER BY started DESC LIMIT 1")
    .get(timerId) as TimerSegment | undefined;

  if (segment) {
    db.prepare(
      `UPDATE timer_segments SET ended = ?, updated_at = ? WHERE id = ?`,
    ).run(ended, ended, segment.id);
  }
}

/** Compute total active duration for a timer from segment timestamps. Never uses stored duration_ms. */
export function computeDuration(db: Database.Database, timerId: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CAST((julianday(COALESCE(ended, datetime('now'))) - julianday(started)) * 86400000 AS INTEGER)
    ), 0) as total
    FROM timer_segments WHERE timer_id = ?
  `).get(timerId) as { total: number };
  return row.total;
}

/**
 * SQL fragment: compute segment duration in ms from timestamps.
 * Use with timer_segments aliased as `ts`.
 * Handles open segments (running) via COALESCE with datetime('now').
 */
export const SEG_DURATION_EXPR = `CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)`;

// --- Manual entry ---

export function addEntry(db: Database.Database, input: CreateTimerInput & { started: string; ended: string }): Timer {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const roundedStarted = roundTo15(input.started);
  const roundedEnded = roundTo15(input.ended);
  const slug = generateSlug(db, new Date(roundedStarted));
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO timers (id, company_id, project_id, task_id, slug, state, started, ended,
      notes, notify_on_switch, external_task, recurring_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'stopped', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.company_id,
    input.project_id ?? null,
    input.task_id ?? null,
    slug,
    roundedStarted,
    roundedEnded,
    input.notes ?? null,
    input.notify_on_switch ? 1 : 0,
    input.external_task ? JSON.stringify(input.external_task) : null,
    input.recurring_id ?? null,
    now,
    now,
  );

  // Create a closed segment for the entry (exact times, not rounded)
  const segId = randomUUID().replace(/-/g, '').toUpperCase();
  db.prepare(
    `INSERT INTO timer_segments (id, timer_id, started, ended, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(segId, id, input.started, input.ended, now, now);

  return findById(db, id)!;
}

// --- Helpers ---

function mapTimer(row: unknown): Timer {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    notify_on_switch: r.notify_on_switch === 1,
    external_task: r.external_task ? JSON.parse(r.external_task as string) : null,
  } as Timer;
}

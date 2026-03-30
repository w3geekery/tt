/**
 * In-process cron engine.
 *
 * Runs on a 30-second interval and handles:
 * 1. Materializing recurring timers for today
 * 2. Auto-stopping timers at their stop_at time
 * 3. Firing pending notifications
 * 4. Checking cap thresholds
 * 5. Syncing state.json
 */

import type Database from 'better-sqlite3';
import * as timersDb from '../db/timers.js';
import * as recurringDb from '../db/recurring.js';
import * as notificationsDb from '../db/notifications.js';
import * as projectsDb from '../db/projects.js';
import { runHook } from '../extensions.js';
import { sendNotification } from './notify.js';
import { syncState } from './state.js';
import { broadcast } from '../server/sse.js';

const TICK_MS = 30_000; // 30 seconds
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startCron(db: Database.Database): void {
  if (intervalId) return;
  console.log('[cron] Started (30s interval)');
  tick(db); // Run once immediately
  intervalId = setInterval(() => tick(db), TICK_MS);
}

export function stopCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[cron] Stopped');
  }
}

async function tick(db: Database.Database): Promise<void> {
  try {
    materializeRecurring(db);
    autoStopTimers(db);
    await fireNotifications(db);
    await checkCaps(db);
    syncState(db);
  } catch (err) {
    console.error('[cron] tick error:', err);
  }
}

/** Create today's timers from active recurring definitions. */
function materializeRecurring(db: Database.Database): void {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dayOfWeek = today.getDay(); // 0=Sun

  for (const rec of recurringDb.findActive(db)) {
    // Check date range
    if (rec.start_date > todayStr) continue;
    if (rec.end_date && rec.end_date < todayStr) continue;

    // Check if skipped
    if (rec.skipped_dates.includes(todayStr)) continue;

    // Check pattern
    if (rec.pattern === 'weekly' && rec.weekday !== dayOfWeek) continue;
    if (rec.pattern === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

    // Check if already materialized today (by recurring_id OR by matching company/project/task)
    const existing = db.prepare(
      `SELECT id FROM timers WHERE date(started) = date(?) AND (
        recurring_id = ?
        OR (company_id = ? AND COALESCE(project_id,'') = COALESCE(?,'') AND COALESCE(task_id,'') = COALESCE(?,''))
      )`,
    ).get(todayStr, rec.id, rec.company_id, rec.project_id ?? '', rec.task_id ?? '');
    if (existing) continue;

    // Create the timer
    const timer = timersDb.create(db, {
      company_id: rec.company_id,
      project_id: rec.project_id,
      task_id: rec.task_id,
      notes: rec.notes,
      recurring_id: rec.id,
    });

    // Auto-start if start_time has passed
    if (rec.start_time) {
      const [h, m] = rec.start_time.split(':').map(Number);
      const startAt = new Date(today);
      startAt.setHours(h, m, 0, 0);
      if (today >= startAt) {
        timersDb.start(db, timer.id);
        broadcast('timer:started', timersDb.findById(db, timer.id));
      }
    }
  }
}

/** Stop timers that have reached their stop_at time. */
function autoStopTimers(db: Database.Database): void {
  const now = new Date().toISOString();
  const timersToStop = db.prepare(
    `SELECT id FROM timers WHERE state IN ('running', 'paused') AND stop_at IS NOT NULL AND stop_at <= ?`,
  ).all(now) as Array<{ id: string }>;

  for (const { id } of timersToStop) {
    const timer = timersDb.stop(db, id);
    broadcast('timer:stopped', timer);
    runHook('onTimerStop', timer);
  }
}

/** Fire notifications whose trigger_at has passed. */
async function fireNotifications(db: Database.Database): Promise<void> {
  const now = new Date().toISOString();
  const pending = db.prepare(
    `SELECT * FROM notifications WHERE fired_at IS NULL AND dismissed = 0 AND trigger_at <= ?`,
  ).all(now) as Array<Record<string, unknown>>;

  for (const n of pending) {
    notificationsDb.markFired(db, n.id as string);
    sendNotification(n.title as string, (n.message as string) ?? '');
    broadcast('notification:fired', n);
  }
}

/** Check if any capped projects have hit their caps. */
async function checkCaps(db: Database.Database): Promise<void> {
  const rows = db.prepare(`
    WITH daily_totals AS (
      SELECT project_id, COALESCE(SUM(duration_ms), 0) / 3600000.0 AS hrs
      FROM timers WHERE date(started) = date('now') AND project_id IS NOT NULL
      GROUP BY project_id
    )
    SELECT p.id, p.name, p.daily_cap_hrs, d.hrs as daily_used,
           p.notify_on_cap, p.overflow_company_id, p.overflow_project_id
    FROM projects p
    JOIN daily_totals d ON d.project_id = p.id
    WHERE p.daily_cap_hrs IS NOT NULL AND d.hrs >= p.daily_cap_hrs
  `).all() as Array<Record<string, unknown>>;

  for (const row of rows) {
    // Check if we already notified today
    const alreadyNotified = db.prepare(
      `SELECT id FROM notifications WHERE type = 'cap_hit' AND timer_id IS NULL
       AND message LIKE ? AND date(created_at) = date('now')`,
    ).get(`%${row.id}%`);

    if (alreadyNotified) continue;

    const project = projectsDb.findById(db, row.id as string);
    if (!project) continue;

    if (row.notify_on_cap) {
      sendNotification('Cap reached', `${row.name}: ${(row.daily_used as number).toFixed(1)}/${row.daily_cap_hrs}h`);
      notificationsDb.create(db, {
        type: 'cap_hit',
        title: `Daily cap reached: ${row.name}`,
        message: `Project ${row.id} hit ${row.daily_cap_hrs}h`,
        trigger_at: new Date().toISOString(),
      });
    }

    await runHook('onCapHit', project, 'daily');

    // Autocap: if the running timer is on this project and overflow is configured, switch
    if (project.overflow_company_id && project.overflow_project_id) {
      const running = timersDb.findRunning(db);
      if (running && running.project_id === project.id) {
        // Stop running timer
        const stopped = timersDb.stop(db, running.id);
        broadcast('timer:stopped', stopped);
        sendNotification('Autocap', `Stopped ${stopped.slug} — switching to overflow`);

        // Start overflow timer
        const overflow = timersDb.create(db, {
          company_id: project.overflow_company_id,
          project_id: project.overflow_project_id,
          task_id: project.overflow_task_id ?? undefined,
          notes: `Overflow from ${project.name} cap`,
        });
        const started = timersDb.start(db, overflow.id);
        broadcast('timer:started', started);
        sendNotification('Autocap', `Started ${started.slug} on overflow project`);
      }
    }
  }
}

/** Get autocap status for the currently running timer. */
export function getAutocapStatus(db: Database.Database): AutocapStatus | null {
  const running = timersDb.findRunning(db);
  if (!running || !running.project_id) return null;

  const project = projectsDb.findById(db, running.project_id);
  if (!project || !project.daily_cap_hrs) return null;

  // Calculate today's total for this project
  const row = db.prepare(`
    SELECT COALESCE(SUM(duration_ms), 0) / 3600000.0 AS hrs
    FROM timers WHERE date(started) = date('now') AND project_id = ?
  `).get(running.project_id) as { hrs: number };

  const completedHrs = row.hrs;
  const elapsedHrs = running.started
    ? (Date.now() - new Date(running.started).getTime()) / 3600000
    : 0;
  const totalHrs = completedHrs + elapsedHrs;
  const remainingHrs = project.daily_cap_hrs - totalHrs;
  const pct = Math.round((totalHrs / project.daily_cap_hrs) * 100);

  if (remainingHrs <= 0) {
    return {
      status: 'at_cap',
      project_name: project.name,
      cap_hrs: project.daily_cap_hrs,
      used_hrs: Math.round(totalHrs * 100) / 100,
      remaining_hrs: 0,
      pct: Math.min(pct, 100),
      switch_at: null,
      has_overflow: !!project.overflow_project_id,
    };
  }

  const switchAt = new Date(Date.now() + remainingHrs * 3600000);

  return {
    status: pct >= 80 ? 'approaching' : 'ok',
    project_name: project.name,
    cap_hrs: project.daily_cap_hrs,
    used_hrs: Math.round(totalHrs * 100) / 100,
    remaining_hrs: Math.round(remainingHrs * 100) / 100,
    pct,
    switch_at: switchAt.toISOString(),
    has_overflow: !!project.overflow_project_id,
  };
}

export interface AutocapStatus {
  status: 'ok' | 'approaching' | 'at_cap';
  project_name: string;
  cap_hrs: number;
  used_hrs: number;
  remaining_hrs: number;
  pct: number;
  switch_at: string | null;
  has_overflow: boolean;
}

// Export for testing
export { materializeRecurring, autoStopTimers, fireNotifications, checkCaps };

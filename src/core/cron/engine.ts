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
    autoStartScheduled(db);
    autoStopTimers(db);
    await fireNotifications(db);
    checkCapWarnings(db);
    await checkCaps(db);
    syncState(db);
  } catch (err) {
    console.error('[cron] tick error:', err);
  }
}

/** Get current date in Pacific Time. */
function pacificNow(): { date: Date; dateStr: string; dayOfWeek: number } {
  const now = new Date();
  // Format in Pacific Time to get the correct local date
  const ptStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); // YYYY-MM-DD
  const ptDay = new Date(ptStr + 'T12:00:00'); // noon to avoid DST edge cases
  return { date: now, dateStr: ptStr, dayOfWeek: ptDay.getDay() };
}

/** Create today's timers from active recurring definitions. */
function materializeRecurring(db: Database.Database): void {
  const { date: today, dateStr: todayStr, dayOfWeek } = pacificNow();

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
    // Use created_at (always set) instead of started (NULL if never started)
    // Offset created_at by -7h to approximate Pacific Time for date comparison
    const existing = db.prepare(
      `SELECT id FROM timers WHERE date(created_at, '-7 hours') = date(?) AND (
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

  // Second pass: auto-start existing materialized timers whose start_time has now passed
  autoStartPendingRecurring(db, today);
}

/** Start materialized recurring timers that haven't been started yet but whose start_time has passed. */
function autoStartPendingRecurring(db: Database.Database, now: Date): void {
  const { dateStr: todayStr } = pacificNow();
  const pending = db.prepare(
    `SELECT t.id, t.recurring_id FROM timers t
     WHERE date(t.created_at, '-7 hours') = date(?) AND t.state = 'stopped' AND t.started IS NULL
       AND t.recurring_id IS NOT NULL`,
  ).all(todayStr) as Array<{ id: string; recurring_id: string }>;

  for (const row of pending) {
    const rec = recurringDb.findById(db, row.recurring_id);
    if (!rec?.start_time) continue;

    const [h, m] = rec.start_time.split(':').map(Number);
    const startAt = new Date(now);
    startAt.setHours(h, m, 0, 0);
    if (now >= startAt) {
      timersDb.start(db, row.id);
      broadcast('timer:started', timersDb.findById(db, row.id));
      console.log(`[cron] Auto-started recurring timer ${row.id}`);
    }
  }
}

/** Auto-start one-off scheduled timers whose start_at time has passed. */
function autoStartScheduled(db: Database.Database): void {
  const now = new Date().toISOString();
  const scheduled = db.prepare(
    `SELECT id FROM timers WHERE state = 'stopped' AND started IS NULL
       AND start_at IS NOT NULL AND start_at <= ? AND recurring_id IS NULL`,
  ).all(now) as Array<{ id: string }>;

  for (const { id } of scheduled) {
    timersDb.start(db, id);
    const timer = timersDb.findById(db, id);
    broadcast('timer:started', timer);
    console.log(`[cron] Auto-started scheduled timer ${id}`);
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
    // Strip dedup prefix [ID] from message before showing to user
    const displayMessage = ((n.message as string) ?? '').replace(/^\[[A-F0-9]+\]\s*/, '');
    sendNotification(n.title as string, displayMessage);
    broadcast('notification:fired', n);
  }
}

/** Fire cap warning notifications at 80% of daily cap. */
function checkCapWarnings(db: Database.Database): void {
  const running = timersDb.findRunning(db);
  if (!running?.project_id || !running.started) return;

  const project = projectsDb.findById(db, running.project_id);
  if (!project?.daily_cap_hrs || !project.notify_on_cap) return;

  const { dateStr: todayPT } = pacificNow();
  const stoppedMs = (db.prepare(
    `SELECT COALESCE(SUM(
      CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
    ), 0) as ms
    FROM timers t
    JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE substr(t.started, 1, 10) = ? AND t.project_id = ? AND t.state = 'stopped'`,
  ).get(todayPT, project.id) as { ms: number }).ms;
  const runningMs = Date.now() - new Date(running.started).getTime();
  const totalHrs = (stoppedMs + runningMs) / 3600000;
  const pct = Math.round((totalHrs / project.daily_cap_hrs) * 100);

  if (pct < 80) return;
  if (pct >= 100) return; // checkCaps handles 100%+

  // Check if we already warned today (match on project ID stored in message)
  const alreadyWarned = db.prepare(
    `SELECT id FROM notifications WHERE type = 'cap_warning' AND timer_id IS NULL
     AND message LIKE ? AND substr(created_at, 1, 10) = ?`,
  ).get(`%${project.id}%`, todayPT);
  if (alreadyWarned) return;

  const remainingHrs = project.daily_cap_hrs - totalHrs;
  const remainingMin = Math.round(remainingHrs * 60);
  sendNotification('Cap warning', `${project.name}: ${pct}% — ~${remainingMin}m remaining`);
  const capWarning = notificationsDb.create(db, {
    type: 'cap_warning',
    title: `Approaching daily cap: ${project.name}`,
    message: `[${project.id}] ${project.name} at ${pct}% (${totalHrs.toFixed(1)}/${project.daily_cap_hrs}h)`,
    trigger_at: new Date().toISOString(),
  });
  notificationsDb.markFired(db, capWarning.id);
  broadcast('notification:fired', { type: 'cap_warning', project: project.name, pct });
}

/** Check if any capped projects have hit their caps. */
async function checkCaps(db: Database.Database): Promise<void> {
  const { dateStr: todayPT } = pacificNow();
  const rows = db.prepare(`
    WITH daily_totals AS (
      SELECT t.project_id, COALESCE(SUM(
        CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
      ), 0) / 3600000.0 AS hrs
      FROM timers t
      JOIN timer_segments ts ON ts.timer_id = t.id
      WHERE substr(t.started, 1, 10) = ? AND t.project_id IS NOT NULL
      GROUP BY t.project_id
    )
    SELECT p.id, p.name, p.daily_cap_hrs, d.hrs as daily_used,
           p.notify_on_cap, p.overflow_company_id, p.overflow_project_id
    FROM projects p
    JOIN daily_totals d ON d.project_id = p.id
    WHERE p.daily_cap_hrs IS NOT NULL AND d.hrs >= p.daily_cap_hrs
  `).all(todayPT) as Array<Record<string, unknown>>;

  for (const row of rows) {
    // Check if we already notified today
    const alreadyNotified = db.prepare(
      `SELECT id FROM notifications WHERE type = 'cap_hit' AND timer_id IS NULL
       AND message LIKE ? AND substr(created_at, 1, 10) = ?`,
    ).get(`%${row.id}%`, todayPT);

    if (alreadyNotified) continue;

    const project = projectsDb.findById(db, row.id as string);
    if (!project) continue;

    if (row.notify_on_cap) {
      sendNotification('Cap reached', `${row.name}: ${(row.daily_used as number).toFixed(1)}/${row.daily_cap_hrs}h`);
      const capHit = notificationsDb.create(db, {
        type: 'cap_hit',
        title: `Daily cap reached: ${row.name}`,
        message: `[${row.id}] ${row.name} hit ${row.daily_cap_hrs}h`,
        trigger_at: new Date().toISOString(),
      });
      notificationsDb.markFired(db, capHit.id);
    }

    await runHook('onCapHit', project, 'daily');

    // Autocap: if the running timer is on this project and overflow is configured, switch
    if (project.overflow_company_id && project.overflow_project_id) {
      const running = timersDb.findRunning(db);
      if (running && running.project_id === project.id && running.started) {
        // Calculate exact cap-hit time: how much of the cap was used by OTHER stopped timers today?
        const otherMs = db.prepare(
          `SELECT COALESCE(SUM(
            CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
          ), 0) as ms
          FROM timers t
          JOIN timer_segments ts ON ts.timer_id = t.id
          WHERE substr(t.started, 1, 10) = ? AND t.project_id = ? AND t.id != ? AND t.state = 'stopped'`,
        ).get(todayPT, project.id, running.id) as { ms: number };
        const capMs = (project.daily_cap_hrs ?? 0) * 3600000;
        const remainingMs = capMs - otherMs.ms;
        // Cap-hit time = running timer's start + remaining cap budget
        const capHitMs = new Date(running.started).getTime() + Math.max(remainingMs, 0);
        // Round to nearest 15 minutes
        const fifteen = 15 * 60 * 1000;
        const roundedCapHit = new Date(Math.round(capHitMs / fifteen) * fifteen).toISOString();

        // Stop running timer at the cap-hit time (backdate)
        // Close open segment first
        db.prepare(
          `UPDATE timer_segments SET ended = ?, updated_at = datetime('now')
           WHERE timer_id = ? AND ended IS NULL`,
        ).run(roundedCapHit, running.id);
        db.prepare(
          `UPDATE timers SET state = 'stopped', ended = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(roundedCapHit, running.id);
        const stopped = timersDb.findById(db, running.id)!;
        broadcast('timer:stopped', stopped);
        sendNotification('Autocap', `Stopped ${stopped.slug} at cap (${project.daily_cap_hrs}h)`);

        // Start overflow timer from the cap-hit time
        const overflow = timersDb.addEntry(db, {
          company_id: project.overflow_company_id,
          project_id: project.overflow_project_id,
          task_id: project.overflow_task_id ?? undefined,
          notes: `Overflow from ${project.name} cap`,
          started: roundedCapHit,
          ended: new Date().toISOString(),
        });
        // Re-open it as running
        db.prepare(`UPDATE timers SET state = 'running', ended = NULL, updated_at = datetime('now') WHERE id = ?`).run(overflow.id);
        db.prepare(`UPDATE timer_segments SET ended = NULL, updated_at = datetime('now') WHERE timer_id = ? ORDER BY started DESC LIMIT 1`).run(overflow.id);
        const overflowRunning = timersDb.findById(db, overflow.id)!;
        broadcast('timer:started', overflowRunning);
        sendNotification('Autocap', `Started ${overflowRunning.slug} on overflow project`);
        console.log(`[cron] Autocap: stopped ${stopped.slug} at ${roundedCapHit}, started overflow ${overflowRunning.slug}`);
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
  const { dateStr: todayPT } = pacificNow();
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
    ), 0) / 3600000.0 AS hrs
    FROM timers t
    JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE substr(t.started, 1, 10) = ? AND t.project_id = ?
  `).get(todayPT, running.project_id) as { hrs: number };

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

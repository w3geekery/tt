/**
 * MCP server entry point.
 *
 * Runs via stdio. Imports database layer directly — no HTTP, no auth.
 * Registers tools for timer management, summaries, and config.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { getDb } from '../db/connection.js';
import * as companiesDb from '../db/companies.js';
import * as projectsDb from '../db/projects.js';
import * as tasksDb from '../db/tasks.js';
import * as timersDb from '../db/timers.js';
import * as recurringDb from '../db/recurring.js';
import * as notificationsDb from '../db/notifications.js';
import * as stickiesDb from '../db/stickies.js';
import * as specstoryDb from '../db/specstory.js';
import { syncStickyReminder, cancelStickyReminder } from '../reminders.js';
import * as weeklyTasksDb from '../db/weekly-tasks.js';
import * as favoritesDb from '../db/favorites.js';
import { loadExtensions, runHook } from '../extensions.js';
import config from '../../../tt.config.js';

// Pacific Time helpers — all date defaults must use PT, not UTC
const ptDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const ptMonth = () => ptDate().slice(0, 7);

// Initialize DB and extensions
getDb(config.db);
loadExtensions(config.extensions);

/** Resolve a company reference (ID or slug) to an ID. */
function resolveCompany(db: ReturnType<typeof getDb>, ref: string): string | null {
  if (/^[A-F0-9]{32}$/i.test(ref)) {
    if (companiesDb.findById(db, ref)) return ref;
  }
  const co = companiesDb.findBySlug(db, ref);
  return co?.id ?? null;
}

/** Resolve a project reference (ID or slug) to an ID. */
function resolveProject(db: ReturnType<typeof getDb>, ref: string): string | null {
  if (/^[A-F0-9]{32}$/i.test(ref)) {
    if (projectsDb.findById(db, ref)) return ref;
  }
  const proj = projectsDb.findBySlug(db, ref);
  return proj?.id ?? null;
}

/** Resolve a task reference (ID or slug) to an ID. */
function resolveTask(db: ReturnType<typeof getDb>, ref: string): string | null {
  if (/^[A-F0-9]{32}$/i.test(ref)) {
    if (tasksDb.findById(db, ref)) return ref;
  }
  const task = tasksDb.findBySlug(db, ref);
  return task?.id ?? null;
}

/** Enrich timers with joined company/project/task names and slugs. */
function enrichTimers(timers: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const db = getDb();
  return timers.map(t => {
    const company = t.company_id ? companiesDb.findById(db, t.company_id as string) : null;
    const project = t.project_id ? projectsDb.findById(db, t.project_id as string) : null;
    const task = t.task_id ? tasksDb.findById(db, t.task_id as string) : null;
    return {
      ...t,
      company_name: company?.name ?? null,
      company_slug: company?.slug ?? null,
      project_name: project?.name ?? null,
      project_slug: project?.slug ?? null,
      task_name: task?.name ?? null,
      task_slug: task?.slug ?? null,
    };
  });
}

const server = new McpServer({
  name: 'tt',
  version: '0.1.0',
});

// --- Timer tools ---

server.tool('start_timer', 'Start a new or existing timer. Auto-stops any running timer.', {
  company_id: z.string().optional().describe('Company ID or slug (required when creating new)'),
  project_id: z.string().optional().describe('Project ID or slug'),
  task_id: z.string().optional().describe('Task ID or slug'),
  timer_id: z.string().optional().describe('Existing timer ID to start'),
  notes: z.string().optional().describe('Timer notes'),
}, async ({ company_id, project_id, task_id, timer_id, notes }) => {
  const db = getDb();
  let timer;
  if (timer_id) {
    timer = timersDb.start(db, timer_id);
  } else {
    const coId = company_id ? resolveCompany(db, company_id) : null;
    if (!coId) return { content: [{ type: 'text', text: 'Error: company_id is required when creating a new timer' }] };
    const projId = project_id ? resolveProject(db, project_id) : undefined;
    const tskId = task_id ? resolveTask(db, task_id) : undefined;
    timer = timersDb.create(db, { company_id: coId, project_id: projId, task_id: tskId, notes });
    timer = timersDb.start(db, timer.id);
  }
  await runHook('onTimerStart', timer);
  return { content: [{ type: 'text', text: `Started timer ${timer.slug} (${timer.id})` }] };
});

server.tool('stop_timer', 'Stop a running or paused timer.', {
  timer_id: z.string().optional().describe('Timer ID (omit to stop the running timer)'),
}, async ({ timer_id }) => {
  const db = getDb();
  const id = timer_id ?? timersDb.findRunning(db)?.id;
  if (!id) return { content: [{ type: 'text', text: 'No running timer to stop' }] };
  const timer = timersDb.stop(db, id);
  await runHook('onTimerStop', timer);
  const hrs = timer.duration_ms ? (timer.duration_ms / 3600000).toFixed(2) : '0';
  return { content: [{ type: 'text', text: `Stopped timer ${timer.slug} — ${hrs}h` }] };
});

server.tool('pause_timer', 'Pause the running timer.', {
  timer_id: z.string().optional().describe('Timer ID (omit to pause the running timer)'),
}, async ({ timer_id }) => {
  const db = getDb();
  const id = timer_id ?? timersDb.findRunning(db)?.id;
  if (!id) return { content: [{ type: 'text', text: 'No running timer to pause' }] };
  const timer = timersDb.pause(db, id);
  await runHook('onTimerPause', timer);
  return { content: [{ type: 'text', text: `Paused timer ${timer.slug}` }] };
});

server.tool('resume_timer', 'Resume a paused timer.', {
  timer_id: z.string().describe('Timer ID to resume'),
}, async ({ timer_id }) => {
  const db = getDb();
  const timer = timersDb.resume(db, timer_id);
  await runHook('onTimerResume', timer);
  return { content: [{ type: 'text', text: `Resumed timer ${timer.slug}` }] };
});

server.tool('get_running_timer', 'Get the currently running timer.', {}, async () => {
  const db = getDb();
  const timer = timersDb.findRunning(db);
  if (!timer) return { content: [{ type: 'text', text: 'No timer is currently running' }] };
  return { content: [{ type: 'text', text: JSON.stringify(enrichTimers([timer as any])[0], null, 2) }] };
});

server.tool('list_timers', 'List timers, optionally filtered by date.', {
  date: z.string().optional().describe('Filter by date (YYYY-MM-DD)'),
}, async ({ date }) => {
  const db = getDb();
  const list = date ? timersDb.findByDate(db, date) : timersDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(enrichTimers(list as any[]), null, 2) }] };
});

server.tool('get_timer_by_slug', 'Find a timer by its slug (e.g. 260326-1).', {
  slug: z.string().describe('Timer slug'),
}, async ({ slug }) => {
  const db = getDb();
  const timer = timersDb.findBySlug(db, slug);
  if (!timer) return { content: [{ type: 'text', text: `No timer found with slug ${slug}` }] };
  return { content: [{ type: 'text', text: JSON.stringify(enrichTimers([timer as any])[0], null, 2) }] };
});

server.tool('add_entry', 'Add a manual time entry.', {
  company_id: z.string().describe('Company ID or slug'),
  project_id: z.string().optional().describe('Project ID or slug'),
  task_id: z.string().optional().describe('Task ID or slug'),
  started: z.string().describe('Start time (ISO 8601)'),
  ended: z.string().describe('End time (ISO 8601)'),
  notes: z.string().optional().describe('Notes'),
}, async (input) => {
  const db = getDb();
  const coId = resolveCompany(db, input.company_id);
  if (!coId) return { content: [{ type: 'text', text: `Error: company not found: ${input.company_id}` }] };
  const projId = input.project_id ? resolveProject(db, input.project_id) : undefined;
  const tskId = input.task_id ? resolveTask(db, input.task_id) : undefined;
  const timer = timersDb.addEntry(db, { ...input, company_id: coId, project_id: projId, task_id: tskId });
  const hrs = (timer.duration_ms! / 3600000).toFixed(2);
  return { content: [{ type: 'text', text: `Added entry ${timer.slug} — ${hrs}h` }] };
});

server.tool('update_timer', 'Update timer fields (notes, project, task, times).', {
  timer_id: z.string().describe('Timer ID'),
  notes: z.string().optional().describe('Updated notes'),
  project_id: z.string().optional().describe('Updated project ID or slug'),
  task_id: z.string().optional().describe('Updated task ID or slug'),
  started: z.string().optional().describe('Updated start time (ISO 8601)'),
  ended: z.string().optional().describe('Updated end time (ISO 8601)'),
}, async ({ timer_id, project_id, task_id, ...rest }) => {
  const db = getDb();
  const resolved: Record<string, unknown> = { ...rest };
  if (project_id !== undefined) resolved.project_id = project_id ? resolveProject(db, project_id) : null;
  if (task_id !== undefined) resolved.task_id = task_id ? resolveTask(db, task_id) : null;
  const timer = timersDb.update(db, timer_id, resolved);
  if (!timer) return { content: [{ type: 'text', text: 'Timer not found' }] };
  return { content: [{ type: 'text', text: `Updated timer ${timer.slug}` }] };
});

server.tool('delete_timer', 'Delete a timer.', {
  timer_id: z.string().describe('Timer ID'),
}, async ({ timer_id }) => {
  const db = getDb();
  const ok = timersDb.remove(db, timer_id);
  return { content: [{ type: 'text', text: ok ? 'Timer deleted' : 'Timer not found' }] };
});

// --- Segment tools ---

server.tool('list_segments', 'List all segments for a timer.', {
  timer_id: z.string().describe('Timer ID'),
}, async ({ timer_id }) => {
  const db = getDb();
  const segments = timersDb.getSegments(db, timer_id);
  if (segments.length === 0) return { content: [{ type: 'text', text: 'No segments found' }] };
  return { content: [{ type: 'text', text: JSON.stringify(segments, null, 2) }] };
});

server.tool('update_segment', 'Update a segment\'s start time, end time, notes, or break_note (note about the gap PRECEDING this segment).', {
  segment_id: z.string().describe('Segment ID'),
  started: z.string().optional().describe('Updated start time (ISO 8601)'),
  ended: z.string().optional().describe('Updated end time (ISO 8601)'),
  notes: z.string().optional().describe('Updated notes'),
  break_note: z.string().optional().describe('Updated note describing the break preceding this segment'),
}, async ({ segment_id, ...updates }) => {
  const db = getDb();
  const segment = timersDb.updateSegment(db, segment_id, updates);
  if (!segment) return { content: [{ type: 'text', text: 'Segment not found' }] };
  return { content: [{ type: 'text', text: JSON.stringify(segment, null, 2) }] };
});

server.tool('delete_segment', 'Delete a segment from a timer.', {
  segment_id: z.string().describe('Segment ID'),
}, async ({ segment_id }) => {
  const db = getDb();
  const segment = db.prepare('SELECT * FROM timer_segments WHERE id = ?').get(segment_id);
  if (!segment) return { content: [{ type: 'text', text: 'Segment not found' }] };
  db.prepare('DELETE FROM timer_segments WHERE id = ?').run(segment_id);
  return { content: [{ type: 'text', text: 'Segment deleted' }] };
});

// --- Favorite template tools ---

server.tool('list_favorites', 'List all favorite timer templates.', {}, async () => {
  const db = getDb();
  const favs = favoritesDb.findAll(db);
  if (favs.length === 0) return { content: [{ type: 'text', text: 'No favorites saved' }] };
  return { content: [{ type: 'text', text: JSON.stringify(favs, null, 2) }] };
});

server.tool('create_favorite', 'Save a company/project/task combo as a favorite template.', {
  company_id: z.string().describe('Company ID or slug'),
  project_id: z.string().optional().describe('Project ID or slug'),
  task_id: z.string().optional().describe('Task ID or slug'),
}, async ({ company_id, project_id, task_id }) => {
  const db = getDb();
  const coId = resolveCompany(db, company_id);
  if (!coId) return { content: [{ type: 'text', text: `Company not found: ${company_id}` }] };
  const projId = project_id ? resolveProject(db, project_id) : undefined;
  const tskId = task_id ? resolveTask(db, task_id) : undefined;
  const existing = favoritesDb.findByTemplate(db, coId, projId, tskId);
  if (existing) return { content: [{ type: 'text', text: 'Already a favorite' }] };
  const fav = favoritesDb.create(db, { company_id: coId, project_id: projId, task_id: tskId });
  return { content: [{ type: 'text', text: `Created favorite ${fav.id}` }] };
});

server.tool('delete_favorite', 'Remove a favorite template.', {
  favorite_id: z.string().describe('Favorite template ID'),
}, async ({ favorite_id }) => {
  const db = getDb();
  const ok = favoritesDb.remove(db, favorite_id);
  return { content: [{ type: 'text', text: ok ? 'Favorite removed' : 'Favorite not found' }] };
});

// --- Summary tools ---

server.tool('daily_summary', 'Get a summary of time tracked today or for a specific date.', {
  date: z.string().optional().describe('Date (YYYY-MM-DD, defaults to today)'),
}, async ({ date }) => {
  const db = getDb();
  const dateStr = date ?? ptDate();
  const rows = db.prepare(`
    SELECT t.*, c.name as company_name, p.name as project_name,
           COALESCE(SUM(
             CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
           ), 0) as computed_ms
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE date(t.started) = date(?)
    GROUP BY t.id
    ORDER BY t.started
  `).all(dateStr) as Array<Record<string, unknown>>;

  const totalMs = rows.reduce((sum, r) => sum + ((r.computed_ms as number) ?? 0), 0);
  const totalHrs = (totalMs / 3600000).toFixed(2);

  const lines = rows.map(r => {
    const hrs = ((r.computed_ms as number ?? 0) / 3600000).toFixed(2);
    return `${r.slug} | ${r.company_name} / ${r.project_name ?? '—'} | ${hrs}h | ${r.state} | ${r.notes ?? ''}`;
  });

  return { content: [{ type: 'text', text: `Daily summary for ${dateStr}\nTotal: ${totalHrs}h\n\n${lines.join('\n')}` }] };
});

server.tool('weekly_summary', 'Get a summary of time tracked this week.', {}, async () => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.name as company_name, p.name as project_name,
           COALESCE(SUM(
             CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
           ), 0) as total_ms, COUNT(DISTINCT t.id) as timer_count
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE date(t.started) >= date('now', 'weekday 0', '-7 days')
    GROUP BY t.company_id, t.project_id
    ORDER BY total_ms DESC
  `).all() as Array<Record<string, unknown>>;

  const grandTotal = rows.reduce((sum, r) => sum + ((r.total_ms as number) ?? 0), 0);
  const lines = rows.map(r => {
    const hrs = ((r.total_ms as number ?? 0) / 3600000).toFixed(2);
    return `${r.company_name} / ${r.project_name ?? '—'} | ${hrs}h (${r.timer_count} timers)`;
  });

  return { content: [{ type: 'text', text: `Weekly summary\nTotal: ${(grandTotal / 3600000).toFixed(2)}h\n\n${lines.join('\n')}` }] };
});

server.tool('monthly_summary', 'Get a summary of time tracked this month.', {
  month: z.string().optional().describe('Month (YYYY-MM, defaults to current)'),
}, async ({ month }) => {
  const db = getDb();
  const monthStr = month ?? ptMonth();
  const rows = db.prepare(`
    SELECT c.name as company_name, p.name as project_name,
           COALESCE(SUM(
             CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
           ), 0) as total_ms, COUNT(DISTINCT t.id) as timer_count
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE strftime('%Y-%m', t.started) = ?
    GROUP BY t.company_id, t.project_id
    ORDER BY total_ms DESC
  `).all(monthStr) as Array<Record<string, unknown>>;

  const grandTotal = rows.reduce((sum, r) => sum + ((r.total_ms as number) ?? 0), 0);
  const lines = rows.map(r => {
    const hrs = ((r.total_ms as number ?? 0) / 3600000).toFixed(2);
    return `${r.company_name} / ${r.project_name ?? '—'} | ${hrs}h (${r.timer_count} timers)`;
  });

  return { content: [{ type: 'text', text: `Monthly summary for ${monthStr}\nTotal: ${(grandTotal / 3600000).toFixed(2)}h\n\n${lines.join('\n')}` }] };
});

// --- Cap status ---

server.tool('get_cap_status', 'Get daily/weekly cap progress for all capped projects.', {}, async () => {
  const db = getDb();
  const rows = db.prepare(`
    WITH daily_totals AS (
      SELECT t.project_id, COALESCE(SUM(
        CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
      ), 0) / 3600000.0 AS hrs
      FROM timers t
      JOIN timer_segments ts ON ts.timer_id = t.id
      WHERE date(t.started) = date('now') AND t.project_id IS NOT NULL
      GROUP BY t.project_id
    ),
    weekly_totals AS (
      SELECT t.project_id, COALESCE(SUM(
        CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
      ), 0) / 3600000.0 AS hrs
      FROM timers t
      JOIN timer_segments ts ON ts.timer_id = t.id
      WHERE date(t.started) >= date('now', 'weekday 0', '-7 days') AND t.project_id IS NOT NULL
      GROUP BY t.project_id
    )
    SELECT p.name as project_name, c.name as company_name,
           p.daily_cap_hrs, p.weekly_cap_hrs,
           COALESCE(d.hrs, 0) as daily_used, COALESCE(w.hrs, 0) as weekly_used
    FROM projects p
    JOIN companies c ON c.id = p.company_id
    LEFT JOIN daily_totals d ON d.project_id = p.id
    LEFT JOIN weekly_totals w ON w.project_id = p.id
    WHERE p.daily_cap_hrs IS NOT NULL OR p.weekly_cap_hrs IS NOT NULL
    ORDER BY c.name, p.name
  `).all() as Array<Record<string, unknown>>;

  const lines = rows.map(r => {
    const parts = [`${r.company_name} / ${r.project_name}`];
    if (r.daily_cap_hrs != null) {
      const pct = Math.round(((r.daily_used as number) / (r.daily_cap_hrs as number)) * 100);
      parts.push(`Daily: ${(r.daily_used as number).toFixed(1)}/${r.daily_cap_hrs}h (${pct}%)`);
    }
    if (r.weekly_cap_hrs != null) {
      const pct = Math.round(((r.weekly_used as number) / (r.weekly_cap_hrs as number)) * 100);
      parts.push(`Weekly: ${(r.weekly_used as number).toFixed(1)}/${r.weekly_cap_hrs}h (${pct}%)`);
    }
    return parts.join(' | ');
  });

  return { content: [{ type: 'text', text: lines.length ? lines.join('\n') : 'No capped projects' }] };
});

// --- Config tools ---

server.tool('list_companies', 'List all companies.', {}, async () => {
  const db = getDb();
  return { content: [{ type: 'text', text: JSON.stringify(companiesDb.findAll(db), null, 2) }] };
});

server.tool('create_company', 'Create a new company.', {
  name: z.string().describe('Company name'),
  initials: z.string().optional().describe('Short initials'),
  color: z.string().optional().describe('Hex color'),
}, async (input) => {
  const db = getDb();
  const co = companiesDb.create(db, input);
  return { content: [{ type: 'text', text: `Created company "${co.name}" (${co.id})` }] };
});

server.tool('list_projects', 'List all projects, optionally by company.', {
  company_id: z.string().optional().describe('Filter by company ID or slug'),
}, async ({ company_id }) => {
  const db = getDb();
  const coId = company_id ? resolveCompany(db, company_id) : null;
  const list = coId ? projectsDb.findByCompany(db, coId) : projectsDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
});

server.tool('create_project', 'Create a new project.', {
  company_id: z.string().describe('Company ID or slug'),
  name: z.string().describe('Project name'),
  billable: z.boolean().optional().describe('Is billable (default true)'),
  daily_cap_hrs: z.number().optional().describe('Daily hour cap'),
  weekly_cap_hrs: z.number().optional().describe('Weekly hour cap'),
}, async (input) => {
  const db = getDb();
  const coId = resolveCompany(db, input.company_id);
  if (!coId) return { content: [{ type: 'text', text: `Company not found: ${input.company_id}` }] };
  const proj = projectsDb.create(db, { ...input, company_id: coId });
  return { content: [{ type: 'text', text: `Created project "${proj.name}" (${proj.slug})` }] };
});

server.tool('list_tasks', 'List all tasks, optionally by company or project.', {
  company_id: z.string().optional().describe('Filter by company ID or slug'),
  project_id: z.string().optional().describe('Filter by project ID or slug'),
}, async ({ company_id, project_id }) => {
  const db = getDb();
  let list;
  const projId = project_id ? resolveProject(db, project_id) : null;
  const coId = company_id ? resolveCompany(db, company_id) : null;
  if (projId) list = tasksDb.findByProject(db, projId);
  else if (coId) list = tasksDb.findByCompany(db, coId);
  else list = tasksDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
});

server.tool('create_task', 'Create a new task.', {
  company_id: z.string().describe('Company ID or slug'),
  project_id: z.string().optional().describe('Project ID or slug'),
  name: z.string().describe('Task name'),
  code: z.string().optional().describe('Task code (e.g. JIRA-123)'),
  url: z.string().optional().describe('Task URL'),
}, async (input) => {
  const db = getDb();
  const coId = resolveCompany(db, input.company_id);
  if (!coId) return { content: [{ type: 'text', text: `Company not found: ${input.company_id}` }] };
  const projId = input.project_id ? resolveProject(db, input.project_id) : undefined;
  const task = tasksDb.create(db, { ...input, company_id: coId, project_id: projId });
  return { content: [{ type: 'text', text: `Created task "${task.name}" (${task.slug})` }] };
});

// --- Notification tools ---

server.tool('list_notifications', 'List pending notifications.', {}, async () => {
  const db = getDb();
  return { content: [{ type: 'text', text: JSON.stringify(notificationsDb.findPending(db), null, 2) }] };
});

server.tool('schedule_notification', 'Schedule a notification.', {
  type: z.string().describe('Notification type'),
  title: z.string().describe('Notification title'),
  message: z.string().optional().describe('Notification message'),
  timer_id: z.string().optional().describe('Associated timer ID'),
  trigger_at: z.string().describe('When to trigger (ISO 8601)'),
}, async (input) => {
  const db = getDb();
  const n = notificationsDb.create(db, input);
  return { content: [{ type: 'text', text: `Scheduled notification "${n.title}" for ${n.trigger_at}` }] };
});

server.tool('cancel_notification', 'Cancel an unfired notification.', {
  notification_id: z.string().describe('Notification ID'),
}, async ({ notification_id }) => {
  const db = getDb();
  const ok = notificationsDb.cancel(db, notification_id);
  return { content: [{ type: 'text', text: ok ? 'Notification cancelled' : 'Not found or already fired' }] };
});

// --- Sticky tools (personal notes/todos/reminders/checklists) ---

const stickyTagShape = z.array(z.object({ key: z.string(), value: z.string() }));

server.tool(
  'list_stickies',
  'List personal stickies (notes/todos/reminders), scoped and bounded. Returns global + the given repo scope by default.',
  {
    repo_scope: z.string().optional().describe('Repo key (e.g. "zb-ui"); returns global + this scope. Omit for global+all.'),
    status: z.enum(['open', 'checked', 'archived', 'all']).optional().describe('Default "open" (unchecked, unarchived)'),
    include_children: z.boolean().optional().describe('Nest checklist children under each sticky'),
    limit: z.number().int().optional().describe('Max items (default 50, max 100)'),
  },
  async ({ repo_scope, status, include_children, limit }) => {
    const db = getDb();
    const list = stickiesDb.list(db, { repo_scope, status, include_children, limit });
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  },
);

server.tool(
  'get_session_stickies',
  'Compact SessionStart slice: open stickies due now/overdue (any scope) plus repo-scoped undated todos for the given repo. For per-repo session hooks.',
  {
    repo_scope: z.string().optional().describe('Repo key for the current session'),
    limit: z.number().int().optional().describe('Max items (default 10, max 50)'),
  },
  async ({ repo_scope, limit }) => {
    const db = getDb();
    const slice = stickiesDb.getSessionSlice(db, { repo_scope, limit });
    return { content: [{ type: 'text', text: JSON.stringify(slice, null, 2) }] };
  },
);

server.tool(
  'create_sticky',
  'Create a personal sticky. kind is implicit: no due_at = grab-bag (pull-on-demand); due_at + notify = reminder; otherwise a todo/note. Pass scope to tag it to a repo (omit for global).',
  {
    title: z.string().describe('Sticky title'),
    body: z.string().optional().describe('Markdown body/notes'),
    scope: z.string().optional().describe('Repo key to scope to (e.g. "zb-ui"). Omit for global.'),
    parent_id: z.string().optional().describe('Parent sticky id to make this a checklist child'),
    color: z.string().optional().describe('Color palette key'),
    due_at: z.string().optional().describe('Due datetime (ISO 8601)'),
    notify_enabled: z.boolean().optional().describe('Fire a reminder before due_at'),
    notify_offset_n: z.number().int().optional().describe('Reminder lead amount'),
    notify_offset_unit: z.enum(['min', 'hour', 'day', 'month']).optional().describe('Reminder lead unit'),
    pinned: z.boolean().optional().describe('Pin to top of board'),
    tags: stickyTagShape.optional().describe('Namespaced tags, e.g. [{key:"topic",value:"yoga"}]'),
  },
  async ({ scope, tags, ...rest }) => {
    const db = getDb();
    const allTags = [...(tags ?? [])];
    if (scope && scope !== 'global') allTags.push({ key: 'scope', value: scope });
    const sticky = stickiesDb.create(db, { ...rest, tags: allTags });
    syncStickyReminder(db, sticky);
    return { content: [{ type: 'text', text: JSON.stringify(stickiesDb.findById(db, sticky.id), null, 2) }] };
  },
);

server.tool(
  'update_sticky',
  'Update a sticky. Re-syncs its reminder if timing/notify changed. Pass tags to replace the entire tag set.',
  {
    id: z.string().describe('Sticky id'),
    title: z.string().optional(),
    body: z.string().optional(),
    color: z.string().optional(),
    due_at: z.string().nullable().optional().describe('Due datetime (ISO 8601), or null to clear'),
    notify_enabled: z.boolean().optional(),
    notify_offset_n: z.number().int().nullable().optional(),
    notify_offset_unit: z.enum(['min', 'hour', 'day', 'month']).nullable().optional(),
    pinned: z.boolean().optional(),
    parent_id: z.string().nullable().optional().describe('Reparent under a checklist, or null to detach'),
    tags: stickyTagShape.optional(),
  },
  async ({ id, ...input }) => {
    const db = getDb();
    const sticky = stickiesDb.update(db, id, input);
    if (!sticky) return { content: [{ type: 'text', text: `Sticky not found: ${id}` }] };
    syncStickyReminder(db, sticky);
    return { content: [{ type: 'text', text: JSON.stringify(sticky, null, 2) }] };
  },
);

server.tool('check_sticky', 'Mark a sticky done (auto-checks the parent when all children are done).', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  const sticky = stickiesDb.check(db, id);
  if (!sticky) return { content: [{ type: 'text', text: `Sticky not found: ${id}` }] };
  syncStickyReminder(db, sticky);
  return { content: [{ type: 'text', text: `Checked "${sticky.title}"` }] };
});

server.tool('uncheck_sticky', 'Reopen a checked sticky.', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  const sticky = stickiesDb.uncheck(db, id);
  if (!sticky) return { content: [{ type: 'text', text: `Sticky not found: ${id}` }] };
  syncStickyReminder(db, sticky);
  return { content: [{ type: 'text', text: `Reopened "${sticky.title}"` }] };
});

server.tool('pin_sticky', 'Pin a sticky to the top of the board.', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  const sticky = stickiesDb.pin(db, id);
  return { content: [{ type: 'text', text: sticky ? `Pinned "${sticky.title}"` : `Sticky not found: ${id}` }] };
});

server.tool('unpin_sticky', 'Unpin a sticky.', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  const sticky = stickiesDb.unpin(db, id);
  return { content: [{ type: 'text', text: sticky ? `Unpinned "${sticky.title}"` : `Sticky not found: ${id}` }] };
});

server.tool('archive_sticky', 'Archive a sticky (hidden from the board, kept for history). Cancels its reminder.', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  const sticky = stickiesDb.archive(db, id);
  if (!sticky) return { content: [{ type: 'text', text: `Sticky not found: ${id}` }] };
  syncStickyReminder(db, sticky);
  return { content: [{ type: 'text', text: `Archived "${sticky.title}"` }] };
});

server.tool('unarchive_sticky', 'Restore an archived sticky to the board.', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  const sticky = stickiesDb.unarchive(db, id);
  if (!sticky) return { content: [{ type: 'text', text: `Sticky not found: ${id}` }] };
  syncStickyReminder(db, sticky);
  return { content: [{ type: 'text', text: `Restored "${sticky.title}"` }] };
});

server.tool('reorder_sticky', 'Set a sticky\'s board position among its siblings.', {
  id: z.string().describe('Sticky id'),
  position: z.number().describe('New position (fractional inserts allowed)'),
}, async ({ id, position }) => {
  const db = getDb();
  const sticky = stickiesDb.reorder(db, id, position);
  return { content: [{ type: 'text', text: sticky ? `Reordered "${sticky.title}"` : `Sticky not found: ${id}` }] };
});

server.tool('delete_sticky', 'Permanently delete a sticky (and its checklist children). Use archive to keep history.', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  cancelStickyReminder(db, id);
  const ok = stickiesDb.remove(db, id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : `Sticky not found: ${id}` }] };
});

server.tool('make_checklist', 'Gather existing stickies under a parent, turning it into a checklist.', {
  parent_id: z.string().describe('Parent sticky id'),
  child_ids: z.array(z.string()).describe('Sticky ids to nest under the parent'),
}, async ({ parent_id, child_ids }) => {
  const db = getDb();
  const parent = stickiesDb.makeChecklist(db, parent_id, child_ids);
  if (!parent) return { content: [{ type: 'text', text: `Parent not found: ${parent_id}` }] };
  return { content: [{ type: 'text', text: JSON.stringify(stickiesDb.findById(db, parent_id), null, 2) }] };
});

server.tool('detach_sticky', 'Break a sticky out of its checklist (back to top-level).', {
  id: z.string().describe('Sticky id'),
}, async ({ id }) => {
  const db = getDb();
  const sticky = stickiesDb.detach(db, id);
  return { content: [{ type: 'text', text: sticky ? `Detached "${sticky.title}"` : `Sticky not found: ${id}` }] };
});

server.tool('set_sticky_tags', 'Replace a sticky\'s entire tag set.', {
  id: z.string().describe('Sticky id'),
  tags: stickyTagShape.describe('Full namespaced tag set'),
}, async ({ id, tags }) => {
  const db = getDb();
  const sticky = stickiesDb.setTags(db, id, tags);
  return { content: [{ type: 'text', text: sticky ? JSON.stringify(sticky.tags, null, 2) : `Sticky not found: ${id}` }] };
});

server.tool('add_sticky_tag', 'Add one namespaced tag to a sticky.', {
  id: z.string().describe('Sticky id'),
  key: z.string().describe('Tag key (e.g. "scope", "topic")'),
  value: z.string().describe('Tag value (e.g. "zb-ui", "yoga")'),
}, async ({ id, key, value }) => {
  const db = getDb();
  const sticky = stickiesDb.addTag(db, id, key, value);
  return { content: [{ type: 'text', text: sticky ? JSON.stringify(sticky.tags, null, 2) : `Sticky not found: ${id}` }] };
});

server.tool('remove_sticky_tag', 'Remove one namespaced tag from a sticky.', {
  id: z.string().describe('Sticky id'),
  key: z.string().describe('Tag key'),
  value: z.string().describe('Tag value'),
}, async ({ id, key, value }) => {
  const db = getDb();
  const sticky = stickiesDb.removeTag(db, id, key, value);
  return { content: [{ type: 'text', text: sticky ? JSON.stringify(sticky.tags, null, 2) : `Sticky not found: ${id}` }] };
});

server.tool('grab_sticky', 'Pull one random open, undated grab-bag sticky to knock off (global or repo-scoped).', {
  repo_scope: z.string().optional().describe('Repo key to include alongside global'),
}, async ({ repo_scope }) => {
  const db = getDb();
  const sticky = stickiesDb.grab(db, repo_scope);
  return { content: [{ type: 'text', text: sticky ? JSON.stringify(sticky, null, 2) : 'Grab bag is empty.' }] };
});

// --- Recurring timer tools ---

server.tool('list_recurring_timers', 'List recurring timers.', {
  active_only: z.boolean().optional().describe('Only show active (default true)'),
}, async ({ active_only }) => {
  const db = getDb();
  const list = active_only !== false ? recurringDb.findActive(db) : recurringDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
});

server.tool('create_recurring_timer', 'Create a recurring timer.', {
  company_id: z.string().describe('Company ID or slug'),
  project_id: z.string().optional().describe('Project ID or slug'),
  task_id: z.string().optional().describe('Task ID or slug'),
  pattern: z.enum(['daily', 'weekdays', 'weekly']).describe('Recurrence pattern: daily (every day), weekdays (Mon-Fri), weekly (specific day)'),
  weekday: z.number().optional().describe('Day of week (0=Sun, 6=Sat) for weekly'),
  start_time: z.string().optional().describe('Start time (HH:MM)'),
  start_date: z.string().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  notes: z.string().optional().describe('Notes'),
}, async (input) => {
  const db = getDb();
  const coId = resolveCompany(db, input.company_id);
  if (!coId) return { content: [{ type: 'text', text: `Company not found: ${input.company_id}` }] };
  const projId = input.project_id ? resolveProject(db, input.project_id) : undefined;
  const tskId = input.task_id ? resolveTask(db, input.task_id) : undefined;
  const rec = recurringDb.create(db, { ...input, company_id: coId, project_id: projId, task_id: tskId });
  return { content: [{ type: 'text', text: `Created ${rec.pattern} recurring timer (${rec.id})` }] };
});

server.tool('delete_recurring_timer', 'Delete a recurring timer.', {
  recurring_id: z.string().describe('Recurring timer ID'),
}, async ({ recurring_id }) => {
  const db = getDb();
  const ok = recurringDb.remove(db, recurring_id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
});

server.tool('skip_recurring_timer', 'Skip an occurrence of a recurring timer on a specific date. If the timer was already running, it is zeroed out and a replacement timer starts at the original start time (ZeroBias UI General Development if its daily cap is not hit, else W3Geekery SME Mart General Development).', {
  recurring_id: z.string().describe('Recurring timer ID'),
  date: z.string().describe('Date to skip (YYYY-MM-DD)'),
}, async ({ recurring_id, date }) => {
  const db = getDb();
  const result = recurringDb.skipOccurrence(db, recurring_id, date);
  if (!result) return { content: [{ type: 'text', text: 'Not found' }] };
  const parts = [`Skipped ${date}`];
  if (result.skippedTimer) parts.push(`zeroed timer ${result.skippedTimer.slug ?? result.skippedTimer.id}`);
  if (result.replacementTimer) parts.push(`started replacement ${result.replacementTimer.slug ?? result.replacementTimer.id}`);
  return { content: [{ type: 'text', text: parts.join('; ') }] };
});

server.tool('skip_timer', 'Skip an occurrence of a recurring timer identified by its timer slug (e.g. 260417-3). Resolves the timer to its parent recurring and today\'s Pacific date, then calls skip_recurring_timer with the same semantics.', {
  slug: z.string().describe('Timer slug (e.g. 260417-3)'),
}, async ({ slug }) => {
  const db = getDb();
  const timer = timersDb.findBySlug(db, slug);
  if (!timer) return { content: [{ type: 'text', text: `Timer not found for slug ${slug}` }] };
  if (!timer.recurring_id) return { content: [{ type: 'text', text: `Timer ${slug} is not a recurring timer; cannot skip` }] };
  const ref = timer.started ?? timer.created_at;
  const date = new Date(ref).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const result = recurringDb.skipOccurrence(db, timer.recurring_id, date);
  if (!result) return { content: [{ type: 'text', text: 'Recurring parent not found' }] };
  const parts = [`Skipped ${slug} for ${date}`];
  if (result.replacementTimer) parts.push(`replacement ${result.replacementTimer.slug ?? result.replacementTimer.id} started at ${result.replacementTimer.started}`);
  return { content: [{ type: 'text', text: parts.join('; ') }] };
});

server.tool('unskip_recurring_timer', 'Remove a skip for a recurring timer.', {
  recurring_id: z.string().describe('Recurring timer ID'),
  date: z.string().describe('Date to unskip (YYYY-MM-DD)'),
}, async ({ recurring_id, date }) => {
  const db = getDb();
  const rec = recurringDb.unskipDate(db, recurring_id, date);
  if (!rec) return { content: [{ type: 'text', text: 'Not found' }] };
  return { content: [{ type: 'text', text: `Unskipped ${date}` }] };
});

// --- Invoice report ---

server.tool('invoice_report', 'Generate invoice data for a company/project over a date range.', {
  company_id: z.string().describe('Company ID or slug'),
  project_id: z.string().optional().describe('Project ID (all projects if omitted)'),
  start_date: z.string().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().describe('End date (YYYY-MM-DD)'),
}, async ({ company_id, project_id, start_date, end_date }) => {
  const db = getDb();
  const params: unknown[] = [company_id, start_date, end_date];
  let projectFilter = '';
  if (project_id) {
    projectFilter = 'AND t.project_id = ?';
    params.push(project_id);
  }

  const rows = db.prepare(`
    SELECT t.*, c.name as company_name, p.name as project_name, tk.name as task_name,
           COALESCE(SUM(
             CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
           ), 0) as computed_ms
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks tk ON tk.id = t.task_id
    LEFT JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE t.company_id = ? AND date(t.started) >= date(?) AND date(t.started) <= date(?)
    ${projectFilter}
    GROUP BY t.id
    ORDER BY t.started
  `).all(...params) as Array<Record<string, unknown>>;

  const totalMs = rows.reduce((sum, r) => sum + ((r.computed_ms as number) ?? 0), 0);
  const totalHrs = (totalMs / 3600000).toFixed(2);

  const lines = rows.map(r => {
    const hrs = ((r.computed_ms as number ?? 0) / 3600000).toFixed(2);
    const date = (r.started as string)?.slice(0, 10) ?? '—';
    return `${date} | ${r.slug} | ${r.project_name ?? '—'} | ${r.task_name ?? '—'} | ${hrs}h | ${r.notes ?? ''}`;
  });

  return { content: [{ type: 'text', text: `Invoice: ${start_date} to ${end_date}\nTotal: ${totalHrs}h\n\n${lines.join('\n')}` }] };
});

// --- Missing config CRUD tools ---

server.tool('update_company', 'Update a company.', {
  company_id: z.string().describe('Company ID or slug'),
  name: z.string().optional().describe('New name'),
  initials: z.string().optional().describe('New initials'),
  color: z.string().optional().describe('New hex color'),
}, async ({ company_id, ...updates }) => {
  const db = getDb();
  const co = companiesDb.update(db, company_id, updates);
  if (!co) return { content: [{ type: 'text', text: 'Company not found' }] };
  return { content: [{ type: 'text', text: `Updated company "${co.name}"` }] };
});

server.tool('delete_company', 'Delete a company.', {
  company_id: z.string().describe('Company ID or slug'),
}, async ({ company_id }) => {
  const db = getDb();
  const ok = companiesDb.remove(db, company_id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Company not found' }] };
});

server.tool('update_project', 'Update a project.', {
  project_id: z.string().describe('Project ID or slug'),
  name: z.string().optional().describe('New name'),
  color: z.string().optional().describe('New hex color'),
  billable: z.boolean().optional().describe('Is billable'),
  daily_cap_hrs: z.number().nullable().optional().describe('Daily hour cap (null to remove)'),
  weekly_cap_hrs: z.number().nullable().optional().describe('Weekly hour cap (null to remove)'),
  notify_on_cap: z.boolean().optional().describe('Notify when cap reached'),
  sort_order: z.number().optional().describe('Sort order'),
}, async ({ project_id, ...updates }) => {
  const db = getDb();
  const proj = projectsDb.update(db, project_id, updates);
  if (!proj) return { content: [{ type: 'text', text: 'Project not found' }] };
  return { content: [{ type: 'text', text: `Updated project "${proj.name}"` }] };
});

server.tool('delete_project', 'Delete a project.', {
  project_id: z.string().describe('Project ID or slug'),
}, async ({ project_id }) => {
  const db = getDb();
  const ok = projectsDb.remove(db, project_id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Project not found' }] };
});

server.tool('update_task', 'Update a task.', {
  task_id: z.string().describe('Task ID or slug'),
  name: z.string().optional().describe('New name'),
  code: z.string().optional().describe('New code'),
  url: z.string().optional().describe('New URL'),
}, async ({ task_id, ...updates }) => {
  const db = getDb();
  const task = tasksDb.update(db, task_id, updates);
  if (!task) return { content: [{ type: 'text', text: 'Task not found' }] };
  return { content: [{ type: 'text', text: `Updated task "${task.name}"` }] };
});

server.tool('delete_task', 'Delete a task.', {
  task_id: z.string().describe('Task ID or slug'),
}, async ({ task_id }) => {
  const db = getDb();
  const ok = tasksDb.remove(db, task_id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Task not found' }] };
});

// --- Missing timer tools ---

server.tool('cancel_timer', 'Cancel a running/paused timer without recording duration.', {
  timer_id: z.string().optional().describe('Timer ID (omit to cancel the running timer)'),
}, async ({ timer_id }) => {
  const db = getDb();
  const id = timer_id ?? timersDb.findRunning(db)?.id;
  if (!id) return { content: [{ type: 'text', text: 'No running timer to cancel' }] };
  const ok = timersDb.remove(db, id);
  return { content: [{ type: 'text', text: ok ? 'Timer cancelled (deleted)' : 'Timer not found' }] };
});

server.tool('schedule_timer', 'Schedule a timer to start at a future time.', {
  company_id: z.string().describe('Company ID or slug'),
  project_id: z.string().optional().describe('Project ID or slug'),
  task_id: z.string().optional().describe('Task ID or slug'),
  start_at: z.string().describe('Scheduled start time (ISO 8601)'),
  stop_at: z.string().optional().describe('Scheduled stop time (ISO 8601)'),
  notes: z.string().optional().describe('Notes'),
}, async (input) => {
  const db = getDb();
  const timer = timersDb.create(db, {
    company_id: input.company_id,
    project_id: input.project_id,
    task_id: input.task_id,
    start_at: input.start_at,
    stop_at: input.stop_at,
    notes: input.notes,
  });
  return { content: [{ type: 'text', text: `Scheduled timer ${timer.slug} for ${input.start_at}` }] };
});

server.tool('list_weekly_tasks', 'List tasks used this week with hours.', {}, async () => {
  const db = getDb();
  // Calculate Monday of current week in PT
  const today = ptDate();
  const d = new Date(today + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  const weekStart = d.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT tk.name as task_name, tk.code as task_code, tk.url as task_url,
           c.name as company_name, p.name as project_name,
           COALESCE(SUM(
             CAST((julianday(COALESCE(ts.ended, datetime('now'))) - julianday(ts.started)) * 86400000 AS INTEGER)
           ), 0) as total_ms, COUNT(DISTINCT t.id) as timer_count
    FROM timers t
    JOIN tasks tk ON tk.id = t.task_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN timer_segments ts ON ts.timer_id = t.id
    WHERE substr(t.started, 1, 10) >= ?
      AND t.task_id IS NOT NULL
    GROUP BY t.task_id
    ORDER BY total_ms DESC
  `).all(weekStart) as Array<Record<string, unknown>>;

  const lines = rows.map(r => {
    const hrs = ((r.total_ms as number ?? 0) / 3600000).toFixed(2);
    const code = r.task_code ? `[${r.task_code}]` : '';
    return `${r.company_name} / ${r.project_name} / ${r.task_name} ${code} | ${hrs}h (${r.timer_count})`;
  });

  // Also show assigned weekly tasks
  const assigned = weeklyTasksDb.findByWeek(db, weekStart);
  if (assigned.length) {
    lines.push('', '--- Weekly Task Assignments ---');
    for (const wt of assigned) {
      lines.push(`${wt.company}: ${wt.zb_task_name ?? wt.zb_task_id} ${wt.zb_task_code ? `[${wt.zb_task_code}]` : ''}`);
    }
  }

  return { content: [{ type: 'text', text: lines.length ? lines.join('\n') : 'No tasks this week' }] };
});

server.tool('upsert_weekly_task', 'Assign a ZeroBias task for a company for the week.', {
  week_start: z.string().describe('Monday date (YYYY-MM-DD)'),
  company: z.string().describe('Company name (e.g. ZeroBias, W3Geekery)'),
  zb_task_id: z.string().describe('ZeroBias task ID'),
  zb_task_code: z.string().optional().describe('Task code'),
  zb_task_name: z.string().optional().describe('Task name'),
  period_start: z.string().optional().describe('Invoice half-month this task bills to (YYYY-MM-01 or YYYY-MM-16). Required on split weeks; otherwise derived from week_start.'),
}, async ({ week_start, company, zb_task_id, zb_task_code, zb_task_name, period_start }) => {
  const db = getDb();
  let resolvedPeriod = period_start;
  if (!resolvedPeriod) {
    if (weeklyTasksDb.isSplitWeek(week_start)) {
      return { content: [{ type: 'text' as const, text: `Week of ${week_start} is a split week (straddles a 1st/16th invoice boundary). Pass period_start explicitly (YYYY-MM-01 or YYYY-MM-16).` }], isError: true };
    }
    resolvedPeriod = weeklyTasksDb.derivePeriodStart(week_start);
  }
  weeklyTasksDb.upsert(db, { week_start, company, period_start: resolvedPeriod, zb_task_id, zb_task_code: zb_task_code ?? null, zb_task_name: zb_task_name ?? null });
  return { content: [{ type: 'text' as const, text: `Assigned ${zb_task_name ?? zb_task_id} for ${company} week of ${week_start} (period ${resolvedPeriod})` }] };
});

// --- Timeline settings ---

server.tool('get_timeline_settings', 'Get notification timeline display settings.', {}, async () => {
  const db = getDb();
  // Store timeline settings as a notification-type row or simple key-value
  // For now return sensible defaults
  return { content: [{ type: 'text', text: JSON.stringify({ start_hour: 6, end_hour: 22 }) }] };
});

server.tool('set_timeline_hours', 'Set the timeline display hour range.', {
  start_hour: z.number().describe('Start hour (0-23)'),
  end_hour: z.number().describe('End hour (0-23)'),
}, async ({ start_hour, end_hour }) => {
  // Timeline settings will be stored in a future settings table
  return { content: [{ type: 'text', text: `Timeline set to ${start_hour}:00 — ${end_hour}:00` }] };
});

// --- SpecStory Sessions ---

server.tool('list_sessions', 'List cached SpecStory sessions by date, date range, or repo.', {
  date: z.string().optional().describe('Single date (YYYY-MM-DD)'),
  date_from: z.string().optional().describe('Range start (YYYY-MM-DD)'),
  date_to: z.string().optional().describe('Range end (YYYY-MM-DD)'),
  repo: z.string().optional().describe('Filter by repo name'),
}, async ({ date, date_from, date_to, repo }) => {
  const db = getDb(config.db);
  let sessions;
  if (date) {
    sessions = specstoryDb.findByDate(db, date);
  } else if (date_from && date_to) {
    sessions = specstoryDb.findByDateRange(db, date_from, date_to);
  } else if (repo) {
    sessions = specstoryDb.findByRepo(db, repo);
  } else {
    // Default: today
    const today = ptDate();
    sessions = specstoryDb.findByDate(db, today);
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(sessions, null, 2) }] };
});

server.tool('list_session_events', 'List cached SpecStory events (timestamped messages, commits, recaps) by date or range. Use for backfill — events are date-scoped, not session-scoped.', {
  date: z.string().optional().describe('Single date (YYYY-MM-DD)'),
  date_from: z.string().optional().describe('Range start (YYYY-MM-DD)'),
  date_to: z.string().optional().describe('Range end (YYYY-MM-DD)'),
}, async ({ date, date_from, date_to }) => {
  const db = getDb(config.db);
  let events;
  if (date) {
    events = specstoryDb.findEventsByDate(db, date);
  } else if (date_from && date_to) {
    events = specstoryDb.findEventsByDateRange(db, date_from, date_to);
  } else {
    events = specstoryDb.findEventsByDate(db, ptDate());
  }
  if (events.length === 0) return { content: [{ type: 'text' as const, text: 'No events found for this date' }] };
  return { content: [{ type: 'text' as const, text: JSON.stringify(events, null, 2) }] };
});

server.tool('daily_digest', 'Get a backfill-optimized daily summary. Returns timer-aligned slots with recaps, PRs, commit summaries, AND a deduped sample of user-message intent per slot (message_count + messages) so un-recapped, message-only work is never invisible.', {
  date: z.string().optional().describe('Date (YYYY-MM-DD, defaults to today)'),
}, async ({ date }) => {
  const db = getDb(config.db);
  const dateStr = date ?? ptDate();

  // Get enriched timers for slot boundaries
  const rawTimers = timersDb.findByDate(db, dateStr) as unknown as Array<Record<string, unknown>>;
  const enriched = enrichTimers(rawTimers);
  const timerSlots = enriched
    .filter(t => t.started && t.ended && (t.started as string) !== (t.ended as string))
    .map(t => ({
      slug: (t.slug as string) ?? '',
      started: t.started as string,
      ended: t.ended as string,
      company_name: (t.company_name as string) ?? '',
      project_name: (t.project_name as string) ?? '',
      task_name: (t.task_name as string) ?? '',
    }));

  // Get high-signal events (recaps, PRs, commits with truncated content)
  const events = specstoryDb.findDigestEventsByDate(db, dateStr);

  const digest = specstoryDb.buildDailyDigest(dateStr, timerSlots, events);
  return { content: [{ type: 'text' as const, text: JSON.stringify(digest, null, 2) }] };
});

server.tool('scan_sessions', 'Run the SpecStory scanner for a date/range and cache results to SQLite.', {
  date: z.string().describe('Date or period: YYYY-MM-DD, today, yesterday, week, last-week'),
  end_date: z.string().optional().describe('End date for range (YYYY-MM-DD)'),
}, async ({ date, end_date }) => {
  const { execSync } = await import('node:child_process');
  const args = end_date ? `${date} ${end_date}` : date;
  try {
    const output = execSync(
      `python3 ~/.claude/timetracker/specstory-scan.py ${args}`,
      { timeout: 60000, encoding: 'utf-8' },
    );
    return { content: [{ type: 'text' as const, text: output }] };
  } catch (err: unknown) {
    return { content: [{ type: 'text' as const, text: `Scan failed: ${err instanceof Error ? err.message : err}` }] };
  }
});

// --- Dev Server Management ---

server.tool('server_status', 'Check if the tt dev server (API + UI) is running. Reads heartbeat from state.json.', {}, async () => {
  const statePath = resolve(homedir(), '.tt', 'state.json');
  try {
    const raw = readFileSync(statePath, 'utf-8');
    const state = JSON.parse(raw);
    const hb = state.server?.heartbeat;
    const age = hb ? Math.round((Date.now() - new Date(hb).getTime()) / 1000) : null;
    const fresh = age !== null && age < 60;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: fresh ? 'running' : 'stopped',
          api_up: fresh && (state.server?.api_up ?? false),
          ui_up: fresh && (state.server?.ui_up ?? false),
          pid: state.server?.pid ?? null,
          heartbeat: hb ?? null,
          heartbeat_age_sec: age,
        }, null, 2),
      }],
    };
  } catch {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'stopped', api_up: false, ui_up: false }) }] };
  }
});

server.tool('server_start', 'Start the tt dev server (Express API + Angular UI).', {}, async () => {
  const { execSync } = await import('node:child_process');
  try {
    execSync('bash /Users/cstacer/Projects/w3geekery/tt/scripts/dev-server.sh start', { timeout: 35000 });
    return { content: [{ type: 'text' as const, text: 'Dev server started. Check server_status for details.' }] };
  } catch (err: unknown) {
    return { content: [{ type: 'text' as const, text: `Failed to start: ${err instanceof Error ? err.message : err}` }] };
  }
});

server.tool('server_stop', 'Stop the tt dev server.', {}, async () => {
  const { execSync } = await import('node:child_process');
  try {
    execSync('bash /Users/cstacer/Projects/w3geekery/tt/scripts/dev-server.sh stop', { timeout: 10000 });
    return { content: [{ type: 'text' as const, text: 'Dev server stopped.' }] };
  } catch (err: unknown) {
    return { content: [{ type: 'text' as const, text: `Failed to stop: ${err instanceof Error ? err.message : err}` }] };
  }
});

server.tool('server_restart', 'Restart the tt dev server (kills stale processes, starts fresh).', {}, async () => {
  const { execSync } = await import('node:child_process');
  try {
    execSync('bash /Users/cstacer/Projects/w3geekery/tt/scripts/dev-server.sh restart', { timeout: 40000 });
    return { content: [{ type: 'text' as const, text: 'Dev server restarted. Check server_status for details.' }] };
  } catch (err: unknown) {
    return { content: [{ type: 'text' as const, text: `Failed to restart: ${err instanceof Error ? err.message : err}` }] };
  }
});

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);

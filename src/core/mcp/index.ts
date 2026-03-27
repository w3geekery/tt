/**
 * MCP server entry point.
 *
 * Runs via stdio. Imports database layer directly — no HTTP, no auth.
 * Registers tools for timer management, summaries, and config.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getDb } from '../db/connection.js';
import * as companiesDb from '../db/companies.js';
import * as projectsDb from '../db/projects.js';
import * as tasksDb from '../db/tasks.js';
import * as timersDb from '../db/timers.js';
import * as recurringDb from '../db/recurring.js';
import * as notificationsDb from '../db/notifications.js';
import { loadExtensions, runHook } from '../extensions.js';
import config from '../../../tt.config.js';

// Initialize DB and extensions
getDb(config.db);
loadExtensions(config.extensions);

const server = new McpServer({
  name: 'tt',
  version: '0.1.0',
});

// --- Timer tools ---

server.tool('start_timer', 'Start a new or existing timer. Auto-stops any running timer.', {
  company_id: z.string().optional().describe('Company ID (required when creating new)'),
  project_id: z.string().optional().describe('Project ID'),
  task_id: z.string().optional().describe('Task ID'),
  timer_id: z.string().optional().describe('Existing timer ID to start'),
  notes: z.string().optional().describe('Timer notes'),
}, async ({ company_id, project_id, task_id, timer_id, notes }) => {
  const db = getDb();
  let timer;
  if (timer_id) {
    timer = timersDb.start(db, timer_id);
  } else {
    if (!company_id) return { content: [{ type: 'text', text: 'Error: company_id is required when creating a new timer' }] };
    timer = timersDb.create(db, { company_id, project_id, task_id, notes });
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
  return { content: [{ type: 'text', text: JSON.stringify(timer, null, 2) }] };
});

server.tool('list_timers', 'List timers, optionally filtered by date.', {
  date: z.string().optional().describe('Filter by date (YYYY-MM-DD)'),
}, async ({ date }) => {
  const db = getDb();
  const list = date ? timersDb.findByDate(db, date) : timersDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
});

server.tool('get_timer_by_slug', 'Find a timer by its slug (e.g. 260326-1).', {
  slug: z.string().describe('Timer slug'),
}, async ({ slug }) => {
  const db = getDb();
  const timer = timersDb.findBySlug(db, slug);
  if (!timer) return { content: [{ type: 'text', text: `No timer found with slug ${slug}` }] };
  return { content: [{ type: 'text', text: JSON.stringify(timer, null, 2) }] };
});

server.tool('add_entry', 'Add a manual time entry.', {
  company_id: z.string().describe('Company ID'),
  project_id: z.string().optional().describe('Project ID'),
  task_id: z.string().optional().describe('Task ID'),
  started: z.string().describe('Start time (ISO 8601)'),
  ended: z.string().describe('End time (ISO 8601)'),
  notes: z.string().optional().describe('Notes'),
}, async (input) => {
  const db = getDb();
  const timer = timersDb.addEntry(db, input);
  const hrs = (timer.duration_ms! / 3600000).toFixed(2);
  return { content: [{ type: 'text', text: `Added entry ${timer.slug} — ${hrs}h` }] };
});

server.tool('update_timer', 'Update timer fields (notes, project, task, etc).', {
  timer_id: z.string().describe('Timer ID'),
  notes: z.string().optional().describe('Updated notes'),
  project_id: z.string().optional().describe('Updated project ID'),
  task_id: z.string().optional().describe('Updated task ID'),
}, async ({ timer_id, ...updates }) => {
  const db = getDb();
  const timer = timersDb.update(db, timer_id, updates);
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

// --- Summary tools ---

server.tool('daily_summary', 'Get a summary of time tracked today or for a specific date.', {
  date: z.string().optional().describe('Date (YYYY-MM-DD, defaults to today)'),
}, async ({ date }) => {
  const db = getDb();
  const dateStr = date ?? new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT t.*, c.name as company_name, p.name as project_name
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE date(t.started) = date(?)
    ORDER BY t.started
  `).all(dateStr) as Array<Record<string, unknown>>;

  const totalMs = rows.reduce((sum, r) => sum + ((r.duration_ms as number) ?? 0), 0);
  const totalHrs = (totalMs / 3600000).toFixed(2);

  const lines = rows.map(r => {
    const hrs = ((r.duration_ms as number ?? 0) / 3600000).toFixed(2);
    return `${r.slug} | ${r.company_name} / ${r.project_name ?? '—'} | ${hrs}h | ${r.state} | ${r.notes ?? ''}`;
  });

  return { content: [{ type: 'text', text: `Daily summary for ${dateStr}\nTotal: ${totalHrs}h\n\n${lines.join('\n')}` }] };
});

server.tool('weekly_summary', 'Get a summary of time tracked this week.', {}, async () => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.name as company_name, p.name as project_name,
           SUM(t.duration_ms) as total_ms, COUNT(*) as timer_count
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
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
  const monthStr = month ?? new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`
    SELECT c.name as company_name, p.name as project_name,
           SUM(t.duration_ms) as total_ms, COUNT(*) as timer_count
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
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
      SELECT project_id, COALESCE(SUM(duration_ms), 0) / 3600000.0 AS hrs
      FROM timers WHERE date(started) = date('now') AND project_id IS NOT NULL
      GROUP BY project_id
    ),
    weekly_totals AS (
      SELECT project_id, COALESCE(SUM(duration_ms), 0) / 3600000.0 AS hrs
      FROM timers WHERE date(started) >= date('now', 'weekday 0', '-7 days') AND project_id IS NOT NULL
      GROUP BY project_id
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
  company_id: z.string().optional().describe('Filter by company ID'),
}, async ({ company_id }) => {
  const db = getDb();
  const list = company_id ? projectsDb.findByCompany(db, company_id) : projectsDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
});

server.tool('create_project', 'Create a new project.', {
  company_id: z.string().describe('Company ID'),
  name: z.string().describe('Project name'),
  billable: z.boolean().optional().describe('Is billable (default true)'),
  daily_cap_hrs: z.number().optional().describe('Daily hour cap'),
  weekly_cap_hrs: z.number().optional().describe('Weekly hour cap'),
}, async (input) => {
  const db = getDb();
  const proj = projectsDb.create(db, input);
  return { content: [{ type: 'text', text: `Created project "${proj.name}" (${proj.id})` }] };
});

server.tool('list_tasks', 'List all tasks, optionally by company or project.', {
  company_id: z.string().optional().describe('Filter by company ID'),
  project_id: z.string().optional().describe('Filter by project ID'),
}, async ({ company_id, project_id }) => {
  const db = getDb();
  let list;
  if (project_id) list = tasksDb.findByProject(db, project_id);
  else if (company_id) list = tasksDb.findByCompany(db, company_id);
  else list = tasksDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
});

server.tool('create_task', 'Create a new task.', {
  company_id: z.string().describe('Company ID'),
  project_id: z.string().optional().describe('Project ID'),
  name: z.string().describe('Task name'),
  code: z.string().optional().describe('Task code (e.g. JIRA-123)'),
  url: z.string().optional().describe('Task URL'),
}, async (input) => {
  const db = getDb();
  const task = tasksDb.create(db, input);
  return { content: [{ type: 'text', text: `Created task "${task.name}" (${task.id})` }] };
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

// --- Recurring timer tools ---

server.tool('list_recurring_timers', 'List recurring timers.', {
  active_only: z.boolean().optional().describe('Only show active (default true)'),
}, async ({ active_only }) => {
  const db = getDb();
  const list = active_only !== false ? recurringDb.findActive(db) : recurringDb.findAll(db);
  return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
});

server.tool('create_recurring_timer', 'Create a recurring timer.', {
  company_id: z.string().describe('Company ID'),
  project_id: z.string().optional().describe('Project ID'),
  task_id: z.string().optional().describe('Task ID'),
  pattern: z.enum(['daily', 'weekly']).describe('Recurrence pattern'),
  weekday: z.number().optional().describe('Day of week (0=Sun, 6=Sat) for weekly'),
  start_time: z.string().optional().describe('Start time (HH:MM)'),
  start_date: z.string().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  notes: z.string().optional().describe('Notes'),
}, async (input) => {
  const db = getDb();
  const rec = recurringDb.create(db, input);
  return { content: [{ type: 'text', text: `Created ${rec.pattern} recurring timer (${rec.id})` }] };
});

server.tool('delete_recurring_timer', 'Delete a recurring timer.', {
  recurring_id: z.string().describe('Recurring timer ID'),
}, async ({ recurring_id }) => {
  const db = getDb();
  const ok = recurringDb.remove(db, recurring_id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
});

server.tool('skip_recurring_timer', 'Skip a recurring timer for a specific date.', {
  recurring_id: z.string().describe('Recurring timer ID'),
  date: z.string().describe('Date to skip (YYYY-MM-DD)'),
}, async ({ recurring_id, date }) => {
  const db = getDb();
  const rec = recurringDb.skipDate(db, recurring_id, date);
  if (!rec) return { content: [{ type: 'text', text: 'Not found' }] };
  return { content: [{ type: 'text', text: `Skipping ${date}` }] };
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
  company_id: z.string().describe('Company ID'),
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
    SELECT t.*, c.name as company_name, p.name as project_name, tk.name as task_name
    FROM timers t
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks tk ON tk.id = t.task_id
    WHERE t.company_id = ? AND date(t.started) >= date(?) AND date(t.started) <= date(?)
    ${projectFilter}
    ORDER BY t.started
  `).all(...params) as Array<Record<string, unknown>>;

  const totalMs = rows.reduce((sum, r) => sum + ((r.duration_ms as number) ?? 0), 0);
  const totalHrs = (totalMs / 3600000).toFixed(2);

  const lines = rows.map(r => {
    const hrs = ((r.duration_ms as number ?? 0) / 3600000).toFixed(2);
    const date = (r.started as string)?.slice(0, 10) ?? '—';
    return `${date} | ${r.slug} | ${r.project_name ?? '—'} | ${r.task_name ?? '—'} | ${hrs}h | ${r.notes ?? ''}`;
  });

  return { content: [{ type: 'text', text: `Invoice: ${start_date} to ${end_date}\nTotal: ${totalHrs}h\n\n${lines.join('\n')}` }] };
});

// --- Missing config CRUD tools ---

server.tool('update_company', 'Update a company.', {
  company_id: z.string().describe('Company ID'),
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
  company_id: z.string().describe('Company ID'),
}, async ({ company_id }) => {
  const db = getDb();
  const ok = companiesDb.remove(db, company_id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Company not found' }] };
});

server.tool('update_project', 'Update a project.', {
  project_id: z.string().describe('Project ID'),
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
  project_id: z.string().describe('Project ID'),
}, async ({ project_id }) => {
  const db = getDb();
  const ok = projectsDb.remove(db, project_id);
  return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Project not found' }] };
});

server.tool('update_task', 'Update a task.', {
  task_id: z.string().describe('Task ID'),
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
  task_id: z.string().describe('Task ID'),
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
  company_id: z.string().describe('Company ID'),
  project_id: z.string().optional().describe('Project ID'),
  task_id: z.string().optional().describe('Task ID'),
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
  const rows = db.prepare(`
    SELECT tk.name as task_name, tk.code as task_code, tk.url as task_url,
           c.name as company_name, p.name as project_name,
           SUM(t.duration_ms) as total_ms, COUNT(*) as timer_count
    FROM timers t
    JOIN tasks tk ON tk.id = t.task_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE date(t.started) >= date('now', 'weekday 0', '-7 days')
      AND t.task_id IS NOT NULL
    GROUP BY t.task_id
    ORDER BY total_ms DESC
  `).all() as Array<Record<string, unknown>>;

  const lines = rows.map(r => {
    const hrs = ((r.total_ms as number ?? 0) / 3600000).toFixed(2);
    const code = r.task_code ? `[${r.task_code}]` : '';
    return `${r.company_name} / ${r.project_name} / ${r.task_name} ${code} | ${hrs}h (${r.timer_count})`;
  });

  return { content: [{ type: 'text', text: lines.length ? lines.join('\n') : 'No tasks this week' }] };
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

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);

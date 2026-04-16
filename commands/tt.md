# tt — Time Tracker

Manage Clark's time tracking via MCP tools backed by local SQLite.

> **IMPORTANT:** Before performing any date/time actions, check the current date/time (e.g., `date`) to ensure you are using real time, not training data.

## Arguments

`$ARGUMENTS`

## System Architecture

| Layer | What | Docs |
|-------|------|------|
| **tt** (this file) | MCP-based CLI — Claude slash command | `~/Projects/w3geekery/tt/commands/tt.md` |
| **tt MCP** | SQLite backend — direct DB imports, no HTTP | `mcp__tt__*` tools |
| **tt Express API** | HTTP API + SSE for Angular UI | `http://localhost:4301/api/*` |
| **Angular UI** | Web dashboard | `http://localhost:4302` (dev) |
| **State file** | Running timer state for statusline | `~/.tt/state.json` |

### state.json — Shared State File

**Location:** `~/.tt/state.json`

The tt cron engine writes the running timer state to this file every 30 seconds. The Claude Code **statusline** reads it to display the running timer in the terminal status bar. Format:

```json
{
  "running": {
    "id": "...",
    "slug": "260326-1",
    "company_id": "...",
    "project_id": "...",
    "started": "2026-03-26T09:00:00.000Z",
    "notes": "Building tt time tracker",
    "elapsed_ms": 3600000
  },
  "today_total_ms": 14400000,
  "updated_at": "2026-03-26T13:00:00.000Z"
}
```

### SQLite Database

- **Location:** `~/.tt/tt.db`
- **Mode:** WAL (concurrent reads from Express + MCP)
- For direct SQL access: `sqlite3 ~/.tt/tt.db "<query>"`

## MCP Tools Reference

All data operations use `mcp__tt__*` tools — no HTTP round-trips from MCP.

| Category | Tools |
|----------|-------|
| **Timer** | `start_timer`, `stop_timer`, `pause_timer`, `resume_timer`, `get_running_timer`, `cancel_timer`, `update_timer`, `delete_timer`, `add_entry`, `list_timers`, `get_timer_by_slug`, `schedule_timer` |
| **Reports** | `daily_summary`, `weekly_summary`, `monthly_summary`, `invoice_report`, `get_cap_status`, `list_weekly_tasks` |
| **Config** | `list/create/update/delete_company`, `list/create/update/delete_project`, `list/create/update/delete_task` |
| **Recurring** | `create/list/delete_recurring_timer`, `skip/unskip_recurring_timer` |
| **Notifications** | `schedule/list/cancel_notification`, `get/set_timeline_hours` |

## Hour Allocation Rules

- **ZeroBias hours filled first** each day. Excess beyond 4h/day → **w3geekery / SME Mart**.
- **ZeroBias cap:** 20 hours/week (4 hrs/day weekdays)
- **SME Mart (w3geekery) cap:** 15 hours/week

## Commands

### Status (default when invoked without arguments)

1. Call `get_running_timer` — show running timer with elapsed time
2. Call `daily_summary` — show today's hours by company/project
3. Show quick command reference

**Format:**
```
⏱ Running: <company> / <project> / <task> — <elapsed>
Today: <total>h (ZeroBias <X>h, w3geekery <Y>h)

Commands: start/stop/pause/resume/cancel | report today/week/month | invoice <month>
Config: list/add/edit/delete company/project/task | recurring list/add/delete
```

If timer is **paused**, show:
```
⏸ Paused: <company> / <project> / <task> — <elapsed> (paused)
```

### Timer Control

#### `start <company> [project] [task] [notes]`
1. If there's a running timer, stop it first (follow "Stopping" flow below)
2. Call `start_timer` with company, project, task, notes
3. Display confirmation
4. **If company has a daily/weekly cap:** Calculate when today's hours will hit the daily cap (completed + running elapsed). Display as an informational note: "You'll reach 100% of daily ZeroBias cap at HH:MM AM/PM." If weekly cap is also close (>80%), mention that too: "Weekly ZeroBias cap at Xh/20h (Y%)." Do NOT prompt to set up autocap — just inform.

#### `stop [notes]`
1. Call `get_running_timer` to see what's running
2. **Generate session summary** — summarize what Clark worked on during this session from conversation context. If no context, ask: "What did you work on?"
3. Call `stop_timer`
4. Call `update_timer` with the notes/summary on the stopped entry
5. Display: entry slug, duration, company/project/task, notes
6. **If task is "Standup"** — run Standup Notes Flow (see below)
7. **If task is "Marketplace Meeting"** — run Transcript Flow (see `/tt:transcript`)

#### `pause`
Call `pause_timer`. Display confirmation with segment count: "Timer paused — segment #N ended (Xh Ym total)."

#### `cancel`
Call `cancel_timer`. Display confirmation.

#### `resume`
Call `resume_timer` to resume a **paused** timer (creates a new segment, does NOT create a new timer). Display: "Resumed timer — segment #N started."
If no paused timer exists, inform Clark: "No paused timer to resume."

#### `schedule <time> <company> [project] [task] [notes]`
Call `schedule_timer` with `start_at` set to the specified time. The cron engine (runs every 30s in-process) will auto-start it when the time arrives. Use for pre-planning the day's timer switches.

#### `start` (no args)
Call `list_timers` for today. Show recent entries and let Clark pick one to start a new timer with same company/project/task.

#### `transcript` → `/tt:transcript`
Process a Marketplace Meeting transcript. See `/tt:transcript` for full flow.

#### `autocap` → `/tt:autocap`
Auto-switch from ZeroBias to W3Geekery at daily cap. See `/tt:autocap` for full flow.

### Reports

#### `report today` / `report yesterday`
Call `daily_summary` (with date for yesterday). Display hours by company/project.

#### `report week` / `report last-week`
Call `weekly_summary` (with date for last week if needed). Display:
- Daily breakdown with hours per company
- Weekly totals with cap status
- Warnings if approaching/exceeding caps

#### `report month [month]` / `report last-month`
Call `monthly_summary` with month param. Display:
- Monthly totals by company/project
- Cap check per week

#### `report range <from> <to>`
Call `list_timers` and aggregate. Display.

#### Filtering
All reports accept `--company <name>` — pass as `company` parameter to the MCP tool.

### Entry Management

#### `list [--limit N]`
Call `list_timers` for today (or a range). Display entries with slugs.

#### `add --company <C> --project <P> --task <T> --started <time> --ended <time> [--notes "..."]`
Call `add_entry`. Display confirmation.

#### `edit <slug> <field> <value>`
Call `get_timer_by_slug` to resolve, then `update_timer` with the field to change (started, ended, notes). Display updated entry.

#### `delete <slug>`
Confirm with Clark, then call `delete_timer`. Display confirmation.

### Invoice

#### `invoice <month> [--company <name>]`
Call `invoice_report` with month (YYYY-MM) and optional company filter. Display formatted invoice:
```
Invoice: February 2026
═══════════════════════════════════════
Company / Project          Hours    Rate
───────────────────────────────────────
ZeroBias
  Platform Development     42.50    ...
w3geekery
  SME Mart                 14.25    ...
───────────────────────────────────────
Total                      56.75
```

### Hours (with cap checking)

#### `hours today` / `hours week`
Call `daily_summary` or `weekly_summary`. Display with cap warnings:
```
Today: 6.5h (ZeroBias 4.0h ✓ | w3geekery 2.5h)
Week:  28.5h (ZeroBias 18.0h ⚠ 2h left | w3geekery 10.5h ✓ 4.5h left)
```

### Configuration

#### `list companies` / `list projects` / `list tasks`
Call the corresponding `list_*` tool. Display as table.

#### `add company <name>` / `add project <company> <name>` / `add task <project> <name>`
Call `create_company`, `create_project`, or `create_task`.

#### `edit company <id> name <new>` / `edit project <id> ...` / `edit task <id> ...`
Call `update_company`, `update_project`, or `update_task`.

#### `delete company <id>` / `delete project <id>` / `delete task <id>`
Confirm with Clark (warns if entries reference it). Call `delete_*`.

### Recurring Schedules

#### `recurring list`
Call `list_recurring_timers`. Display as table with pattern, time, company/project/task.

#### `recurring add <pattern> <day> <time> <company> [project] [task]`
Call `create_recurring_timer`. Examples:
- `recurring add weekdays 08:30 ZeroBias Standup` — Mon–Fri at 8:30am
- `recurring add weekly 2 14:00 w3geekery "SME Mart" "Marketplace Meeting"` — Tuesdays at 2pm

#### `recurring delete <id>`
Call `delete_recurring_timer`.

## Special Flows (Claude Intelligence Required)

### Session Summary Generation (on stop)

When stopping a timer, generate a concise 1–2 sentence summary:
- Pull from conversation context (what was discussed/worked on)
- Include ticket/PR references when applicable
- Be specific — NOT "General Development"
- If no context, ask Clark
- **Format as scannable markdown** — use bullet points for multi-item summaries, not a wall of text. The notes field renders markdown, so make it easy to skim at a glance.

### Standup Notes Flow

Triggered when stopping a timer where task == "Standup":

1. Ask Clark: "Paste standup meeting notes? (or skip)"
2. If skipped: done
3. If notes provided:
   - Summarize into scannable markdown: `### Standup` heading, then bullet points for topics/decisions/action items
   - Call `update_timer` to append summary to the entry's notes

### Marketplace Meeting Transcript Flow → `/tt:transcript`

Triggered when stopping a timer where task == "Marketplace Meeting", OR standalone via `/tt:transcript`. See `/tt:transcript` for full flow.

### Weekly Task Rollup (ZeroBias Integration)

> **Note:** This requires ZeroBias platform MCP tools. Only available when ZeroBias MCP is configured.

- `rollup status` — Show weekly hours by company, pending actions
- `rollup day` — Generate day summary, flush to ZeroBias task comments
- `rollup week` — Finalize weekly task descriptions with hours + work summary
- `rollup flush` — Flush pending comments to ZeroBias

For rollup implementation details, read `~/.claude/timetracker/templates/weekly-invoice-task.md`.

### Backfill Workflow → `/tt:backfill`

Populate timer notes with SpecStory session summaries. Dry-run with per-day approval. See `/tt:backfill` for full flow.

## Name Resolution

MCP tools accept IDs but Clark uses names. Before any MCP call, resolve user input:

1. Call `list_companies`, `list_projects`, or `list_tasks` to get available entities
2. **Exact match** (case-insensitive) → use ID
3. **Starts with** → `"standup"` → `"Standup Meeting"`
4. **Contains** → `"market"` → `"Marketplace Meeting"`
5. **Word-prefix match** → `"gen dev"` → `"General Development"`

- If exactly one match: use it silently
- If multiple matches: show candidates and ask Clark to pick
- If no match: show available names and ask Clark

**Cache within a session:** Once you've resolved a name, remember it for the rest of the conversation.

## Time Parsing

All times in Pacific Time (America/Los_Angeles):
- `8:30am`, `5:30pm`, `17:30`, `noon`, `midnight`
- Relative: `in 30m`, `in 2h`, `in 1h30m`
- Dates: `today`, `yesterday`, `last Monday`, `2026-02-15`
- Months: `Feb`, `February`, `2026-02`, `last-month`

### Dev Server Lifecycle

The dev server runs locally — no compute cost concerns like Neon. Always use the MCP tools, never raw `lsof`/`kill`/`curl`.

#### `server start` / **greeting aliases** — start Express API (4301) + Angular UI (4302)

Call `mcp__tt__server_start`. Confirm with `mcp__tt__server_status` a few seconds later. Expected: `api_up: true, ui_up: true`.

**Greeting aliases — all route to `server start`:**
`hi`, `hey`, `hello`, `good morning`, `morning`, `yo`, `start`

Examples that should trigger this path:
- `/tt hey`
- `/tt good morning`
- `/tt yo`

On greeting, optionally follow up with `get_running_timer` if there's a materialized-but-unstarted recurring timer that should have fired overnight while the server was down — Clark will want to know.

#### `server stop` / **farewell aliases** — stop both processes cleanly

Call `mcp__tt__server_stop`.

**Farewell aliases — all route to `server stop`:**
`goodbye`, `good night`, `gnight`, `night night`, `bye`, `later`, `laters`, `stop`

Examples:
- `/tt good night`
- `/tt laters`
- `/tt bye`

On farewell, check `get_running_timer` first — if a timer is still running, surface it and ask before stopping the server ("Timer 260416-1 is running on ZeroBias/UI. Stop it first, or let it run overnight?"). If Clark says "don't care" / "leave it" / equivalent, stop the server anyway; the timer will still be in the DB when he restarts.

#### `server status`

Call `mcp__tt__server_status`. Display a concise line:
- `running (API:4301 UI:4302)` → both up
- `partial` → one up, one down — prompt Clark: "API is up but UI is down. Run `/tt hey` to reconcile?"
- `stopped` → both down — suggest `/tt hey`

#### `server restart`

Call `mcp__tt__server_restart`. Mostly for debugging; day-to-day use `stop` then `start` (or just `start` on a half-state, which now auto-recovers per `dev-server.sh`).

## Error Handling

- If no running timer on stop/cancel: inform Clark
- If timer stopped with < 1 min elapsed: warn but save
- Confirm before deleting entries or config with associated data
- Show helpful suggestions when commands fail

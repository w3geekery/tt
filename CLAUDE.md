# tt — Project Instructions

## Key Paths

| What | Path |
|------|------|
| Project root | `~/Projects/w3geekery/tt/` |
| Core source | `src/core/` |
| Database layer | `src/core/db/` |
| Express API | `src/core/server/` |
| MCP server | `src/core/mcp/` |
| Extensions | `src/extensions/` (gitignored) |
| Config | `tt.config.ts` |
| SQLite database | `~/.tt/tt.db` |
| State file | `~/.tt/state.json` |
| Dev server | `http://localhost:4301` |

## Architecture

### Local-First, No Cloud

- **Database:** SQLite via `better-sqlite3` (synchronous, fast)
- **No auth:** Single-user local app, no JWT/tokens
- **No Neon:** All data in `~/.tt/tt.db`
- **MCP server:** Direct DB imports, no HTTP round-trip
- **Cron:** In-process timers or lightweight launchd, no polling windows needed

### Data Flow

```
Claude Code ──► MCP Server ──► SQLite (direct)
                                  ▲
Angular UI ──► Express API ──────┘
                  │
                  └──► SSE broadcast ──► Angular UI
```

- Express API handles HTTP routes + SSE broadcasts
- MCP server imports `src/core/db/` directly (no HTTP, no auth)
- Both read/write the same SQLite file (WAL mode for safe concurrency)

### Extension System

Extensions register hooks in `tt.config.ts`. Core calls hooks at lifecycle points:

| Hook | When | Use case |
|------|------|----------|
| `onTimerStart` | After timer starts | Sync to external system |
| `onTimerStop` | After timer stops | Update external task, log time |
| `onCapHit` | When daily/weekly cap reached | Notify, auto-switch |
| `formatInvoice` | During invoice generation | Custom template/layout |
| `resolveExternalTask` | When linking timer to task | Look up Jira/ZB/GitHub task |
| `onBackfill` | During note backfill | Custom session scanning |
| `onTranscript` | Processing meeting notes | Extract action items |

Extensions live in `src/extensions/` (gitignored) or a separate private repo.

## Predecessor

This project replaces `timetracker-ui` (`~/Projects/w3geekery/timetracker-ui/`). Key differences:

| Aspect | timetracker-ui | tt |
|--------|---------------|-----|
| Database | Neon (cloud Postgres) | SQLite (local) |
| Auth | JWT Bearer tokens | None |
| MCP → DB | HTTP via Express API | Direct imports |
| Cron | Polling windows (save compute) | Always-on (free) |
| Port | 4300 | 4301 |
| MCP name | `timetracker` | `tt` |
| Slash command | `/ttui` | `/tt` |

## Guardrails

### Timer Operations — MANDATORY CHECKLIST

Before starting, stopping, or switching ANY timer:
1. **Query first, never guess.** Use `mcp__tt__list_projects` or `mcp__tt__list_companies` to get IDs. NEVER copy IDs from earlier in the conversation.
2. **Check overflow settings.** If a project has `overflow_company_id`/`overflow_project_id`/`overflow_task_id`, use those when switching after a cap hit.
3. **Verify after.** After any timer operation, confirm the result shows the correct company/project/task names.
4. **Prefer autocap.** If the cron system should handle a switch automatically, let it. Don't manually replicate what autocap does.

### Data Access — USE MCP TOOLS

- **Always use `mcp__tt__*` tools** for reading tt data. Never use `curl` against the Express API.
- If a needed MCP tool doesn't exist, **add it to the MCP server** rather than working around it.

### Time Values — ALWAYS ROUND

- All user-facing times must be rounded to **15-minute increments**.
- This applies to meeting summaries, timer notes, session recaps — everything.

### Before Acting on Any tt Data

- **Read the project/company/task names**, not just IDs.
- **Cross-check assumptions** against the actual database state.
- **Never assume** which project a timer belongs to based on position in a list.

## Building

The project has **three separate build targets**:

```bash
npm run build            # Core (tsc) + Angular UI → dist/
npm run build:mcp        # MCP server → dist/mcp/ (uses tsconfig.mcp.json)
```

**After any change to `src/core/`**, run BOTH:
```bash
npm run build && npm run build:mcp
```

The MCP server (`dist/mcp/src/core/mcp/index.js`) imports from `src/core/db/`, `src/core/types.ts`, etc. If you only run `npm run build`, the MCP process still loads stale code from `dist/mcp/` and will break.

After building the MCP, **restart Claude Code** so the MCP stdio process reloads.

## Testing

- Framework: Vitest
- Run: `npm test` or `npx vitest run`
- Coverage target: 80%+

## Versioning

Conventional commits enforced by commitlint + husky.

```bash
npm run release          # auto-detect bump
npm run release:minor    # force minor
npm run release:major    # force major
```

## Plans

All plans live in `.claude/plans/local/` with `YYMMDD-kebab-name.md` naming. See [.claude/plans/local/INDEX.md](.claude/plans/local/INDEX.md) for the authoritative plan list with statuses.

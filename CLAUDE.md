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

All plans live in `.claude/plans/local/` with `YYMMDD-kebab-name.md` naming.

### Plan Index

| Plan | Status | Description |
|------|--------|-------------|
| `260326-local-first-architecture.md` | ACTIVE | Architecture, migration path, phase breakdown |

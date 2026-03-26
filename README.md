# tt — Local-First Time Tracker

A fast, self-contained time tracking app built for developers who live in the terminal. SQLite-backed, MCP-integrated, zero cloud dependencies.

## Features

- **Timer management** — start, stop, pause, resume with 15-minute rounding
- **Project & company organization** — group timers by company/project/task
- **Hour caps** — daily and weekly caps with overflow routing
- **Recurring timers** — auto-materialize daily/weekly schedules
- **Invoice generation** — configurable templates, billing period reports
- **MCP server** — control timers from Claude Code, Cursor, or any MCP client
- **Notifications** — cap alerts, timer switches, scheduled reminders
- **Extension system** — plug in custom integrations without forking

## Architecture

```
tt/
├── src/
│   ├── core/           # The engine — works standalone
│   │   ├── db/         # SQLite database layer (better-sqlite3)
│   │   ├── server/     # Express API + SSE
│   │   └── mcp/        # MCP server (direct DB access, no HTTP)
│   └── extensions/     # Custom integrations (gitignored)
├── tt.config.ts        # Extension registration + settings
├── scripts/            # Cron, backup, utilities
└── .claude/            # Plans, notes, project context
```

### Local-First Design

- **SQLite** — single file at `~/.tt/tt.db`, zero infrastructure
- **No cloud required** — works fully offline
- **No auth overhead** — single-user, local-only
- **Instant queries** — no network latency, no connection pooling
- **Trivial backup** — copy one file

### Extension System

tt ships as a complete time tracker. Extensions add custom behavior without modifying core code:

```typescript
// tt.config.ts
import type { TtConfig } from './src/core/types';

const config: TtConfig = {
  port: 4301,
  db: '~/.tt/tt.db',
  extensions: {
    // Extensions register hooks — core calls them at the right time
    // onTimerStop: async (timer) => { /* sync to external system */ },
    // formatInvoice: (data) => { /* custom invoice template */ },
    // resolveExternalTask: async (ref) => { /* look up Jira/ZB task */ },
  },
};

export default config;
```

Keep your extensions in a private repo, load them via config. The public core never needs to know about your custom integrations.

## Quick Start

```bash
# Install
npm install

# Start dev server (Angular UI + Express API)
npm run dev

# MCP server (for Claude Code)
# Add to ~/.claude.json under mcpServers.tt
```

## Tech Stack

- **Frontend:** Angular (latest)
- **API:** Express
- **Database:** SQLite via better-sqlite3
- **MCP:** @modelcontextprotocol/sdk
- **Testing:** Vitest
- **Language:** TypeScript

## Development

```bash
npm run dev          # Start dev server on :4301
npm run test         # Run tests
npm run build        # Build for production
npm run build:mcp    # Build MCP server
```

## License

MIT

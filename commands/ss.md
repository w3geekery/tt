# SpecStory Session Scanner

Cross-repo session aggregator. Scans all `.specstory/history/` folders under `~/Projects/zb/` and `~/Projects/w3geekery/`, groups sessions by company. All data cached in SQLite (`~/.tt/tt.db` → `specstory_sessions` table).

## Usage

**Arguments:** `$ARGUMENTS`

| Command | Description |
|---------|-------------|
| `/ss` | Today's sessions |
| `/ss today` | Today's sessions |
| `/ss yesterday` | Yesterday's sessions |
| `/ss week` | This week (Mon–Fri) |
| `/ss last-week` | Last week |
| `/ss 2026-02-18` | Specific date |
| `/ss 2026-02-10 2026-02-18` | Date range |
| `/ss today --for-rollup` | Compact format for /tt rollup notes |

## Workflow

### Step 1: Scan & Cache Sessions

Run the scanner to discover sessions and cache them to SQLite:

```
mcp__tt__scan_sessions({ date: "<period>" })
```

Or for a range:
```
mcp__tt__scan_sessions({ date: "2026-02-10", end_date: "2026-02-18" })
```

The scanner finds all matching `.specstory/history/` files, extracts metadata (goal, outcome, commits, PRs, message counts), and upserts into the `specstory_sessions` table.

**Excluded repos** (unbillable): `tt`, `timetracker-ui`, `cricker.com`, `subekyoga.com`, `sqzd.in`

### Step 2: Query Cached Sessions

```
mcp__tt__list_sessions({ date: "2026-03-25" })
```

Or for a range:
```
mcp__tt__list_sessions({ date_from: "2026-03-24", date_to: "2026-03-28" })
```

Or by repo:
```
mcp__tt__list_sessions({ repo: "ui" })
```

Each session includes: `path`, `repo`, `company`, `started`, `goal`, `outcome`, `summary`, `commits`, `pr_urls`, `user_messages`, `agent_messages`.

### Step 3: Summarize Uncached Sessions

If a session has `summary = null`, it needs summarization. Read the file strategically:

1. **Beginning (first 500 lines)** — capture the initial request
2. **End (last 300 lines)** — see the final outcome
3. **File operations** — `grep -E "(Edit|Write)\(" <filepath>` for modified files

Then update the session in SQLite:
```sql
sqlite3 ~/.tt/tt.db "UPDATE specstory_sessions SET summary = '<summary>' WHERE path = '<path>'"
```

### Step 4: Format Output

**Standard format** (default):

```
## SpecStory Session Report — {label}

### {Company} ({N} sessions)

#### {repo}

**{Brief Title from Goal}**
**Goal**: {1 sentence}
**Outcome**: {emoji} {Brief result}
**Commits**: {count}  **PRs**: {list}
**Key insight**: {Notable decision, if any}

---
**Patterns**: {Recurring themes, files touched multiple times}
**Unfinished**: {Sessions with TODOs or blockers}
```

**`--for-rollup` format** (compact for /tt rollup notes):

```
## Work Summary — {label}

### {Company}
- {outcome_emoji} **{repo}**: {1-line summary of what was accomplished}
  Commits: {count}  PRs: {list}
- {outcome_emoji} **{repo}**: {1-line summary}

### {Company}
- ...
```

Outcome emojis: Completed, Research, In Progress, Blocked, Abandoned

### Step 5: Offer Integration

After displaying the report, offer to integrate results into `/tt` rollup if relevant (e.g., for weekly task updates or invoice notes).

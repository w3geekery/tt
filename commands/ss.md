# SpecStory Session Scanner

Cross-repo session aggregator. Scans all `.specstory/history/` folders under `~/Projects/zb/` and `~/Projects/w3geekery/`, groups sessions by company.

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

### Step 1: Discover Sessions

Run the discovery script to find all matching session files:

```bash
python3 ~/.claude/timetracker/specstory-scan.py $ARGUMENTS
```

Remove `--for-rollup` or `--json` from `$ARGUMENTS` before passing to the script (it always outputs JSON now). Remember the `--for-rollup` flag for Step 3 formatting.

The script outputs a JSON manifest grouped by company > repo, with file paths and metadata. No summarization — that's your job.

If `total_sessions` is 0, report "No sessions found for this period." and stop.

### Step 2: Check SQLite Cache & Summarize Sessions

**Cache location:** `~/.tt/tt.db` → `specstory_sessions` table

The cache is stored in tt's SQLite database. Query it directly:

```sql
-- Check if a session is cached and current (size matches)
SELECT summary FROM specstory_sessions WHERE path = '{filepath}' AND size_bytes = {size_bytes};
```

For each session in the manifest:
- **Query the cache:** Run the SQL above for each session path + size
- If result returned → use the cached `summary` (skip reading the file)
- If no result (missing or size changed) → read and summarize, then upsert into cache

**To read the cache**, use the tt MCP tools or query directly:
```bash
sqlite3 ~/.tt/tt.db "SELECT path, summary FROM specstory_sessions WHERE path = '/path/to/session.md' AND size_bytes = 5000"
```

**To write the cache** after summarizing:
```bash
sqlite3 ~/.tt/tt.db "INSERT INTO specstory_sessions (path, repo, company, started, ended, size_bytes, summary, cached_at) VALUES ('{path}', '{repo}', '{company}', '{started}', '{ended}', {size_bytes}, '{summary}', datetime('now')) ON CONFLICT(path) DO UPDATE SET repo=excluded.repo, company=excluded.company, started=excluded.started, ended=excluded.ended, size_bytes=excluded.size_bytes, summary=excluded.summary, cached_at=datetime('now')"
```

For uncached sessions, use the **specstory-session-summary skill's strategic reading approach**:

**2a. Understand the session scope** — grep for user message markers:
```
grep -n "_\*\*User\*\*_" <filepath> | head -10
```
This reveals how many distinct requests were made and where they are.

**2b. Read strategically:**
1. **Beginning (first 500 lines)** — Read with `offset=0, limit=500` to capture the initial request
2. **End (last 300 lines)** — Use `tail -300 <filepath>` to see the final outcome
3. **File operations** — `grep -E "(Edit|Write)\(" <filepath>` to identify files modified

**2c. For multi-request sessions** (user messages at distant line numbers like 50, 800, 1500):
- Read around each user message line number (`offset=<line-5>, limit=100`)
- Summarize the 2-3 main tasks

**Extract:**
- **Goal(s)**: What the user wanted (from `_**User**_` blocks)
- **Outcome**: Completed / Research / In Progress / Blocked / Abandoned
- **Files modified**: From Edit/Write tool uses (filenames only)
- **Key decisions**: Explicit choices, trade-offs, architecture conclusions

**Performance note:** For periods with many sessions (week, date ranges), use the Task tool to parallelize reading sessions across multiple agents. Group by company and spawn one agent per company/repo group.

### Step 3: Format Output

**Standard format** (default):

```
## SpecStory Session Report — {label}

### {Company} ({N} sessions)

#### {repo}

**{Brief Title from Goal}**
**Goal**: {1 sentence}
**Outcome**: {emoji} {Brief result}
**Files**: {comma-separated filenames, or "None"}
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
  Files: {comma-separated filenames}
- {outcome_emoji} **{repo}**: {1-line summary}

### {Company}
- ...
```

Outcome emojis: Completed, Research, In Progress, Blocked, Abandoned

### Step 4: Offer Integration

After displaying the report, offer to integrate results into `/tt` rollup if relevant (e.g., for weekly task updates or invoice notes).

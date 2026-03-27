# Backfill Timer Notes from SpecStory Sessions

Populate timer notes with work summaries derived from SpecStory sessions and git history. Dry-run workflow — no changes written until Clark approves each day.

> **IMPORTANT:** Before performing any date/time actions, check the current date/time (e.g., `date`) to ensure you are using real time, not training data.

## Arguments

`$ARGUMENTS`

**Supported formats:**
- Single day: `2026-03-10` or `yesterday` or `last monday`
- Current week: `week` (Mon–Fri only)
- Previous week: `last-week` (Mon–Fri only)
- Date range: `2026-03-10 2026-03-14` (weekdays only)

## Shared Context

Inherits from `/tt`:
- **MCP tools:** `mcp__tt__*` (list_timers, update_timer)
- **Hour rules:** ZeroBias 4h/day cap, 20h/week; w3geekery 15h/week
- **Timezone:** All dates/times in Pacific Time (America/Los_Angeles)
- **Name resolution:** See `/tt` for company/project/task name matching

## Workflow

For each date in the requested range:

### Step 1: Load Sessions from SQLite Cache

Query the SpecStory session cache in SQLite:
```sql
SELECT path, repo, company, started, ended, summary
FROM specstory_sessions
WHERE date(started) = date('YYYY-MM-DD')
ORDER BY started
```

Use: `sqlite3 ~/.tt/tt.db "<query>"`

**If no cached sessions**, run the scanner first:
```bash
python3 ~/.claude/timetracker/specstory-scan.py YYYY-MM-DD
```
Then read each discovered session, summarize it, and upsert into the cache:
```sql
INSERT INTO specstory_sessions (path, repo, company, started, ended, size_bytes, summary, cached_at)
VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT(path) DO UPDATE SET summary=excluded.summary, size_bytes=excluded.size_bytes, cached_at=datetime('now')
```

Also gather git commits for the date:
```bash
git -C <repo-path> log --after="YYYY-MM-DDT00:00:00" --before="YYYY-MM-DDT23:59:59" --format="%h %s" --no-merges
```

### Step 2: Fetch Timers

Call `mcp__tt__list_timers` with date filter. Filter to billable companies only (ZeroBias + W3Geekery). Exclude Sub Ek Yoga.

### Step 3: Generate Proposed Notes

For each billable timer, generate notes using this priority order:

1. **`[SESSION_RECAP]`** — tagged blocks in session content (deterministic, best quality)
2. **Completion recaps** — Claude-generated summaries from session ends
3. **Git commits** — conventional commit messages (`feat:`, `fix:`, `test:`, etc.)
4. **PR references** — pull request deliverables
5. **Session goals** — lowest priority fallback

**Content selection:** Use ALL sessions for the day — the timer's company determines billing, NOT the session's repo.

**Unbillable filter — exclude from notes:**
- timetracker-ui, tt (projects) — internal tooling, never billable
- cricker.com, subekyoga.com, sqzd.in (projects)
- Sub Ek Yoga (company)

### Step 4: Classify & Preview

| Current Notes | Action | Behavior |
|---------------|--------|----------|
| Empty, null, one-word, <10 chars | **REPLACE** | Generated summary replaces |
| "General Development", "work", "dev", known generic patterns | **REPLACE** | Generated summary replaces |
| "Overflow from ..." (cap spillover explanation) | **REPLACE** | Explains *why* timer exists, not *what was done* — replace |
| Substantive (>10 chars, not generic/overflow) | **MERGE** | Append new bullets, deduplicate |
| "Standup Meeting", "Marketplace Meeting" | **SKIP** | Keep as-is (substantive) |
| No sessions for date | **REVIEW** | Flag for manual review |

Show dry-run preview table, then ask for approval.

### Step 5: Apply (after approval)

Call `mcp__tt__update_timer` for each approved timer with the new notes.

### Step 6: Marketplace Meetings

If a Marketplace Meeting timer exists for the day, check `sme-mart/.claude/notes/meetings/YYYY-MM-DD-marketplace.md` for a summary and include highlights in the meeting timer notes.

## Formatting Rule

All generated/proposed notes MUST be scannable markdown:
- Use bullet points (`- item`), not a blob of text
- Be specific and quantified ("migrated 22 specs", not "did some migration work")
- Include PR numbers and test counts where available
- **Group by repo** using `### Repo Name` headings when work spans multiple repos in a single timer

## Example Output

```
Processing March 19, 2026...
  Sessions: 4 (from specstory_sessions table)
  Commits: 29
  Timers: 4 billable (1 excluded: Sub Ek Yoga)

=== DRY RUN PREVIEW — March 19, 2026 (PDT) ===

┌──────────────────┬───────────┬───────────────────────┬─────────┬──────────────────────────────────────────┐
│ Timer            │ Company   │ Current Notes         │ Action  │ Proposed Notes                           │
├──────────────────┼───────────┼───────────────────────┼─────────┼──────────────────────────────────────────┤
│ 8:45–11:30 AM    │ ZeroBias  │ General Development   │ REPLACE │ - ZB UI test suite: 699 tests passing    │
│                  │           │                       │         │ - 553 navigation service tests           │
│ 1:30–2:30 PM     │ ZeroBias  │ General Development   │ REPLACE │ - Nav Phase 2 (97 + 35 tests)            │
│ 2:30–6:00 PM     │ W3Geekery │ Overflow from ZB cap  │ REPLACE │ - AuditgraphDB end-to-end integration    │
└──────────────────┴───────────┴───────────────────────┴─────────┴──────────────────────────────────────────┘

Apply these changes? (yes/no)
```

## Notes

- Per-day approval gates: approve Monday, then Tuesday, etc. separately
- Re-run idempotency: if note content matches → skip silently; if different → prompt skip/overwrite/append
- To rebuild cache for a date: `python3 ~/.claude/timetracker/specstory-scan.py YYYY-MM-DD` then re-summarize

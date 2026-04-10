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

### Step 1: Scan & Load Digest

**Always run the scanner first** to ensure the cache is populated:
```
mcp__tt__scan_sessions({ date: "YYYY-MM-DD" })
```

Then call the daily digest — one compact call replaces all manual queries:
```
mcp__tt__daily_digest({ date: "YYYY-MM-DD" })
```

The digest returns ~2-3KB regardless of activity volume:
- **Timer-aligned slots** — events already bucketed into timer time windows
- **PT times formatted** — no UTC conversion needed
- **Recaps in full** — high-value content preserved
- **Commits summarized** — grouped by prefix (e.g., "42 commits: test x28, feat x8")
- **PRs listed** — URLs per repo per slot
- **0-duration timers filtered** — ghosts/cancelled timers excluded

Each slot includes `timer_slug`, `company`, `project`, `task`, and a `repos` map with per-repo `recaps`, `prs`, `commit_count`, and `commit_summary`.

**Fallback — two-pass sqlite3 query** (for debugging or if digest tool unavailable):

Pass 1 — Recaps + PRs only (~20 rows):
```
sqlite3 ~/.tt/tt.db "SELECT e.event_type, e.timestamp, substr(e.content, 1, 150), s.repo FROM specstory_events e JOIN specstory_sessions s ON s.path = e.session_path WHERE e.date_pt = 'YYYY-MM-DD' AND e.event_type IN ('session_recap', 'pr') ORDER BY e.timestamp"
```

Pass 2 — Commits for uncovered gaps only:
```
sqlite3 ~/.tt/tt.db "SELECT e.event_type, e.timestamp, substr(e.content, 1, 80), s.repo FROM specstory_events e JOIN specstory_sessions s ON s.path = e.session_path WHERE e.date_pt = 'YYYY-MM-DD' AND e.event_type = 'commit' AND e.timestamp BETWEEN 'START_UTC' AND 'END_UTC' ORDER BY e.timestamp"
```

### Step 2: Fetch Timers

The digest already includes timer context per slot. For additional timer details (notes, state), call `mcp__tt__list_timers` with date filter. Filter to billable companies only (ZeroBias + W3Geekery). Exclude Sub Ek Yoga.

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
| "Standup Meeting" task | **REPLACE** | Write: `- Daily standup` |
| "Friday Demo" task | **REPLACE** | Write: `- Friday demo with team` |
| "Marketplace Meeting" | **SKIP** | Keep as-is (substantive) |
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
- **Group by project** using `###` headings with `####` repo subheadings:
  ```
  ### SME Mart
  #### repos: w3geekery/app, w3geekery/schema
  - bullet points...

  ### ZB UI
  #### repos: zerobias-com/ui
  - bullet points...
  ```

  **Domain separation** (Brian's "no cheating" directive):
  - `~/Projects/zb/` — ZeroBias employee repos. Work here = ZB domain.
  - `~/Projects/w3geekery/zerobias-org-forks/` — Forked clones of zerobias-org repos. Work here = W3Geekery domain (typically SME Mart).

  **Scanner path → GitHub repo → Project mapping:**

  | Scanner `s.repo` value | GitHub origin | Domain | Project |
  |------------------------|---------------|--------|---------|
  | `ui` | `zerobias-com/ui` | ZB | ZB UI (always) |
  | `zerobias-org/*` (app, schema, etc.) | `zerobias-org/*` | ZB | ZB employee work |
  | `zerobias-org-forks/app/package/w3geekery/sme-mart` | `w3geekery/app` | W3Geekery | SME Mart |
  | `zerobias-org-forks/app` | `w3geekery/app` | W3Geekery | SME Mart |
  | `zerobias-org-forks/schema` | `w3geekery/schema` | W3Geekery | SME Mart |

  **Project attribution:**
  - `zerobias-com/ui` → always `### ZB UI`
  - `w3geekery/app` → always `### SME Mart`
  - `w3geekery/schema` → always `### SME Mart`
  - `zerobias-org/*` → `### ZB` (not necessarily UI — could be platform, schema CI, etc.)
  - If uncertain, fall back to `### repo: <repo-path>`
  - List GitHub origin repos (not scanner paths or local paths) in the `#### repos:` line
- **Synthesize related events** — don't list every individual recap as a separate bullet. Group events that are part of the same initiative (e.g., 12 separate E2E spec recaps from GSD agents → one summary bullet like "Phase 12 E2E complete: 5 plans, 10+ specs, ~80 data-testids"). Look for common themes: same phase, same feature area, same PR chain. Summarize the group with counts and key deliverables.

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

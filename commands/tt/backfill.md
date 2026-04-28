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

### Step 2.5: Re-route Timestamped Recap Bullets (REQUIRED)

Session recaps are often written hours — sometimes days — after the work was actually done. The digest bundles each recap into the slot where it was *written*, not where the work occurred. Every `[SESSION_RECAP]` bullet now carries a UTC timestamp prefix that identifies when the work happened; this step re-routes each bullet to the correct timer before note generation.

**Bullet formats (from global CLAUDE.md `## Session Recaps`):**

| Pattern | Meaning | Example |
|---------|---------|---------|
| `(HH:MM–HH:MMZ)` | Time range, same day as session (UTC, en-dash `–`) | `(14:02–15:30Z)` |
| `(HH:MMZ)` | Instant / point-in-time event, same day | `(17:45Z)` |
| `(YYYY-MM-DD HH:MMZ–YYYY-MM-DD HH:MMZ)` | Explicit multi-day range | `(2026-04-01 22:36Z–04-02 00:15Z)` |
| *(no prefix)* | Un-timestamped — legacy / freeform | `- Fixed GQL field lists` |

**Parsing rules:**

- Match at the start of each bullet line after `- `. Whitespace-tolerant.
- The separator between start/end is an **en-dash `–`** (U+2013), *not* a hyphen-minus. If you see a hyphen-minus `-` in the range separator, treat it as a typo and accept it, but flag it in the preview.
- Convert all times to UTC ISO (`YYYY-MM-DDTHH:MM:00.000Z`). If no date prefix, inherit the session file's date.
- For time-range bullets: use the **start** of the range as the routing timestamp.

**Routing algorithm:**

For each timestamped bullet with resolved UTC timestamp `T`:

1. Convert `T` to PT to determine its target day.
2. If the target day ≠ the date currently being backfilled → defer this bullet to that day's backfill run (skip for now). Note it in the preview.
3. Otherwise, find the timer whose segment time range contains `T`:
   - Start with `started ≤ T ≤ ended` (or `T ≤ now()` if still running).
   - If the timer has multiple segments, `T` must fall within an actual segment (not a pause gap). Walk `timer_segments` to confirm.
4. **Match cases:**
   - Exactly 1 timer matches → assign the bullet to that timer.
   - 0 matches (orphaned bullet — timestamp falls in a gap, before first timer, or after last timer) → collect into the "Orphaned Bullets" section of the dry-run preview for Clark to decide (attach to nearest timer, drop, or defer).
   - >1 match (overlapping timers, rare) → use earliest `started`. Flag in preview.

**Un-timestamped bullets:** fall back to the digest's original slot assignment (the timer that was running when the recap was written).

**Cross-day scanning (handles "recap written days later"):**

To catch recaps that reference day `N` but were written on `N+1` or later:

1. Query recap events for the window `[N, N+3]` (not just `date_pt = N`):
   ```sql
   SELECT e.session_path, e.timestamp, e.content, s.repo
   FROM specstory_events e
   JOIN specstory_sessions s ON s.path = e.session_path
   WHERE e.event_type = 'session_recap'
     AND e.date_pt BETWEEN 'N' AND 'N+3_ISO'
   ORDER BY e.timestamp
   ```
2. For each recap found, parse ALL its bullets.
3. Filter to bullets whose resolved UTC timestamp converts to day `N` in PT.
4. Route those bullets using the algorithm above.

Four days is a practical ceiling — reasonable for a Friday-written-about-Monday recap, and keeps the scan bounded. Document any bullets whose timestamp is older than `N−1` but found in a recap on `N` as a sanity-check line in the preview (shouldn't normally happen).

**Preview format for re-routed bullets:**

In the dry-run output, annotate the source when a bullet was re-routed:

```
Timer 8:45–11:30 AM (ZeroBias / UI / General Development)
  - (09:15Z→re-routed from 17:00 session) Fixed GQL field lists in 6 services
  - (10:30Z→re-routed from 17:00 session) Added 4 RFPs + 5 bids as demo data
```

For bullets deferred to another day, list them under a trailing "Deferred to other days" section.

### Step 3: Generate Proposed Notes

For each billable timer, generate notes using this priority order:

1. **Re-routed `[SESSION_RECAP]` bullets** (from Step 2.5) — bullets whose UTC timestamp placed them in *this* timer's window. Deterministic, best quality, per-timer accurate.
2. **Un-timestamped `[SESSION_RECAP]` bullets** from the digest's slot assignment for this timer — legacy fallback.
3. **Completion recaps** — Claude-generated summaries from session ends (when no `[SESSION_RECAP]` block exists).
4. **Git commits** — conventional commit messages (`feat:`, `fix:`, `test:`, etc.)
5. **PR references** — pull request deliverables.
6. **Session goals** — lowest priority fallback.

**Segment-level notes (additive):** If the timer has multiple segments and any segment has a non-empty `notes` field, fold those bullets into the proposed notes alongside the recap-derived bullets. Quick-fail when no segment has notes — don't block the per-segment fetch when there are 0 notes. Segment notes are user-authored and authoritative; never paraphrase or drop them. If a segment's note duplicates a recap bullet, dedupe in favor of the segment note (it was likely written closer to the work).

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
  Recaps scanned: 03-19 through 03-22 (4-day window for cross-day bullets)
  Timestamped bullets found: 11 (9 routed to 03-19, 2 deferred to 03-20)
  Timers: 4 billable (1 excluded: Sub Ek Yoga)

=== DRY RUN PREVIEW — March 19, 2026 (PDT) ===

┌──────────────────┬───────────┬───────────────────────┬─────────┬──────────────────────────────────────────┐
│ Timer            │ Company   │ Current Notes         │ Action  │ Proposed Notes                           │
├──────────────────┼───────────┼───────────────────────┼─────────┼──────────────────────────────────────────┤
│ 8:45–11:30 AM    │ ZeroBias  │ General Development   │ REPLACE │ - (15:45–18:30Z) ZB UI test suite: 699 ✓ │
│                  │           │                       │         │ - (16:20Z→from 23:00 session)            │
│                  │           │                       │         │   553 navigation service tests           │
│ 1:30–2:30 PM     │ ZeroBias  │ General Development   │ REPLACE │ - (20:30–21:30Z) Nav Phase 2 (97+35)     │
│ 2:30–6:00 PM     │ W3Geekery │ Overflow from ZB cap  │ REPLACE │ - (21:30Z–02:00Z) AuditgraphDB E2E       │
└──────────────────┴───────────┴───────────────────────┴─────────┴──────────────────────────────────────────┘

Orphaned bullets (timestamp doesn't fall in any timer on 2026-03-19):
  - (12:00Z) "brainstorm on weekly rollup" — gap between timers. Attach to nearest? (y/n/skip)

Deferred to 2026-03-20:
  - (2026-03-20 01:15Z) "reviewed Monday's PRs" — belongs to next day

Apply these changes? (yes/no)
```

Note: the leading `(HH:MM–HH:MMZ)` prefix on the proposed notes is for reviewer clarity only — **strip timestamp prefixes before writing to `update_timer`** so the saved notes stay clean scannable markdown.

## Notes

- Per-day approval gates: approve Monday, then Tuesday, etc. separately
- Re-run idempotency: if note content matches → skip silently; if different → prompt skip/overwrite/append
- To rebuild cache for a date: `python3 ~/.claude/timetracker/specstory-scan.py YYYY-MM-DD` then re-summarize
- **Timestamp-aware routing (Step 2.5)**: bullets that already landed in the right timer via the old logic shouldn't move. The routing is idempotent — if the recap was written in the same window as the work, the new and old assignment agree.

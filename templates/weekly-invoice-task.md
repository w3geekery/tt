# Weekly Invoice Task Template

> Used by the `/tt` rollup to create and update weekly invoice tasks on the "W3Geekery Work Log" PROD board. Two tasks per week (ZeroBias + SME Mart); marketplace meetings fold into the SME Mart task (no separate meeting task).

## Read first — quality bar (this is where it usually goes wrong)

These tasks are read by Kevin (ZB) / Brian (SME Mart) to approve invoices. **Match the live `aha1-*` tasks.** The recurring failure mode is drafting **flat, verbose, sentence-y** content. The fix is **nested + terse**.

GOOD vs BAD — Work Summary line:
- BAD (flat, category-prefixed, comma-list): `- **ZB UI** — Pipeline panel: scopes overflow, test-icon cutoff, setter gating`
- GOOD (nested parent -> terse children):
  ```
  - **ZB UI**
    - Pipeline technical-details panel — scopes overflow + test-icon cutoff fixed
    - Phase 24 Plan 02 Wave 1 — completed
  ```

GOOD vs BAD — comment block:
- BAD (semicolon wall): `- 9:15–10:30 AM: scopes overflow; i18n reuse; investigated WS log-spam; kicked off Phase 24`
- GOOD (time bullet -> nested items):
  ```
  - 9:15–10:30 AM:
    - Pipeline scopes "+x more" overflow
    - Investigated WebSocket reconnect log-spam
    - Kicked off Phase 24 Plan 02
  ```

Five rules of thumb:
1. **Nest, don't flatten.** Summary: category -> sub-bullets. Comment: a time block with 2+ items -> sub-bullets.
2. **One thing per bullet.** Typed a semicolon or a comma-list of facts? Split it.
3. **Terse.** Noun-phrase + ` — {state}`. No full sentences. Headline, not metrics (PR/test counts only when they ARE the headline).
4. **Comments show WORKED hours, plain header.** Overage lives ONLY in the description's Hours block, never in a comment.
5. **Group by natural buckets** — `ZB UI`, `SME Mart`, `Meetings`.

## Task Title Pattern

```
Work Log | {Company} | {Project} | {DateRange}, {YYYY}
```

Examples:
- `Work Log | ZeroBias | UI | May 4-8, 2026`
- `Work Log | W3Geekery | SME Mart | May 4-8, 2026`
- Cross-month / split week — use the in-period days only: `Work Log | ZeroBias | UI | Apr 27-May 1, 2026`, or a single-day stub `Work Log | ZeroBias | UI | May 1, 2026`

`Work Log` leads so the whole series greps together; `Company | Project` identifies the stream/approver. **No hours in the title** — they live in the description's Hours block.

## Task Description Template

```markdown
Weekly work log for Clark Stacer in his role as {RoleName} — week of {DateRange}, {YYYY}. Summary and daily hours below; per-day detail in the comments.

---

### Work Summary

- **{Category}**  (ZB UI / SME Mart / Meetings)
  - {terse accomplishment} — {state}
  - {terse accomplishment} — {state}
- **{Category}**
  - {terse accomplishment}

### Hours

| Day | Hours |
|-----|-------|
| Mon {date} | {hours} |
| Tue {date} | {hours} |
| Wed {date} | {hours} |
| Thu {date} | {hours} |
| Fri {date} | {hours} |
| **Total** | **{TotalHours}** |

---

*Tag: {TagName}*
```

### Work Summary formatting (IMPORTANT — match the live aha1-* tasks exactly)
- **NESTED bullets, not flat.** Parent bullet = bold category (`- **ZB UI**`); child bullets = accomplishments indented two spaces beneath (`  - Phase 12 E2E — complete`). Do NOT write flat `- **ZB UI** — ...` lines.
- Categories are the week's natural buckets: `**ZB UI**`, `**SME Mart**`, `**Meetings**` (use the ones that apply).
- Each child bullet is a TERSE noun-phrase + ` — {state}` (`ngx-library — published`, `Pilot promotion workflow — built`). NO full sentences, NO stat dumps, NO comma/semicolon-joined lists. PR numbers only when they ARE the headline (`Schema PRs merged (#35, #37, #38, #41)`). Kevin/Brian want the headline, not the metrics.

Real example (ZeroBias task aha1-9, week of Apr 6 thru Apr 10):

```
### Work Summary

- **ZB UI**
  - Phase 12 E2E (governance critical-path) — complete
  - Local reverse-proxy gateway — built
  - ngx-library — published
- **SME Mart**
  - jasmine to vitest migration
  - Transparency Center UI sketches
- **Meetings**
  - Daily standups
  - Friday demo
```

### Over-cap Hours (SME Mart week over the 15h cap)
Replace the single `**Total**` row with THREE bold rows (live aha1-10). Per-day rows above show hours actually WORKED (summing to Week worked):

```
| **Week worked** | **19.75** |
| **Billed this task** | **15.0** |
| **Over 15h cap (worked, not invoiced)** | **4.75** |
```

The ZeroBias task always uses the plain `**Total**` row — ZB has no overage (fills to its 20h cap first).

### Split-week Hours (week crosses a semi-monthly invoice boundary)
- A task NEVER crosses an invoice boundary; a straddling week splits into a short task each side.
- In the task on each side, pull the OTHER period's days into the Hours table in italics, labeled with the task they belong to, e.g. `_Mon Mar 30 (in aha1-6)_`, so the full week and its overage are visible.
- Add lines under the table: **Week worked**, **Billed this task**, **Over 15h cap (worked, not invoiced)**.

## Field Mappings (current — PROD "W3Geekery Work Log" board)

| Field | ZeroBias | W3Geekery / SME Mart |
|-------|----------|----------------------|
| Company | ZeroBias | W3Geekery |
| Project | UI | SME Mart |
| RoleName | Internal Developer for ZeroBias | 3rd Party Developer for W3Geekery |
| TagName | work-log.zerobias | work-log.w3geekery |
| Approver | Kevin McCarthy `e2c8723a-0a00-5dc7-8342-5d4b459f7c75` | Brian Hierholzer `62a91661-0187-51ba-946d-f55ca86306b1` |

Shared (both streams):
- **Board:** "W3Geekery Work Log" `ee9afc96-d810-42aa-8ed6-ca3b38b64a9b`
- **Boundary (PROD Platform):** `14188507-e63d-402b-964d-2b50db5b783c`
- **activityId:** `e15830c8-4274-4d67-bf9b-c22b60001e32` (Ad Hoc Activity - One person)
- **assigned:** Clark `437e1713-779b-5c92-b1f8-38f7e2de061f`
- **priority:** `200` (Normal — default is Critical 1000, must set explicitly)
- **approvers:** PLURAL array (even for one). **No `ownerId` override** — board lives under ZB org, owner defaults correctly.
- Leave tasks in `todo` — do NOT transition. Task codes auto-assign `aha1-N`.

## Comment Pattern (one comment per day)

ONE comment per calendar day. Header = day + the day's hours (no prefix). Each time block is a bullet with its window. ONE thing in a block -> inline (`- {time}: {thing}`). MULTIPLE things -> end the time bullet with `:` and NEST the items as sub-bullets two spaces in. Items terse + past-tense.

```
{DayOfWeek} {MonDate} — {dayHours}h
- {startTime}–{endTime}: {single thing}
- {startTime}–{endTime}:
  - {thing}
  - {thing}
```

Real example (aha1-9, Mon Apr 6):
```
Mon Apr 6 — 4.0h
- 8:30–8:45 AM: Daily standup
- 8:45–10:30 AM:
  - Completed Phase 12 governance E2E
  - Set up Miro diagrams
  - Synced with Dan S.
- 12:30–2:30 PM: Built Phase 13 cross-app E2E
```

### Session Summary Guidelines
- Be specific: what component/feature/bug, not "general development".
- Short and plain — one line per session, action-oriented.
- Include ticket/PR references when relevant.
- Marketplace meetings fold in as a normal session line (no separate meeting task).
- Cancelled / skipped meetings (0h) get NO line — never surface cancellations in the summary or comments.

## API Reference

### Create Task
```
platform.Task.create → { newTask: { name, description, activityId, priority: 200, assigned, boundaryId, boardId, approvers: [<approverId>], notified: [], links: [] } }
```
- **Pass BOTH `boundaryId` AND `boardId` at creation** — board membership can't be added retroactively cleanly. If missed, delete and recreate.
- `approvers` is a PLURAL array. No `ownerId` needed.

### Add Comment (one per day)
```
platform.Task.addComment → { id: <taskId>, newTaskComment: { commentMarkdown: "<day comment>" } }
```
**Gotcha:** field is `commentMarkdown` (or `commentTxt`), NOT `body`.

### Update Description
```
platform.Task.update → { id, updateTask: { description: "<rebuilt markdown>" } }
```

### Tagging
```
store.Resource.tagResource → { id: <taskId>, uUID: [<tagId>] }
```
Apply the per-stream Work Log tag after creating each task. Tags are **User-scoped, owned by Clark, tagType `other`** (created 2026-06-17 via `hydra.Tag.createTag` — which DOES work on prod; only the hydra *tagResource* path 404s, so apply via `store.Resource.tagResource`):
- **work-log.zerobias** (ZeroBias tasks): `d60783b6-920e-4d0d-86f2-e76b6baeec8d`
- **work-log.w3geekery** (W3Geekery tasks): `2fd326cc-c38e-465e-8565-7080d09403fe`

(Supersedes the old `1a845f76…` w3geekery tag and the `…general-development` text footers.)

## Hour Redistribution Rule

- ZeroBias capped at 20h/week, filled FIRST (4h/weekday, flexible as long as the week sums to 20h — a light day is made up by a heavier day in the same week).
- W3Geekery / SME Mart capped at 15h/week, fills ABOVE the 20h ZB. Hours over 15h = worked-not-invoiced (overage line on the SM task).
- The cap is evaluated at the **WEEKLY** level. Tasks show billed hours after redistribution; the work record (timers) is never edited.

# Changelog

All notable changes to `tt` are documented here. Newest first.

## 2026-04-14

### Changed
- **`/tt:backfill` is now timestamp-aware.** `[SESSION_RECAP]` bullets carry UTC timestamp prefixes (`(HH:MM–HH:MMZ)` / `(HH:MMZ)` / multi-day `(YYYY-MM-DD HH:MMZ…)`), and backfill now routes each bullet to the timer whose segment range contains that timestamp — not the timer that happened to be running when the recap was written.
  - New Step 2.5 in the command workflow parses bullets, resolves timestamps (inheriting the session's date when no date prefix is present), walks `timer_segments` to confirm the bullet falls inside an active segment (not a pause gap), and re-routes accordingly.
  - **Cross-day scanning:** recap events are queried over `[target-date, target-date+3]` so a recap written Friday about Monday's work still lands on Monday.
  - Orphaned bullets (timestamp falls in a gap, before the first timer, or after the last) are flagged in the dry-run preview for Clark to attach, drop, or defer.
  - Bullets whose timestamp resolves to a different PT day are listed under "Deferred to other days" in the preview.
  - Preview annotations show `(HH:MMZ→re-routed from HH:MM session)` so the user can see what moved; timestamp prefixes are stripped before writing to `update_timer`.
  - Step 3's note-generation priority order was reshuffled: re-routed bullets rank #1, un-timestamped bullets #2, everything else shifts down.

### Fixed
- **`scripts/dev-server.sh start` no longer ignores a half-running state.** Previously `do_start` checked only port 4301 (API) to decide "server already running" — so if the Angular UI child died (e.g., external `SIGTERM`), every subsequent `server_start` / `server_restart` call would short-circuit without noticing the dead UI. The script now:
  - Checks **both** ports (4301 + 4302) and treats any half-up configuration as broken.
  - When a partial state is detected, kills the surviving half plus any orphaned `tsx watch`, `concurrently`, or `npm run dev` parents scoped to the `tt` repo path, then respawns cleanly.
  - Readiness polling waits for **both** ports to come up before returning success (60s window to accommodate Angular cold builds, up from 30s).

## 2026-04-13

### Added
- **Collapsible timer cards on the daily page.** New `TimerCardCollapsedComponent` renders a single-line strip with slug, recur icon, single-letter company/project/task chips, live-updating duration, and a media-control status glyph (play triangle when running, stop square when stopped, two bars when paused, hollow circle when scheduled). Click the ⌃ button in the expanded view to collapse; click the strip (or ⌄) to expand. State persists per-timer in `sessionStorage` and rehydrates after a reload.
- **`launchctl` agent for the dev servers.** New `com.w3geekery.tt-web-servers` LaunchAgent starts the Express API (4301) + Angular UI (4302) at login via `RunAtLoad`, with a daily 6 AM calendar restart preserved. Program points at a descriptive `scripts/tt-web-servers` symlink so it appears with a readable name in System Settings → Login Items.
- **New tests.** `TimerCardCollapsedComponent` adds 7 `getSingleLetter()` cases; `DailyComponent` gets a new spec with 12 sessionStorage round-trip cases (missing/malformed data, quota-exceeded tolerance, hydration). UI test suite: 68 → 87 passing.

### Fixed
- **Autocap backdated stops to the wrong time when the running timer had pauses.** `checkCaps` now walks the running timer's segments to find the exact moment remaining cap budget was exhausted, instead of assuming continuous run from `timer.started`. Previously a 30-minute pause inside a running timer caused autocap to clip the stop time ~30 minutes too early, losing tracked time. (`src/core/cron/engine.ts`)
- **Autocap stopped firing after same-day data edits.** The `cap_hit` notification dedup check was guarding the *entire* loop body — including the overflow switch. If a notification had been sent earlier in the day but subsequent edits put the project back below cap and then over again, the overflow switch would never fire. Dedup now only guards the notification itself; the overflow switch fires whenever cap is exceeded, a timer is running on the capped project, and overflow is configured.

### Changed
- `TimerCardComponent` picked up `initiallyCollapsed` input, `isCollapsed` signal, `toggleCollapse()` method, and `onCollapseToggle` output; the expanded view gained a small ⌃ collapse button. `DailyComponent` gained `collapsedStates` signal, `getCollapsedTimers()` / `saveCollapsedState()` / `hydrateCollapsedStates()` helpers, and an `onTimerCollapsed` handler wired through `daily.html`.
- `~/Library/LaunchAgents/com.w3geekery.tt-dev.plist` renamed (label + program path) to `com.w3geekery.tt-web-servers`.

## 2026-04-10

### Added
- **`daily_digest` MCP tool** — single call returns a backfill-optimized summary of a day's timers + specstory events (recaps, commits, PRs), bucketed into per-timer slots. Replaces multi-step `sqlite3` queries in the backfill workflow with one ~2–3 KB response.
- **Entity slugs** for companies, projects, and tasks — enables human-friendly IDs in MCP tool calls.

## 2026-04-09

### Added
- **Favorite timer templates** — save a company/project/task combo as a favorite and quick-start or schedule new timers from it via a split-button menu on the daily page.

### Fixed
- **Timer card double-counted live elapsed time** when a timer was running — the server's `duration_ms` already includes the open segment (via `COALESCE(ended, now())`), so adding the client's `currentElapsed` on top caused durations to grow at 2× real time. Now computed from segments: completed segments + the open segment's elapsed.
- **Segment rounding** and **notification dedup** edge cases.

## Earlier

Pre-`v0.1.0` history lives in `git log` — see commits `b7ec63a` (`/tt` slash command scaffolding) through `4e74c21` (initial scaffold).

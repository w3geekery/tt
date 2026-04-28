# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.6](https://github.com/w3geekery/tt/compare/v0.1.5...v0.1.6) (2026-04-28)


### Features

* **tt:** inline segment editing + break notes ([8bd6c4d](https://github.com/w3geekery/tt/commit/8bd6c4d7b177168f8ffa4553f95a8648725daee2))

### [0.1.5](https://github.com/w3geekery/tt/compare/v0.1.4...v0.1.5) (2026-04-17)


### Features

* **tt:** skip recurring timer occurrence with running-timer handling ([b5adce2](https://github.com/w3geekery/tt/commit/b5adce2600318d96185e56d0951702d44d733f05))

### [0.1.4](https://github.com/w3geekery/tt/compare/v0.1.3...v0.1.4) (2026-04-16)


### Features

* **tt:** greeting/farewell lifecycle + drop DarkWake cron ([9fa9c58](https://github.com/w3geekery/tt/commit/9fa9c582c658d2bffe59a8768716ce9ad6522268))

### [0.1.3](https://github.com/w3geekery/tt/compare/v0.1.2...v0.1.3) (2026-04-15)


### Bug Fixes

* auto-bump ui/src/app/version.ts on npm run release ([e0d38bc](https://github.com/w3geekery/tt/commit/e0d38bcfa28120ce5d513e0e93115f9a3da314b6))

### [0.1.2](https://github.com/w3geekery/tt/compare/v0.1.1...v0.1.2) (2026-04-15)


### Bug Fixes

* **dev-server:** audit log, HTTP-based readiness, retry on failure ([db74426](https://github.com/w3geekery/tt/commit/db74426459ce21a66ca79aa89d14db0da634cd7d))

### 0.1.1 (2026-04-14)


### Features

* add /ss slash command with SQLite cache ([fb790af](https://github.com/w3geekery/tt/commit/fb790af3d45f2038fc9a2c64036016596f316dd8))
* add /tt slash command with autocap, backfill, transcript sub-commands ([b7ec63a](https://github.com/w3geekery/tt/commit/b7ec63a6341914367b6194f2b333bf5d1b05b9b8))
* add 11 missing MCP tools, update parity checklist ([fc114b2](https://github.com/w3geekery/tt/commit/fc114b290591ba964ad301738a7266564be88983))
* add data migration, backup, and restore scripts ([4a3a9ec](https://github.com/w3geekery/tt/commit/4a3a9ec3f7c8b7fa3da9b3eb61957320128a275e))
* add specstory_sessions table for SQLite-backed session cache ([a39b44a](https://github.com/w3geekery/tt/commit/a39b44a0ad18eebe151726ff5911d884e29da751))
* collapsible timer cards, autocap fixes, launchd dev servers ([1453055](https://github.com/w3geekery/tt/commit/145305585241cd0af3f47544190488f304aa9743))
* complete parity hitlist — 27 items from old timetracker-ui ([1a141c6](https://github.com/w3geekery/tt/commit/1a141c6f7abc9b5835f12be478c9ebee8a4a9129))
* entity slugs, daily_digest MCP tool, backfill optimization ([b948de3](https://github.com/w3geekery/tt/commit/b948de3584759a4807f7b90a93551f5f812c3645))
* favorite templates, segment rounding fixes, notification dedup ([5a45dec](https://github.com/w3geekery/tt/commit/5a45dec5e599aa0cfb26ed714a6936fafe24682f))
* implement Angular UI with Material Design ([50ad375](https://github.com/w3geekery/tt/commit/50ad37559dfefc418a9835b39312fd63feb2709b))
* implement cron engine, notifications, and state sync ([3a75d0e](https://github.com/w3geekery/tt/commit/3a75d0e0afeb9225e3ad124f82c656de1dd0f35a))
* implement database layer with all CRUD modules ([f37a2aa](https://github.com/w3geekery/tt/commit/f37a2aa03a682f2e36d51a0ed9ed3e8d02735a65))
* implement Express API with all routes and SSE broadcast ([a7732f3](https://github.com/w3geekery/tt/commit/a7732f38ff0c60c5837a01eb5397ec9bc9fc5145))
* implement invoice aggregation with 15-min rounding and HTML template ([a84d765](https://github.com/w3geekery/tt/commit/a84d76584d1a63618bd34196ba508783add72990))
* implement MCP server with all tools (direct DB, no HTTP) ([db0f513](https://github.com/w3geekery/tt/commit/db0f51349e5a5407e4deaa0322e1f1291d60ed5b))
* Pacific Time fixes, specstory SQLite migration, dev server management ([0f8c9da](https://github.com/w3geekery/tt/commit/0f8c9da8f2cb590919b5a31bbf8177c36cd65f73))
* replace Angular UI with old app source, rewrite Express API to match ([ba291a3](https://github.com/w3geekery/tt/commit/ba291a360931d7d428859608590b8ce3c6018d28))
* scaffold tt — local-first time tracker ([4e74c21](https://github.com/w3geekery/tt/commit/4e74c21b903701f4f5105191556704ec0f09a899))
* timestamp-aware /tt:backfill + dev-server half-state recovery ([4e40133](https://github.com/w3geekery/tt/commit/4e40133f40177977369d1125e76528f2bedacae5)), closes [#1](https://github.com/w3geekery/tt/issues/1) [#2](https://github.com/w3geekery/tt/issues/2) [#3](https://github.com/w3geekery/tt/issues/3) [#4](https://github.com/w3geekery/tt/issues/4)
* **ui:** add snackbars, theme toggle, inline editing, segments, filters ([04741a9](https://github.com/w3geekery/tt/commit/04741a954bf85a8b38cbbea36e58b623e9ea84a7))
* **ui:** config drill-down, breadcrumbs, color picker ([eccdc18](https://github.com/w3geekery/tt/commit/eccdc18d8071848c8d90217294442aa778e665b5))
* **ui:** skeleton loaders, new timer dialog, scheduled timers ([d164be5](https://github.com/w3geekery/tt/commit/d164be5c71c94599a26672b4eac7f9165372790d))
* **ui:** weekly column layout and monthly calendar grid ([df7b3ae](https://github.com/w3geekery/tt/commit/df7b3aea940123e65f58c58df9f8627ab2b49aa4))


### Bug Fixes

* timer card double-counts open segment elapsed time ([c523542](https://github.com/w3geekery/tt/commit/c523542a950be37bcf669a231f51573f23e4db10))

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

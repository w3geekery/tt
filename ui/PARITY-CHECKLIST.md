# Feature Parity Checklist — tt vs timetracker-ui

Tracking missing features from the old Angular app that need to be ported to tt.

## UX / Interaction
- [x] Snackbar notifications — feedback after actions (start, stop, create, delete, etc.)
- [x] Dark/light/system theme toggle with localStorage persistence
- [x] Keyboard shortcut — R to refresh
- [x] Skeleton loaders — shimmer placeholders while data loads
- [x] Inline time editing — click to edit start/end times on timer cards
- [x] Inline notes editing (plain text, markdown deferred)
- [x] Stop-at-time split menu — schedule a future stop time
- [x] Company filter chips — multi-select filtering on daily/weekly/monthly views
- [x] Expandable segment list — show pause/resume segments with break durations
- [x] Color picker with EyeDropper API in settings

## Timer Features
- [ ] Timer templates — quick-pick buttons for most-used company/project/task combos
- [x] Scheduled timers — create timers with start_at for future auto-start (via dialog)
- [ ] Make-recurring from timer — convert one-off to recurring rule
- [ ] Per-segment notes

## Views
- [x] Weekly column layout — Mon-Fri columns with timers per day (respects weekend toggle)
- [x] Monthly calendar grid — clickable day cells with company dots and hours
- [ ] Notification timeline — SVG visual on daily page with hour markers
- [x] Config page drill-down — 4-level hierarchy (company → project → task → timer history)
- [x] Breadcrumb navigation
- [x] "Today" quick-nav button on daily view when viewing a past date
- [x] Weekend toggle for weekly/monthly views (preference service + settings menu)

## Missing from initial build
- [x] Delete timer support on timer cards
- [x] Timer update support (notes, times) from cards

## Dialogs
- [x] New timer dialog with inline create for company/project/task (+ schedule option)
- [ ] Changelog dialog

## Data
- [ ] External task links — structured provider/task/url (ZeroBias, Jira, GitHub)
- [x] Timer history table in config (per-task, with delete)

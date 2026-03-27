# Autocap — Auto-Switch at ZeroBias Daily Cap

Automatically switch from ZeroBias to W3Geekery when today's ZeroBias hours hit the 4h daily cap.

> **IMPORTANT:** Before performing any date/time actions, check the current date/time (e.g., `date`) to ensure you are using real time, not training data.

## Arguments

`$ARGUMENTS`

## Flow

1. Call `date` to get current time (Pacific)
2. Call `mcp__tt__daily_summary` to get today's ZeroBias total (completed entries only)
3. Call `mcp__tt__get_running_timer` to check what's currently running

## Decision Logic

**ZeroBias total >= 4h AND running timer is ZeroBias:**
Stop the running timer now. Start `W3Geekery / SME Mart / General Development`.
Display: "ZeroBias at cap (Xh). Switched to W3Geekery / SME Mart / General Development."

**ZeroBias total >= 4h AND running timer is NOT ZeroBias (or no timer):**
Display: "ZeroBias already at cap (Xh). No action needed."

**ZeroBias total < 4h AND running timer is ZeroBias:**
Calculate remaining minutes: `remaining = 4h - (completed_zb_hours + running_elapsed)`
Calculate switch time: `now + remaining`
If remaining <= 0: treat as already at cap (stop + switch now).
Otherwise:
- Call `mcp__tt__update_timer` on the running timer to set `notify_on_switch: true`
- Call `mcp__tt__schedule_timer` with `start_at` = switch time, company = `W3Geekery`, project = `SME Mart`, task = `General Development`
- Call `mcp__tt__schedule_notification` with trigger_at = switch time, title = "ZeroBias cap — switching to W3Geekery"
- Display: "ZeroBias at Xh Ym. Will auto-switch to W3Geekery at HH:MM AM/PM (Zm remaining). Notification scheduled."

**ZeroBias total < 4h AND running timer is NOT ZeroBias:**
Display: "ZeroBias at Xh today (under cap). Not currently running a ZeroBias timer — no autocap needed."

## Edge Cases

- **Paused timers:** A paused timer does NOT accumulate time. Treat paused ZeroBias timer as "not running" for autocap purposes — paused time is already accounted for in `duration_ms`. Do not schedule an autocap switch while a timer is paused.
- **Recalculation:** If an autocap scheduled timer already exists for today (check `mcp__tt__list_timers` for a scheduled W3Geekery/SME Mart/General Development entry), delete it first before creating a new one. This lets Clark re-run `autocap` after mid-day timer changes.
- **Scheduled conflicts:** If there are other scheduled timers between now and the calculated switch time, warn Clark: "Note: scheduled timer [name] at [time] will interrupt before autocap at [time]."
- **Past switch time:** If the calculated switch time is in the past (due to elapsed time during calculation), switch immediately.

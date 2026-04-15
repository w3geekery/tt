#!/bin/bash
# tt dev server control — start/stop/status
# Used by launchd (com.w3geekery.tt-web-servers) and manual invocation.

# Ensure node/npm are on PATH (launchd has minimal PATH, nvm not sourced)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

TT_DIR="/Users/cstacer/Projects/w3geekery/tt"
API_PORT=4301
UI_PORT=4302
LOG_FILE="/tmp/tt-dev.log"
AUDIT_LOG="$HOME/.tt/dev-server-audit.log"
PID_FILE="$HOME/.tt/dev-server.pid"
MAX_START_ATTEMPTS=3
READY_TIMEOUT=90         # seconds to wait for both ports to serve HTTP

mkdir -p "$(dirname "$AUDIT_LOG")" 2>/dev/null

# ─── Audit logging ───────────────────────────────────────────────
# Every invocation gets a block in $AUDIT_LOG identifying who ran it,
# what their parent process was, and whether the system recently woke
# from sleep. This lets us correlate unexpected restarts with external
# triggers (launchd, another Claude session calling server_restart, a
# manual shell invocation, a wake-from-sleep cascade, etc.).

log_audit() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [pid $$] $*" >> "$AUDIT_LOG"
}

log_caller_chain() {
  local depth=0 pid=$PPID
  while [ -n "$pid" ] && [ "$pid" != "0" ] && [ "$pid" != "1" ] && [ $depth -lt 6 ]; do
    local cmd ppid
    cmd=$(ps -o command= -p "$pid" 2>/dev/null | head -c 200)
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    log_audit "    ancestor[$depth]: pid=$pid cmd='$cmd'"
    [ -z "$ppid" ] && break
    pid=$ppid
    depth=$((depth + 1))
  done
}

log_wake_context() {
  # `pmset -g log` shows sleep/wake events. Look at the last entry
  # and flag if it's within the last 10 minutes (likely related).
  local now_epoch last_wake last_wake_epoch delta
  now_epoch=$(date +%s)
  # Look for a line like "2026-04-15 06:22:10 -0700 Wake …"
  last_wake=$(pmset -g log 2>/dev/null | awk '/ Wake / && NF > 3 {ts=$1" "$2; line=$0} END{print ts"\t"line}')
  if [ -n "$last_wake" ]; then
    local wake_ts="${last_wake%%$'\t'*}"
    local wake_line="${last_wake#*$'\t'}"
    last_wake_epoch=$(date -j -f "%Y-%m-%d %H:%M:%S" "$wake_ts" "+%s" 2>/dev/null)
    if [ -n "$last_wake_epoch" ]; then
      delta=$((now_epoch - last_wake_epoch))
      if [ $delta -lt 600 ]; then
        log_audit "    wake: $wake_line (${delta}s ago — may be relevant)"
      else
        log_audit "    wake: last wake was ${delta}s ago — unlikely cause"
      fi
    fi
  fi
}

# ─── Port / process helpers ──────────────────────────────────────

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing processes on port $port: $pids"
    log_audit "    kill_port $port: TERM pids=$(echo "$pids" | tr '\n' ',')"
    echo "$pids" | xargs kill -TERM 2>/dev/null
    sleep 2
    pids=$(lsof -ti:"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
      echo "Force killing survivors on port $port: $pids"
      log_audit "    kill_port $port: KILL survivors=$(echo "$pids" | tr '\n' ',')"
      echo "$pids" | xargs kill -9 2>/dev/null
    fi
  fi
}

cleanup_tt_processes() {
  kill_port $API_PORT
  kill_port $UI_PORT
  # Match by tt repo path so we don't touch unrelated node processes.
  pkill -f "$TT_DIR/node_modules/.bin/tsx" 2>/dev/null || true
  pkill -f "$TT_DIR/node_modules/.bin/concurrently" 2>/dev/null || true
  pkill -f "$TT_DIR.*npm run dev" 2>/dev/null || true
  sleep 1
}

# ─── Readiness check ─────────────────────────────────────────────
# Poll BOTH ports via actual HTTP (not lsof). `ng serve` can bind the
# port before it's able to respond; curl round-trips catch that race.

wait_for_ready() {
  local timeout=${1:-$READY_TIMEOUT}
  local api_ready=false ui_ready=false
  local api_start_sec=0 ui_start_sec=0
  for i in $(seq 1 "$timeout"); do
    if ! $api_ready; then
      if curl -sf --max-time 2 "http://localhost:$API_PORT/api/auth/me" &>/dev/null; then
        api_ready=true
        api_start_sec=$i
        echo "API ready on port $API_PORT (after ${i}s)"
      fi
    fi
    if ! $ui_ready; then
      # Angular's dev server serves the index page with a <!doctype ...>
      # or <html prefix — grep confirms it's actually responding, not just
      # bound. --max-time prevents a slow first response from blocking.
      if curl -s --max-time 3 "http://localhost:$UI_PORT/" 2>/dev/null | grep -qiE "<!doctype|<html"; then
        ui_ready=true
        ui_start_sec=$i
        echo "UI ready on port $UI_PORT (after ${i}s)"
      fi
    fi
    if $api_ready && $ui_ready; then
      log_audit "    ready: API@${api_start_sec}s UI@${ui_start_sec}s"
      return 0
    fi
    sleep 1
  done
  $api_ready || echo "Warning: API not ready after ${timeout}s"
  $ui_ready || echo "Warning: UI not ready after ${timeout}s"
  log_audit "    NOT ready after ${timeout}s (api=$api_ready ui=$ui_ready)"
  return 1
}

# ─── Start, with retry ───────────────────────────────────────────
# Single-attempt start. Returns 0 on success, 1 on readiness timeout.
# Called by do_start in a retry loop.

do_start_once() {
  cd "$TT_DIR" || return 1
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
  nohup npm run dev >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  echo "Started dev server (PID $pid), logging to $LOG_FILE"
  log_audit "    spawn: npm run dev pid=$pid"
  wait_for_ready "$READY_TIMEOUT"
}

do_start() {
  # Check current state of BOTH ports. A half-running state (API up, UI down,
  # or vice versa) is NOT "already running" — it's a broken process tree
  # that must be torn down and restarted.
  local api_up=false ui_up=false
  lsof -ti:$API_PORT &>/dev/null && api_up=true
  lsof -ti:$UI_PORT &>/dev/null && ui_up=true

  if $api_up && $ui_up; then
    echo "Server already running (API:$API_PORT UI:$UI_PORT)"
    log_audit "  skip: both ports already up"
    exit 0
  fi

  if $api_up || $ui_up; then
    echo "Partial state detected (API:$api_up UI:$ui_up) — cleaning up before restart"
    log_audit "  partial state: api=$api_up ui=$ui_up"
  fi

  # Retry loop: up to MAX_START_ATTEMPTS, with a clean teardown between each.
  local attempt
  for attempt in $(seq 1 $MAX_START_ATTEMPTS); do
    log_audit "  start attempt $attempt/$MAX_START_ATTEMPTS"
    cleanup_tt_processes
    if do_start_once; then
      log_audit "  SUCCESS on attempt $attempt"
      return 0
    fi
    echo "Attempt $attempt/$MAX_START_ATTEMPTS failed; backing off before retry..."
    log_audit "  attempt $attempt failed — backing off"
    # Exponential-ish backoff: 3s, 6s, 12s
    sleep $((3 * attempt))
  done

  echo "ERROR: all $MAX_START_ATTEMPTS start attempts failed. See $LOG_FILE and $AUDIT_LOG."
  log_audit "  FAIL: exhausted $MAX_START_ATTEMPTS attempts"
  return 1
}

do_stop() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping dev server (PID $pid)"
      log_audit "    stop: TERM pid=$pid"
      kill -TERM "$pid" 2>/dev/null
      sleep 2
    fi
    rm -f "$PID_FILE"
  fi
  kill_port $API_PORT
  kill_port $UI_PORT
  echo "Dev server stopped"
}

do_status() {
  local api_up=false ui_up=false
  lsof -ti:$API_PORT &>/dev/null && api_up=true
  lsof -ti:$UI_PORT &>/dev/null && ui_up=true

  if $api_up && $ui_up; then
    echo "running (API:$API_PORT UI:$UI_PORT)"
    exit 0
  elif $api_up; then
    echo "partial (API:$API_PORT up, UI:$UI_PORT down)"
    exit 1
  else
    echo "stopped"
    exit 1
  fi
}

# ─── Entry point ─────────────────────────────────────────────────

ACTION="${1:-status}"

# Always audit-log every invocation with full ancestry + wake context.
# Status-only calls get a minimal line to avoid log bloat.
if [ "$ACTION" = "status" ]; then
  log_audit "invoke: $0 $*"
else
  log_audit "invoke: $0 $* (action=$ACTION)"
  log_caller_chain
  log_wake_context
fi

case "$ACTION" in
  start)  do_start ;;
  stop)   do_stop ;;
  status) do_status ;;
  restart)
    do_stop
    sleep 1
    do_start
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    exit 1
    ;;
esac

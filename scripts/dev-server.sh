#!/bin/bash
# tt dev server control — start/stop/status
# Used by launchd (com.w3geekery.tt-dev) and manual invocation.

# Ensure node/npm are on PATH (launchd has minimal PATH, nvm not sourced)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

TT_DIR="/Users/cstacer/Projects/w3geekery/tt"
API_PORT=4301
UI_PORT=4302
LOG_FILE="/tmp/tt-dev.log"
PID_FILE="$HOME/.tt/dev-server.pid"

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing processes on port $port: $pids"
    echo "$pids" | xargs kill -TERM 2>/dev/null
    sleep 2
    # Force kill any survivors
    pids=$(lsof -ti:"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
      echo "Force killing survivors on port $port: $pids"
      echo "$pids" | xargs kill -9 2>/dev/null
    fi
  fi
}

do_start() {
  # Check current state of BOTH ports. A half-running state (API up, UI down,
  # or vice versa) is NOT "already running" — it's a broken process tree that
  # must be torn down and restarted, otherwise subsequent do_start calls are
  # no-ops that leave the dead half dead. See changelog 2026-04-14.
  local api_up=false ui_up=false
  lsof -ti:$API_PORT &>/dev/null && api_up=true
  lsof -ti:$UI_PORT &>/dev/null && ui_up=true

  if $api_up && $ui_up; then
    echo "Server already running (API:$API_PORT UI:$UI_PORT)"
    exit 0
  fi

  if $api_up || $ui_up; then
    echo "Partial state detected (API:$api_up UI:$ui_up) — cleaning up before restart"
  fi

  # Clean up stale ports AND any orphaned concurrently/tsx/npm parents that
  # might otherwise survive a port kill and re-spawn a zombie child.
  kill_port $API_PORT
  kill_port $UI_PORT
  # Kill orphaned tt-specific dev processes (match tt repo path to avoid
  # touching unrelated node processes elsewhere on the machine).
  pkill -f "$TT_DIR/node_modules/.bin/tsx" 2>/dev/null || true
  pkill -f "$TT_DIR/node_modules/.bin/concurrently" 2>/dev/null || true
  pkill -f "$TT_DIR.*npm run dev" 2>/dev/null || true
  sleep 1

  # Start the dev server
  cd "$TT_DIR" || exit 1
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
  nohup npm run dev >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  echo "Started dev server (PID $pid), logging to $LOG_FILE"

  # Wait for BOTH API and UI to be ready — not just API.
  local api_ready=false ui_ready=false
  for i in $(seq 1 60); do
    if ! $api_ready && curl -sf "http://localhost:$API_PORT/api/auth/me" &>/dev/null; then
      api_ready=true
      echo "API ready on port $API_PORT (after ${i}s)"
    fi
    if ! $ui_ready && lsof -ti:$UI_PORT &>/dev/null; then
      ui_ready=true
      echo "UI ready on port $UI_PORT (after ${i}s)"
    fi
    if $api_ready && $ui_ready; then
      return 0
    fi
    sleep 1
  done

  if ! $api_ready; then echo "Warning: API not ready after 60s"; fi
  if ! $ui_ready; then echo "Warning: UI not ready after 60s"; fi
  return 1
}

do_stop() {
  # Try PID file first
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping dev server (PID $pid)"
      kill -TERM "$pid" 2>/dev/null
      sleep 2
    fi
    rm -f "$PID_FILE"
  fi

  # Kill anything still on the ports
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

case "${1:-status}" in
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

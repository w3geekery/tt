#!/usr/bin/env python3
"""specstory-scan.py — Cross-repo SpecStory session aggregator.

Scans all .specstory/history/ folders across configured project roots,
filters by date/date-range, extracts session summaries, groups by company,
and outputs reports for /ttui rollup integration.

Usage:
    specstory-scan.py                          # Today's sessions
    specstory-scan.py today                    # Today's sessions
    specstory-scan.py yesterday                # Yesterday's sessions
    specstory-scan.py week                     # This week (Mon-Sun)
    specstory-scan.py last-week                # Last week
    specstory-scan.py 2026-02-18               # Specific date
    specstory-scan.py 2026-02-10 2026-02-18    # Date range
    specstory-scan.py --json                   # JSON output
    specstory-scan.py --for-rollup             # Compact format for /ttui rollup notes
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, date, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

PT = ZoneInfo("America/Los_Angeles")
UTC = ZoneInfo("UTC")

# tt SQLite database — the live cache consumed by daily_digest / backfill.
DB_PATH = Path.home() / ".tt" / "tt.db"
# Heartbeat the freshness-check (tt cron) reads to detect a stalled scanner.
HEARTBEAT_PATH = Path.home() / ".tt" / "logs" / "specstory-scan.heartbeat"

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# Project roots to scan for .specstory folders
PROJECT_ROOTS = [
    Path.home() / "Projects" / "zb",
    Path.home() / "Projects" / "w3geekery",
]

# Map repo paths to companies for grouping
# Matched by checking if the session path contains the key
COMPANY_MAP = {
    "w3geekery": "w3geekery",
    "Projects/zb": "ZeroBias",
}

# Repos to skip (internal/meta, not real dev work)
SKIP_PATTERNS = [
    # Add patterns for repos you want to exclude
]


# ═══════════════════════════════════════════════════════════════════════════════
# Discovery
# ═══════════════════════════════════════════════════════════════════════════════

def find_specstory_dirs(roots: list[Path]) -> list[Path]:
    """Find all .specstory/history directories under project roots."""
    dirs = []
    for root in roots:
        if not root.exists():
            continue
        for dirpath, dirnames, _ in os.walk(root):
            # Don't descend into node_modules, .git, etc.
            dirnames[:] = [
                d for d in dirnames
                if d not in {"node_modules", ".git", "dist", "build", "__pycache__"}
            ]
            p = Path(dirpath)
            history = p / ".specstory" / "history"
            if history.is_dir():
                dirs.append(history)
                # Don't descend further into .specstory
                if ".specstory" in dirnames:
                    dirnames.remove(".specstory")
    return sorted(set(dirs))


def repo_name_from_path(history_path: Path) -> str:
    """Extract a readable repo name from a .specstory/history path."""
    # Go up two levels from history/ to get the repo root
    repo_root = history_path.parent.parent
    # Find the shortest distinguishing path from project roots
    for root in PROJECT_ROOTS:
        try:
            rel = repo_root.relative_to(root)
            return str(rel)
        except ValueError:
            continue
    return str(repo_root)


def company_from_path(history_path: Path) -> str:
    """Determine company from the repo path."""
    path_str = str(history_path)
    for pattern, company in COMPANY_MAP.items():
        if pattern in path_str:
            return company
    return "Unknown"


# ═══════════════════════════════════════════════════════════════════════════════
# Session Parsing
# ═══════════════════════════════════════════════════════════════════════════════

def parse_date_from_filename(filename: str) -> date | None:
    """Extract date from specstory filename, converted to Pacific Time.

    Filenames use UTC timestamps (e.g., 2026-03-20_01-45-11Z) but the session
    may belong to the previous PT day (2026-03-19 6:45 PM PT). Always convert
    to PT before extracting the date.
    """
    dt = parse_datetime_from_filename(filename)
    if dt:
        return dt.date()
    # Fallback for filenames without full timestamp
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})_", filename)
    if match:
        try:
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError:
            pass
    return None


def parse_datetime_from_filename(filename: str) -> datetime | None:
    """Extract datetime from specstory filename."""
    match = re.match(r"(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})Z", filename)
    if match:
        try:
            return datetime.strptime(
                f"{match.group(1)} {match.group(2)}:{match.group(3)}:{match.group(4)}",
                "%Y-%m-%d %H:%M:%S"
            ).replace(tzinfo=ZoneInfo("UTC")).astimezone(PT)
        except ValueError:
            pass
    return None


def extract_title_from_filename(filename: str) -> str:
    """Extract human-readable title from filename."""
    match = re.match(r"\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(?:-\d{2})?Z?-?(.*)\.md", filename)
    if match and match.group(1):
        return match.group(1).replace("-", " ").strip()
    return filename


def extract_message_dates_from_content(content: str) -> set[date]:
    """Extract all unique dates from message timestamps in session content.

    Message timestamps use format: "2026-03-20 02:12:28Z" (space-separated, not T-separated).
    Pattern: _**User|Agent ...(DATE TIME)**_

    Returns set of PT dates found in the content.
    """
    dates = set()
    # Match: _**...(YYYY-MM-DD HH:MM:SSZ)**_
    pattern = r"_\*\*(?:User|Agent).*?\((?:.*?\s)?(\d{4}-\d{2}-\d{2})\s(\d{2}):(\d{2}):(\d{2})Z\)\*\*_"
    for match in re.finditer(pattern, content):
        try:
            year, month, day = match.group(1).split('-')
            hour, minute, second = match.group(2), match.group(3), match.group(4)
            # Parse the full UTC timestamp and convert to PT
            dt_utc = datetime(
                int(year), int(month), int(day),
                int(hour), int(minute), int(second),
                tzinfo=ZoneInfo("UTC")
            )
            dt_pt = dt_utc.astimezone(PT)
            dates.add(dt_pt.date())
        except (ValueError, IndexError, TypeError):
            pass
    return dates


def find_sessions(history_dir: Path, start_date: date, end_date: date) -> list[Path]:
    """Find session files within a date range.

    Sessions can span multiple days (started in one day, contain messages from next day).
    This function:
    1. Includes files with filenames in the target range
    2. Includes files from up to LOOKBACK_DAYS BEFORE the start date — a session
       started on a Friday can hold Mon/Tue work (a weekend-spanning file), so a
       2-day window misses it. 4 days covers Fri-started files scanned on Tue.
    """
    sessions = []
    if not history_dir.exists():
        return sessions

    # Expand search window to catch multi-day / long-running session files. A
    # single session file can span many PT days (started one day, still active
    # days later); a small window misses one whose FILENAME predates the target
    # by more than the lookback. 14 days covers realistically long sessions.
    LOOKBACK_DAYS = 14
    search_start = start_date - timedelta(days=LOOKBACK_DAYS)

    def _collect_sessions(directory: Path):
        """Recursively collect session files from a directory."""
        results = []
        if not directory.exists():
            return results
        try:
            for f in directory.iterdir():
                if not f.suffix == ".md":
                    continue
                file_date = parse_date_from_filename(f.name)
                if file_date and search_start <= file_date <= end_date:
                    results.append(f)
        except (OSError, PermissionError):
            pass
        return results

    # Collect from flat structure
    sessions.extend(_collect_sessions(history_dir))

    # Collect from year/month subdirectories (organized repos)
    try:
        for subdir in history_dir.iterdir():
            if subdir.is_dir() and re.match(r"\d{4}", subdir.name):
                for month_dir in subdir.iterdir():
                    if month_dir.is_dir():
                        sessions.extend(_collect_sessions(month_dir))
    except (OSError, PermissionError):
        pass

    return sorted(sessions, key=lambda p: p.name)


def _clean_recap_line(line: str) -> str:
    """Normalize a recap bullet: drop Read-tool line-number prefixes, bullet
    markers, and bold markup. e.g. '163\\t- **Added** foo' -> 'Added foo'."""
    line = line.strip()
    # Leading line-number prefix from an embedded Read/cat -n rendering.
    line = re.sub(r"^\d+\t\s*", "", line)
    line = re.sub(r"^\d+\s{2,}", "", line)
    line = line.lstrip("-*• ").strip()
    line = re.sub(r"\*\*", "", line)  # strip bold markers
    line = re.sub(r"\s+", " ", line)  # collapse internal newlines/whitespace
    return line.strip()


def extract_session_recap(content: str) -> list[str]:
    """Extract [SESSION_RECAP] tagged blocks — highest priority source.

    Only extracts from the LAST [SESSION_RECAP] block (most complete).
    Filters out non-bullet noise (timestamps, markdown artifacts, user text).
    """
    recaps = re.findall(
        r"\[SESSION_RECAP\](.*?)\[/SESSION_RECAP\]",
        content, re.DOTALL
    )
    if not recaps:
        return []

    # Use the last recap block (most likely the final/complete one)
    last_recap = recaps[-1]
    bullets = []
    seen = set()
    for line in last_recap.strip().split("\n"):
        line = _clean_recap_line(line)
        # Skip noise: timestamps, markdown artifacts, short lines, meta text, JSON fragments
        if (not line
                or len(line) <= 5
                or line.startswith("_**")
                or line.startswith("[SESSION_RECAP")
                or line.startswith("[/SESSION_RECAP")
                or line.startswith("```")
                or '":' in line or '","' in line  # embedded JSON fragment
                or "CLAUDE.md" in line
                or "please" in line.lower()
                or re.match(r"^\*?\*?Agent", line)):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        bullets.append(line)
    # Cap: a real recap is a handful of bullets. A session that pastes/discusses
    # a giant [SESSION_RECAP] block (e.g. designing this very pipeline) would
    # otherwise dump thousands of garbage "bullets" onto the day.
    return bullets[:40]


def extract_completion_recaps(content: str) -> list[str]:
    """Extract Claude-generated completion summaries (fallback for older sessions)."""
    bullets = []

    # GSD completion summaries
    for pattern in [
        r"## What Was Delivered\n((?:- .+\n?)+)",
        r"## Key Accomplishments\n((?:- .+\n?)+)",
        r"## All Phases Complete.*?\n((?:\|.+\n)+)",
        r"(?:All done|Here's what.*accomplished|completed this session)[!:.\n]*((?:\s*[-*] .+\n?)+)",
    ]:
        for match in re.finditer(pattern, content, re.DOTALL):
            block = match.group(1)
            for line in block.strip().split("\n"):
                line = _clean_recap_line(line)
                if (line and len(line) > 10
                        and not line.startswith("|--")
                        and not line.startswith("## ")
                        and not line.startswith("# ")
                        and '":' not in line and '","' not in line):
                    bullets.append(line[:200])

    # Test count milestones (highest count only — avoid "471 tests passing" x N)
    test_counts = [int(m.group(1)) for m in re.finditer(r"(\d+) tests? (?:passing|pass|green|complete)", content)]
    big = [c for c in test_counts if c >= 10]
    if big:
        bullets.append(f"{max(big)} tests passing")

    # ZB platform actions (task created, deployed, etc.)
    for pattern in [
        r"(task[- ]\w+ created in prod[^.\n]*)",
        r"(Created \d+ (?:ZeroBias|w3geekery) task[^.\n]*)",
        r"(PR #\d+[^.\n]*?(?:merged|created)[^.\n]*)",
        r"(deployed to (?:prod|uat|staging)[^.\n]*)",
        r"(published [`@\w./-]*(?:schema|package)[^.\n]*)",
    ]:
        for match in re.finditer(pattern, content, re.IGNORECASE):
            text = _clean_recap_line(match.group(1))[:150]
            if not text or len(text) < 12:
                continue
            if '":' in text or '","' in text or '```' in text:  # JSON / fence noise
                continue
            if "session:" in text.lower() or "claude --resume" in text.lower():
                continue
            if text not in bullets:
                bullets.append(text)

    # Final case-insensitive dedup, preserving order.
    deduped = []
    seen = set()
    for b in bullets:
        key = b.lower()
        if b and key not in seen:
            seen.add(key)
            deduped.append(b)
    return deduped[:15]  # Cap at 15 items


def extract_session_summary(filepath: Path, target_date: date | None = None) -> dict:
    """Extract a rich summary from a session file.

    Priority order for content:
    1. [SESSION_RECAP] tags (deterministic, Claude-generated)
    2. Completion recaps (heuristic, from GSD summaries and wrap-up messages)
    3. Git commits within session (conventional commit messages)
    4. PR references
    5. Goal (first user message — lowest priority, often useless)

    If target_date is provided and the session file is from a previous day,
    filters content to only include messages from the target date.
    """
    content = filepath.read_text(errors="replace")
    file_date = parse_date_from_filename(filepath.name)

    # If this is a cross-day session and we're scanning for a specific date,
    # check if the file actually contains content from that date
    if target_date and file_date and file_date != target_date:
        content_dates = extract_message_dates_from_content(content)
        if target_date not in content_dates:
            # This session doesn't contain content from the target date
            # Return an empty/placeholder summary
            return {
                "filename": filepath.name,
                "filepath": str(filepath),
                "date": str(file_date),  # Return the filename date, not target_date
                "time": "",
                "title": extract_title_from_filename(filepath.name),
                "goal": "",
                "session_recap": [],
                "completion_recap": [],
                "user_messages": 0,
                "agent_messages": 0,
                "files_modified": [],
                "key_files": [],
                "commits": [],
                "pr_urls": [],
                "outcome": "unknown",
                "size_kb": filepath.stat().st_size // 1024,
                "_skip": True,  # Flag to skip this in grouping
            }

    # Count user/agent messages
    user_msgs = re.findall(r"_\*\*User", content)
    agent_msgs = re.findall(r"_\*\*(?:Agent|Assistant)", content)

    # 1. Extract [SESSION_RECAP] tags (highest priority)
    session_recap = extract_session_recap(content)

    # 2. Extract completion recaps (fallback)
    completion_recap = extract_completion_recaps(content) if not session_recap else []

    # 3. Extract goal (lowest priority — often useless but kept for display)
    goal = ""
    user_blocks = re.finditer(
        r"_\*\*User[^*]*\*\*_\s*(?:<!--[^>]+-->)?\s*(.*?)(?=_\*\*(?:User|Agent|Assistant)|$)",
        content, re.DOTALL
    )
    for block in user_blocks:
        text = block.group(1).strip()
        if re.match(r"<command-name>", text):
            continue
        for line in text.split("\n"):
            line = line.strip()
            if (line
                    and not line.startswith("<!--")
                    and not line.startswith("<")
                    and not line.startswith("/")
                    and len(line) > 5):
                goal = line[:200]
                break
        if goal:
            break

    # Extract file modifications (Edit/Write tool calls)
    edits = set()
    key_files = set()
    for match in re.finditer(r'(?:Edit|Write)\(["\']?([^"\')\s,]+)', content):
        path = match.group(1)
        edits.add(Path(path).name)
        if "/" in path and not path.startswith("<"):
            key_files.add(path)

    # Detect commits within session
    commits = re.findall(r'git commit.*?-m\s+["\']([^"\']+)', content)

    # Detect PRs
    pr_urls = sorted(set(re.findall(
        r'(https://github\.com/[^\s)>"]+/pull/\d+)', content
    )))

    # Detect key outcomes
    outcome = "unknown"
    if commits:
        outcome = "committed"
    elif edits:
        outcome = "code_changes"
    elif len(user_msgs) <= 2 and not edits:
        outcome = "research"
    else:
        outcome = "in_progress"

    dt = parse_datetime_from_filename(filepath.name)
    time_str = dt.strftime("%-I:%M %p") if dt else ""

    # Every PT day this session actually touches (from message timestamps, not
    # the filename). A long-running session belongs to ALL these days; downstream
    # caching attributes each recap bullet to the day it happened.
    content_dates = sorted({str(d) for d in extract_message_dates_from_content(content)})
    if not content_dates:
        _fd = parse_date_from_filename(filepath.name)
        content_dates = [str(_fd)] if _fd else []

    return {
        "filename": filepath.name,
        "filepath": str(filepath),
        "date": str(parse_date_from_filename(filepath.name)),
        "content_dates": content_dates,
        "time": time_str,
        "title": extract_title_from_filename(filepath.name),
        "goal": goal,
        "session_recap": session_recap,
        "completion_recap": completion_recap,
        "user_messages": len(user_msgs),
        "agent_messages": len(agent_msgs),
        "files_modified": sorted(edits),
        "key_files": sorted(key_files)[:20],
        "commits": commits,
        "pr_urls": pr_urls,
        "outcome": outcome,
        "size_kb": filepath.stat().st_size // 1024,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Date Parsing
# ═══════════════════════════════════════════════════════════════════════════════

def today_pt() -> date:
    return datetime.now(PT).date()


def parse_period(args) -> tuple[date, date, str]:
    """Parse command-line period arguments into (start_date, end_date, label)."""
    today = today_pt()

    if not args.period:
        args.period = "today"

    period = args.period.lower()

    if period == "today":
        return today, today, f"Today ({today.strftime('%a %b %-d, %Y')})"

    if period == "yesterday":
        yd = today - timedelta(days=1)
        return yd, yd, f"Yesterday ({yd.strftime('%a %b %-d, %Y')})"

    if period == "week":
        mon = today - timedelta(days=today.weekday())
        fri = mon + timedelta(days=4)
        return mon, today, f"This Week ({mon.strftime('%b %-d')} – {fri.strftime('%b %-d')})"

    if period == "last-week":
        mon = today - timedelta(days=today.weekday() + 7)
        sun = mon + timedelta(days=6)
        return mon, sun, f"Last Week ({mon.strftime('%b %-d')} – {sun.strftime('%b %-d')})"

    # Specific date
    if re.match(r"\d{4}-\d{2}-\d{2}$", period):
        d = date.fromisoformat(period)
        end = d
        # Check for second date arg (range)
        if args.end_date:
            end = date.fromisoformat(args.end_date)
        if d == end:
            return d, end, d.strftime("%a %b %-d, %Y")
        return d, end, f"{d.strftime('%b %-d')} – {end.strftime('%b %-d, %Y')}"

    print(f"Error: Unknown period '{period}'", file=sys.stderr)
    print("Usage: today | yesterday | week | last-week | YYYY-MM-DD [YYYY-MM-DD]", file=sys.stderr)
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════════════════
# Reporting
# ═══════════════════════════════════════════════════════════════════════════════

OUTCOME_EMOJI = {
    "committed": "\u2705",    # ✅
    "code_changes": "\U0001f527",  # 🔧
    "research": "\U0001f4da",      # 📚
    "in_progress": "\U0001f6a7",   # 🚧
    "unknown": "\u2753",           # ❓
}


def print_report(grouped: dict, label: str, for_rollup: bool = False):
    """Print human-readable report grouped by company > repo."""
    total_sessions = sum(
        len(sessions)
        for repos in grouped.values()
        for sessions in repos.values()
    )

    if for_rollup:
        # Compact format for /ttui rollup notes
        print(f"## Work Summary — {label}\n")
        for company, repos in sorted(grouped.items()):
            print(f"### {company}")
            for repo, sessions in sorted(repos.items()):
                for s in sessions:
                    outcome = OUTCOME_EMOJI.get(s["outcome"], "")
                    files = ", ".join(s["files_modified"][:5]) if s["files_modified"] else ""
                    pr_info = f" | PR: {s['pr_urls'][0]}" if s["pr_urls"] else ""
                    goal_short = s["goal"][:120] if s["goal"] else s["title"]
                    print(f"- {outcome} **{repo}**: {goal_short}{pr_info}")
                    if files:
                        print(f"  Files: {files}")
            print()
        return

    # Full report
    print(f"SpecStory Session Report — {label}")
    print("=" * 60)
    print(f"Sessions found: {total_sessions}")
    print()

    if total_sessions == 0:
        print("No sessions found for this period.")
        return

    for company, repos in sorted(grouped.items()):
        company_sessions = sum(len(s) for s in repos.values())
        print(f"┌─ {company} ({company_sessions} session{'s' if company_sessions != 1 else ''})")
        print("│")

        for repo, sessions in sorted(repos.items()):
            print(f"│  ┌─ {repo}")

            for s in sessions:
                outcome = OUTCOME_EMOJI.get(s["outcome"], "?")
                time_str = s["time"] or "??:??"
                title = s["title"][:50]
                print(f"│  │  {outcome} {time_str} — {title}")

                if s["goal"]:
                    goal_display = s["goal"][:80]
                    print(f"│  │     Goal: {goal_display}")

                if s["files_modified"]:
                    files = ", ".join(s["files_modified"][:8])
                    if len(s["files_modified"]) > 8:
                        files += f" (+{len(s['files_modified']) - 8} more)"
                    print(f"│  │     Files: {files}")

                if s["commits"]:
                    print(f"│  │     Commits: {len(s['commits'])}")

                if s["pr_urls"]:
                    for url in s["pr_urls"]:
                        print(f"│  │     PR: {url}")

                print(f"│  │     ({s['user_messages']} user / {s['agent_messages']} agent msgs, {s['size_kb']}KB)")
                print("│  │")

            print("│  └─")
            print("│")

        print("└─")
        print()


def json_report(grouped: dict, label: str):
    """Output JSON report."""
    output = {
        "label": label,
        "generated": datetime.now(PT).isoformat(),
        "companies": {},
    }

    for company, repos in grouped.items():
        output["companies"][company] = {}
        for repo, sessions in repos.items():
            output["companies"][company][repo] = sessions

    print(json.dumps(output, indent=2))


# ═══════════════════════════════════════════════════════════════════════════════
# Git Commit Harvesting
# ═══════════════════════════════════════════════════════════════════════════════

GIT_REPOS = [
    ("zb/ui", Path.home() / "Projects" / "zb" / "ui"),
    ("zerobias-org-forks/app", Path.home() / "Projects" / "w3geekery" / "zerobias-org-forks" / "app"),
    ("sme-mart", Path.home() / "Projects" / "w3geekery" / "zerobias-org-forks" / "app" / "package" / "w3geekery" / "sme-mart"),
]

# Skip commits from unbillable repos
SKIP_COMMIT_REPOS = {"timetracker-ui"}

# Only harvest Clark's OWN commits. The git repos are shared (zb/ui has Thomas
# Cavalier, his "Bungalow" merge identity, and github-actions); without this
# filter, co-workers' commits get attributed to Clark's timers and billed.
# git's --author is an OR-regex matched against "Name <email>"; multiple flags
# are OR'd. Covers the w3geekery work identity + personal-email fallback.
GIT_AUTHORS = [
    "Clark Stacer",
    "clark@w3geekery.com",
    "clark.stacer@gmail.com",
]


def harvest_git_commits(target_date: date) -> list[dict]:
    """Harvest Clark's git commits for a specific date across all known repos."""
    import subprocess

    next_day = target_date + timedelta(days=1)
    commits = []
    seen_hashes = set()  # Deduplicate (sme-mart commits appear in app too)
    author_flags = [f"--author={a}" for a in GIT_AUTHORS]

    for repo_name, repo_path in GIT_REPOS:
        if repo_name in SKIP_COMMIT_REPOS:
            continue
        if not repo_path.exists():
            continue

        try:
            result = subprocess.run(
                ["git", "-C", str(repo_path), "log",
                 f"--after={target_date}T00:00:00",
                 f"--before={next_day}T00:00:00",
                 "--format=%aI|%h|%s",
                 "--no-merges",
                 *author_flags],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                continue

            for line in result.stdout.strip().split("\n"):
                if not line:
                    continue
                parts = line.split("|", 2)
                if len(parts) < 3:
                    continue

                iso_time, short_hash, message = parts
                if short_hash in seen_hashes:
                    continue
                seen_hashes.add(short_hash)

                # Parse time to PT
                try:
                    dt = datetime.fromisoformat(iso_time).astimezone(PT)
                    time_str = dt.strftime("%-I:%M %p")
                    time_sort = dt.strftime("%H:%M")
                except (ValueError, OSError):
                    time_str = "??:??"
                    time_sort = "99:99"

                commits.append({
                    "time": time_str,
                    "time_sort": time_sort,
                    "iso": iso_time,  # raw %aI (with offset) — for event timestamps
                    "type": "commit",
                    "repo": repo_name,
                    "hash": short_hash,
                    "message": message.strip(),
                })
        except (subprocess.TimeoutExpired, OSError):
            continue

    return commits


# ═══════════════════════════════════════════════════════════════════════════════
# Claude `recap:` harvesting — subtype "away_summary" in the session JSONL
# ───────────────────────────────────────────────────────────────────────────────
# Clark stopped writing [SESSION_RECAP] blocks once Claude Code started emitting
# its own `recap:` footer. That footer is NOT in specstory markdown — it lives in
# ~/.claude/projects/<cwd-hash>/<session>.jsonl as a {type:system, subtype:
# away_summary} record carrying a precise UTC timestamp + cwd. So attribution is
# exact (no cross-day guessing, cwd -> company/repo). This is the primary recap
# source from ~May onward. tt/timetracker-ui are unbillable tooling — skipped.
# ═══════════════════════════════════════════════════════════════════════════════

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"
AWAY_SKIP_CWD_SUBSTRINGS = ("/w3geekery/tt", "/timetracker-ui")
_AWAY_RECAP_SUFFIX = re.compile(r"\s*\(disable recaps in /config\)\s*$")
_AWAY_CACHE: dict[str, list] | None = None


def _cwd_to_company_repo(cwd: str) -> tuple[str, str] | None:
    """Map a Claude session cwd to (company, repo). None = skip (unbillable/unknown)."""
    if not cwd or any(s in cwd for s in AWAY_SKIP_CWD_SUBSTRINGS):
        return None
    if "/package/w3geekery/sme-mart" in cwd:
        return ("w3geekery", "sme-mart")
    if "/zerobias-org-forks/app" in cwd:
        return ("w3geekery", "zerobias-org-forks/app")
    if "/Projects/zb/ui" in cwd:
        return ("ZeroBias", "zb/ui")
    if "w3geekery" in cwd:
        return ("w3geekery", "w3geekery")
    if "/Projects/zb" in cwd:
        return ("ZeroBias", "zb")
    return None


def _load_away_summaries() -> dict[str, list]:
    """Parse every ~/.claude/projects/*/*.jsonl once; return {date_pt -> [rows]}.

    Each row: {jsonl, ts(UTC datetime), company, repo, content}. Cached per run.
    Near-identical consecutive summaries (same chunk re-summarized) are deduped,
    keeping the later/more-complete one."""
    global _AWAY_CACHE
    if _AWAY_CACHE is not None:
        return _AWAY_CACHE
    out: dict[str, list] = {}
    if CLAUDE_PROJECTS_DIR.exists():
        for jf in CLAUDE_PROJECTS_DIR.glob("*/*.jsonl"):
            try:
                lines = jf.read_text(errors="replace").splitlines()
            except OSError:
                continue
            for line in lines:
                if '"away_summary"' not in line:  # cheap pre-filter before json
                    continue
                try:
                    o = json.loads(line)
                except (json.JSONDecodeError, ValueError):
                    continue
                if o.get("subtype") != "away_summary":
                    continue
                content, ts = o.get("content"), o.get("timestamp")
                if not isinstance(content, str) or not ts:
                    continue
                cr = _cwd_to_company_repo(o.get("cwd", ""))
                if not cr:
                    continue
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(UTC)
                except (ValueError, TypeError):
                    continue
                clean = _AWAY_RECAP_SUFFIX.sub("", content).strip()
                if not clean:
                    continue
                out.setdefault(dt.astimezone(PT).date().isoformat(), []).append(
                    {"jsonl": str(jf), "ts": dt, "company": cr[0], "repo": cr[1], "content": clean})
    for dpt, rows in out.items():
        rows.sort(key=lambda r: r["ts"])
        deduped: list[dict] = []
        seen: dict[tuple, int] = {}
        for r in rows:
            key = (r["repo"], r["content"][:60].lower())
            if key in seen:
                deduped[seen[key]] = r  # keep the later, more complete summary
            else:
                seen[key] = len(deduped)
                deduped.append(r)
        out[dpt] = deduped
    _AWAY_CACHE = out
    return out


def harvest_away_summaries(target_date: date) -> list[dict]:
    """Claude `recap:` (away_summary) rows for a PT date, attributed by cwd."""
    return _load_away_summaries().get(str(target_date), [])


def build_timeline(sessions: list[dict], commits: list[dict]) -> list[dict]:
    """Merge sessions and commits into a chronological timeline."""
    timeline = []

    for s in sessions:
        # Parse session time for sorting
        dt = parse_datetime_from_filename(s["filename"])
        time_sort = dt.strftime("%H:%M") if dt else "99:99"

        timeline.append({
            "time": s.get("time", ""),
            "time_sort": time_sort,
            "type": "session",
            "repo": s.get("repo", ""),
            "title": s.get("title", ""),
            "goal": s.get("goal", ""),
            "outcome": s.get("outcome", ""),
            "session_recap": s.get("session_recap", []),
            "completion_recap": s.get("completion_recap", []),
            "user_messages": s.get("user_messages", 0),
            "agent_messages": s.get("agent_messages", 0),
            "size_kb": s.get("size_kb", 0),
            "commits": s.get("commits", []),
            "pr_urls": s.get("pr_urls", []),
        })

    for c in commits:
        timeline.append(c)

    # Extract PRs from sessions as their own timeline entries (deliverables)
    seen_prs = set()
    for s in sessions:
        for url in s.get("pr_urls", []):
            if url in seen_prs:
                continue
            seen_prs.add(url)
            # Parse repo and PR number from URL
            pr_match = re.match(r"https://github\.com/([^/]+/[^/]+)/pull/(\d+)", url)
            if pr_match:
                repo = pr_match.group(1)
                pr_num = pr_match.group(2)
                # Use session time as PR time (best approximation)
                dt = parse_datetime_from_filename(s["filename"])
                time_sort = dt.strftime("%H:%M") if dt else "99:99"
                time_str = dt.strftime("%-I:%M %p") if dt else ""
                timeline.append({
                    "time": time_str,
                    "time_sort": time_sort,
                    "type": "pr",
                    "repo": repo,
                    "pr_number": int(pr_num),
                    "url": url,
                })

    # Sort by time
    timeline.sort(key=lambda x: x.get("time_sort", "99:99"))

    # Remove sort key from output
    for entry in timeline:
        entry.pop("time_sort", None)

    return timeline


# ═══════════════════════════════════════════════════════════════════════════════
# Filesystem Cache
# ═══════════════════════════════════════════════════════════════════════════════

CACHE_ROOT = Path.home() / ".claude" / "timetracker" / "specstory-cache"

MEETINGS_DIR = (
    Path.home() / "Projects" / "w3geekery" / "zerobias-org-forks" / "app"
    / "package" / "w3geekery" / "sme-mart" / ".claude" / "notes" / "meetings"
)


def find_meeting_for_date(target_date: date) -> dict | None:
    """Check if a marketplace meeting summary exists for a given date.

    Reads the .md file directly — no specstory scanning needed.
    Returns a timeline entry dict or None.
    """
    # Try known filename patterns
    for pattern in [
        f"{target_date}-marketplace.md",
        f"{target_date}-marketplace-meeting.md",
    ]:
        filepath = MEETINGS_DIR / pattern
        if filepath.exists():
            content = filepath.read_text(errors="replace")

            # Extract topics from ### Topics Discussed section
            topics = []
            in_topics = False
            for line in content.split("\n"):
                if "### Topics Discussed" in line:
                    in_topics = True
                    continue
                if in_topics and line.startswith("### "):
                    break
                if in_topics and line.startswith("- **"):
                    topic = re.match(r"- \*\*(.+?)\*\*", line)
                    if topic:
                        topics.append(topic.group(1))

            # Extract time range if present
            time_match = re.search(r"\*\*Time:\*\*\s*(.+)", content)
            time_str = time_match.group(1).strip() if time_match else ""

            # Extract duration
            dur_match = re.search(r"\*\*Duration:\*\*\s*(.+)", content)
            duration = dur_match.group(1).strip() if dur_match else ""

            return {
                "type": "meeting",
                "time": time_str,
                "company": "W3Geekery",
                "meeting_type": "Marketplace Meeting w/ Brian",
                "date": str(target_date),
                "duration": duration,
                "topics": topics,
                "summary_file": str(filepath),
            }
    return None


def cache_path_for_date(d: date) -> Path:
    """Compute cache file path: YYYY/MM/wWW/YYYY-MM-DD.json"""
    iso_year, iso_week, _ = d.isocalendar()
    return CACHE_ROOT / str(d.year) / f"{d.month:02d}" / f"w{iso_week:02d}" / f"{d}.json"


# ═══════════════════════════════════════════════════════════════════════════════
# SQLite ingestion — populates specstory_sessions + specstory_events (the live
# cache consumed by tt's daily_digest / backfill). This is the writer that was
# lost when timetracker-ui was deleted; restored + owned here in tt.
# ═══════════════════════════════════════════════════════════════════════════════

_RECAP_TS_RE = re.compile(r"^\s*[-*]?\s*\(?\s*(?:\d{4}-\d{2}-\d{2}\s+)?(\d{1,2}):(\d{2})\s*[–-]?")


def _utc_z(dt: datetime | None) -> str | None:
    """Normalize a datetime to 'YYYY-MM-DDTHH:MM:SSZ' (UTC)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _message_datetimes_utc(content: str) -> list[datetime]:
    """All message timestamps in a session file as UTC datetimes."""
    out: list[datetime] = []
    pattern = r"_\*\*(?:User|Agent|Assistant).*?\((?:.*?\s)?(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})Z\)\*\*_"
    for m in re.finditer(pattern, content):
        try:
            out.append(datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                                int(m.group(4)), int(m.group(5)), int(m.group(6)), tzinfo=UTC))
        except (ValueError, IndexError):
            pass
    return out


_USER_MSG_RE = re.compile(
    r"_\*\*User\b[^\n]*?\((?:[^()]*?\s)?(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})Z\)\*\*_"
    r"\s*(.*?)(?=_\*\*(?:User|Agent|Assistant)\b|\Z)",
    re.DOTALL,
)


def _user_messages_with_ts(content: str) -> list[tuple[datetime, str]]:
    """Each user message's UTC timestamp + its first meaningful line (the "ask").

    Stored as 'message' events — a conversation fallback so an empty timer slot
    (no recap/commit/PR) can still be reconstructed from what Clark was asking.
    Skips slash-commands, tool/markup noise, and trivially short lines."""
    out: list[tuple[datetime, str]] = []
    for m in _USER_MSG_RE.finditer(content):
        try:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                          int(m.group(4)), int(m.group(5)), int(m.group(6)), tzinfo=UTC)
        except ValueError:
            continue
        first = ""
        for line in m.group(7).strip().split("\n"):
            line = line.strip()
            if line and not line.startswith(("<", ">", "/", "```", "|", "!", "#", "[", "_**")):
                first = line
                break
        if len(first) < 8:
            continue
        out.append((dt, first[:200]))
    return out


def _session_window_utc(session: dict) -> tuple[datetime | None, datetime | None]:
    """[first, last] message UTC datetimes — used to attribute commits to a session."""
    try:
        content = Path(session["filepath"]).read_text(errors="replace")
    except (OSError, KeyError):
        content = ""
    dts = _message_datetimes_utc(content)
    if dts:
        return (min(dts), max(dts))
    dt = parse_datetime_from_filename(session.get("filename", ""))
    if dt:
        dt = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
        return (dt, dt + timedelta(hours=8))
    return (None, None)


def _company_for_commit_repo(repo_name: str) -> str:
    """Map a harvest_git_commits repo label to a company."""
    return "ZeroBias" if repo_name.startswith("zb/") else "w3geekery"


def _bullet_utc(bullet: str, msg_dts: list[datetime], fallback: datetime | None) -> datetime | None:
    """Resolve a recap bullet to a real UTC datetime.

    Recap bullets carry a leading (HH:MM..Z) time but usually no date. A
    long-running session spans several PT days, so the date is recovered by
    matching the bullet's HH:MM against the session's actual message timestamps
    (date-aware) — NOT the session file's name. This is what attributes each
    bullet of a cross-day session to the day it actually happened."""
    # Full date prefix, e.g. "(2026-04-17 23:27Z ...)" — trust it outright.
    m = re.match(r"^\s*[-*]?\s*\(?\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})", bullet)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                            int(m.group(4)), int(m.group(5)), 0, tzinfo=UTC)
        except ValueError:
            pass
    # Time-only prefix (HH:MM) — disambiguate the date via the message timeline.
    m = _RECAP_TS_RE.match(bullet)
    if m:
        bh, bm = int(m.group(1)), int(m.group(2))
        if 0 <= bh <= 23 and 0 <= bm <= 59:
            bminutes = bh * 60 + bm
            if msg_dts:
                best = min(msg_dts, key=lambda dt: abs((dt.hour * 60 + dt.minute) - bminutes))
                return datetime(best.year, best.month, best.day, bh, bm, 0, tzinfo=UTC)
            if fallback:
                return fallback.replace(hour=bh, minute=bm, second=0, microsecond=0)
    # No usable time prefix (e.g. "N tests passing") — fall back to session start.
    if fallback:
        return fallback if fallback.tzinfo else fallback.replace(tzinfo=UTC)
    return None


def _attribute_commit(cdt: datetime, company: str, windows: list, anchor: str | None) -> str | None:
    """Pick the session_path for a commit: same-company session whose window
    contains the commit time, else nearest same-company session, else anchor."""
    cross = None
    for path, comp, start, end in windows:
        if start and end and start <= cdt <= end:
            if comp == company:
                return path
            cross = cross or path
    same = [(p, start) for p, comp, start, end in windows if comp == company and start]
    if same:
        return min(same, key=lambda x: abs((x[1] - cdt).total_seconds()))[0]
    return cross or anchor


def _write_heartbeat(target_str: str, n_sessions: int, n_events: int) -> None:
    """Last-success marker the tt cron freshness-check corroborates."""
    try:
        HEARTBEAT_PATH.parent.mkdir(parents=True, exist_ok=True)
        HEARTBEAT_PATH.write_text(json.dumps({
            "last_run": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "date": target_str,
            "sessions": n_sessions,
            "events": n_events,
        }))
    except OSError:
        pass


def cache_to_sqlite(target_date: date, day_sessions: list[dict], commits: list[dict]) -> tuple[int, int]:
    """Upsert sessions + events into ~/.tt/tt.db for target_date. Idempotent per PT day."""
    if not DB_PATH.exists():
        print(f"[sqlite] DB not found at {DB_PATH}; skipping cache", file=sys.stderr)
        return (0, 0)

    target_str = str(target_date)
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    n_sessions = 0
    n_events = 0
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=15000")
        with conn:
            windows = []  # (path, company, start_utc, end_utc)
            for s in day_sessions:
                path = s.get("filepath")
                if not path:
                    continue
                start, end = _session_window_utc(s)
                try:
                    size_bytes = Path(path).stat().st_size
                except OSError:
                    size_bytes = (s.get("size_kb", 0) or 0) * 1024
                summary = " ".join(s.get("session_recap") or s.get("completion_recap") or []) or None
                conn.execute(
                    """
                    INSERT INTO specstory_sessions
                        (path, repo, company, started, ended, size_bytes, summary, goal,
                         outcome, user_messages, agent_messages, commits, pr_urls, cached_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
                    ON CONFLICT(path) DO UPDATE SET
                        repo=excluded.repo, company=excluded.company, started=excluded.started,
                        ended=excluded.ended, size_bytes=excluded.size_bytes,
                        summary=excluded.summary, goal=excluded.goal, outcome=excluded.outcome,
                        user_messages=excluded.user_messages, agent_messages=excluded.agent_messages,
                        commits=excluded.commits, pr_urls=excluded.pr_urls, cached_at=datetime('now')
                    """,
                    (path, s.get("repo", ""), s.get("company"), _utc_z(start), _utc_z(end),
                     size_bytes, summary, s.get("goal") or None, s.get("outcome"),
                     s.get("user_messages", 0), s.get("agent_messages", 0),
                     json.dumps(s.get("commits", [])), json.dumps(s.get("pr_urls", []))),
                )
                n_sessions += 1
                windows.append((path, s.get("company"), start, end))

            anchor = windows[0][0] if windows else None

            # Idempotent re-insert: clear this PT day's events first.
            conn.execute("DELETE FROM specstory_events WHERE date_pt = ?", (target_str,))
            ins = ("INSERT INTO specstory_events "
                   "(session_path, timestamp, date_pt, role, content, event_type, metadata) "
                   "VALUES (?,?,?,?,?,?,?)")

            for s in day_sessions:
                path = s.get("filepath")
                if not path:
                    continue
                try:
                    content = Path(path).read_text(errors="replace")
                except OSError:
                    content = ""
                msg_dts = _message_datetimes_utc(content)
                start = min(msg_dts) if msg_dts else _session_window_utc(s)[0]
                # Raw user-message "asks" — conversation fallback for slots with no
                # recap/commit/PR. Each carries its own timestamp (cross-day safe);
                # kept OUT of daily_digest (compact) but queryable on demand.
                for mdt, text in _user_messages_with_ts(content):
                    if mdt.astimezone(PT).date() != target_date:
                        continue
                    conn.execute(ins, (path, _utc_z(mdt), target_str, "user",
                                       text, "message", json.dumps({"repo": s.get("repo", "")})))
                    n_events += 1
                # Date each bullet by its own time prefix matched to the session's
                # real message timeline, then keep ONLY the ones landing on
                # target_date. A cross-day session spills its bullets across
                # several PT days instead of dumping them on the filename date.
                for bullet in (s.get("session_recap") or []) + (s.get("completion_recap") or []):
                    if not bullet or not bullet.strip():
                        continue
                    bdt = _bullet_utc(bullet, msg_dts, start)
                    if bdt is None or bdt.astimezone(PT).date() != target_date:
                        continue
                    conn.execute(ins, (path, _utc_z(bdt), target_str, "agent",
                                       bullet.strip(), "session_recap", "{}"))
                    n_events += 1
                # PRs carry no timestamp — attribute to the session's primary PT
                # day (first message) so a cross-day session doesn't duplicate them.
                primary = min(msg_dts).astimezone(PT).date() if msg_dts else target_date
                if primary == target_date:
                    for url in s.get("pr_urls", []):
                        mm = re.match(r"https://github\.com/([^/]+/[^/]+)/pull/(\d+)", url)
                        meta = json.dumps({"repo": mm.group(1), "pr_number": mm.group(2)}) if mm else "{}"
                        ts = start or datetime(target_date.year, target_date.month, target_date.day, 12, tzinfo=UTC)
                        conn.execute(ins, (path, _utc_z(ts), target_str, "agent", url, "pr", meta))
                        n_events += 1

            for c in commits:
                iso = c.get("iso")
                if not iso:
                    continue
                try:
                    cdt = datetime.fromisoformat(iso).astimezone(UTC)
                except (ValueError, OSError):
                    continue
                sp = _attribute_commit(cdt, _company_for_commit_repo(c.get("repo", "")), windows, anchor)
                if not sp:
                    continue  # no session row to satisfy the FK — skip (rare)
                meta = json.dumps({"repo": c.get("repo", ""), "hash": c.get("hash", "")})
                conn.execute(ins, (sp, _utc_z(cdt), target_str, "agent",
                                   c.get("message", ""), "commit", meta))
                n_events += 1

            # Claude `recap:` summaries (away_summary) — each JSONL is a synthetic
            # session row so the recap event satisfies the session_path FK.
            for row in harvest_away_summaries(target_date):
                jp = row["jsonl"]
                try:
                    size_bytes = Path(jp).stat().st_size
                except OSError:
                    size_bytes = 0
                conn.execute(
                    """
                    INSERT INTO specstory_sessions
                        (path, repo, company, started, ended, size_bytes, summary, goal,
                         outcome, user_messages, agent_messages, commits, pr_urls, cached_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
                    ON CONFLICT(path) DO UPDATE SET
                        repo=excluded.repo, company=excluded.company,
                        ended=excluded.ended, cached_at=datetime('now')
                    """,
                    (jp, row["repo"], row["company"], _utc_z(row["ts"]), _utc_z(row["ts"]),
                     size_bytes, None, None, "committed", 0, 0, "[]", "[]"),
                )
                meta = json.dumps({"repo": row["repo"], "source": "away_summary"})
                conn.execute(ins, (jp, _utc_z(row["ts"]), target_str, "agent",
                                   row["content"], "session_recap", meta))
                n_events += 1
    finally:
        conn.close()

    print(f"[sqlite] Cached {n_sessions} sessions, {n_events} events to {DB_PATH}")
    _write_heartbeat(target_str, n_sessions, n_events)
    return (n_sessions, n_events)


def write_daily_cache(grouped: dict, target_date: date):
    """Write a daily cache file with sessions, git commits, and merged timeline.

    Groups sessions by the target date (filters out sessions from other dates
    when a multi-day scan was performed). Harvests git commits and builds
    a chronological timeline merging both sources.
    """
    # Filter sessions to only those matching target_date
    daily_grouped: dict[str, dict[str, list]] = {}
    day_sessions: list[dict] = []
    for company, repos in grouped.items():
        for repo, sessions in repos.items():
            for s in sessions:
                # Include a session for EVERY PT day it touches, not just its
                # filename date — cross-day sessions contribute to each day.
                sdates = s.get("content_dates") or ([s["date"]] if s.get("date") else [])
                if str(target_date) in sdates:
                    if company not in daily_grouped:
                        daily_grouped[company] = {}
                    if repo not in daily_grouped[company]:
                        daily_grouped[company][repo] = []
                    daily_grouped[company][repo].append(s)
                    day_sessions.append(s)

    # Harvest git commits for this date
    commits = harvest_git_commits(target_date)

    # Check for marketplace meeting summary file
    meeting = find_meeting_for_date(target_date)

    if not daily_grouped and not commits and not meeting and not harvest_away_summaries(target_date):
        return  # Nothing for this date

    # Build merged timeline
    timeline = build_timeline(day_sessions, commits)

    # Add meeting entry if found (from summary file, not specstory)
    if meeting:
        timeline.append(meeting)
        timeline.sort(key=lambda x: x.get("time", "99:99"))

    # Organize commits by repo
    commits_by_repo: dict[str, list] = {}
    for c in commits:
        repo = c.get("repo", "unknown")
        if repo not in commits_by_repo:
            commits_by_repo[repo] = []
        commits_by_repo[repo].append(c)

    cache_file = cache_path_for_date(target_date)
    cache_file.parent.mkdir(parents=True, exist_ok=True)

    output = {
        "date": str(target_date),
        "generated": datetime.now(PT).isoformat(),
        "timeline": timeline,
        "summary": {
            "total_sessions": len(day_sessions),
            "total_commits": len(commits),
            "repos": sorted(set(
                [s.get("repo", "") for s in day_sessions] +
                [c.get("repo", "") for c in commits]
            )),
        },
        "companies": daily_grouped,
        "commits_by_repo": commits_by_repo,
    }

    cache_file.write_text(json.dumps(output, indent=2))

    # Restore the lost step: write sessions + events to the live tt SQLite cache.
    cache_to_sqlite(target_date, day_sessions, commits)


def write_cache_for_range(grouped: dict, start_date: date, end_date: date):
    """Write daily cache files for each date in the range that has sessions."""
    # Collect all unique dates from sessions
    dates_seen: set[date] = set()
    for repos in grouped.values():
        for sessions in repos.values():
            for s in sessions:
                cds = s.get("content_dates") or ([s["date"]] if s.get("date") else [])
                for cd in cds:
                    try:
                        d = date.fromisoformat(cd)
                        if start_date <= d <= end_date:
                            dates_seen.add(d)
                    except (ValueError, TypeError):
                        pass

    # Days that have ONLY Claude `recap:` summaries (no specstory session) still
    # need caching — fold their dates in.
    for dpt in _load_away_summaries():
        try:
            d = date.fromisoformat(dpt)
            if start_date <= d <= end_date:
                dates_seen.add(d)
        except (ValueError, TypeError):
            pass

    for d in sorted(dates_seen):
        write_daily_cache(grouped, d)


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Cross-repo SpecStory session aggregator for /ttui integration"
    )
    parser.add_argument("period", nargs="?", default="today",
                        help="today | yesterday | week | last-week | YYYY-MM-DD")
    parser.add_argument("end_date", nargs="?", default=None,
                        help="End date for range (YYYY-MM-DD)")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--for-rollup", action="store_true",
                        help="Compact markdown for /ttui rollup notes")
    parser.add_argument("--roots", nargs="*",
                        help="Override project roots to scan")

    args = parser.parse_args()

    start_date, end_date, label = parse_period(args)

    roots = [Path(r) for r in args.roots] if args.roots else PROJECT_ROOTS

    # Discover all .specstory dirs
    history_dirs = find_specstory_dirs(roots)

    if not history_dirs:
        print("No .specstory/history directories found.", file=sys.stderr)
        print(f"Searched under: {', '.join(str(r) for r in roots)}", file=sys.stderr)
        sys.exit(1)

    # Scan sessions and group by company > repo
    grouped: dict[str, dict[str, list]] = {}

    for hdir in history_dirs:
        sessions = find_sessions(hdir, start_date, end_date)
        if not sessions:
            continue

        repo = repo_name_from_path(hdir)
        company = company_from_path(hdir)

        if company not in grouped:
            grouped[company] = {}
        if repo not in grouped[company]:
            grouped[company][repo] = []

        for session_path in sessions:
            try:
                # For cross-day sessions, validate against the target date range
                # Pass start_date if single-day scan, otherwise None (include all matches)
                target = start_date if start_date == end_date else None
                summary = extract_session_summary(session_path, target_date=target)

                # Skip sessions that don't match the target date (cross-day filtering)
                if summary.get("_skip"):
                    continue

                summary.pop("_skip", None)  # Clean up flag before storing
                summary["repo"] = repo
                summary["company"] = company
                grouped[company][repo].append(summary)
            except Exception as e:
                print(f"Warning: Failed to parse {session_path.name}: {e}", file=sys.stderr)

    # Write daily cache files for each date in the scanned range
    write_cache_for_range(grouped, start_date, end_date)

    if args.json:
        json_report(grouped, label)
    else:
        print_report(grouped, label, for_rollup=args.for_rollup)


if __name__ == "__main__":
    main()

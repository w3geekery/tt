import type Database from 'better-sqlite3';

export interface SpecstorySession {
  path: string;
  repo: string;
  company: string | null;
  started: string | null;
  ended: string | null;
  size_bytes: number;
  summary: string | null;
  goal: string | null;
  outcome: string | null;
  user_messages: number | null;
  agent_messages: number | null;
  commits: string[]; // stored as JSON
  pr_urls: string[]; // stored as JSON
  cached_at: string;
}

type SessionInput = Omit<SpecstorySession, 'cached_at' | 'commits' | 'pr_urls'> & {
  commits?: string[];
  pr_urls?: string[];
};

function mapRow(row: Record<string, unknown>): SpecstorySession {
  return {
    ...row,
    commits: JSON.parse((row.commits as string) ?? '[]'),
    pr_urls: JSON.parse((row.pr_urls as string) ?? '[]'),
  } as SpecstorySession;
}

export function findByPath(db: Database.Database, path: string): SpecstorySession | undefined {
  const row = db.prepare('SELECT * FROM specstory_sessions WHERE path = ?').get(path) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : undefined;
}

export function findByDate(db: Database.Database, dateStr: string): SpecstorySession[] {
  return (db.prepare(
    'SELECT * FROM specstory_sessions WHERE substr(started, 1, 10) = ? ORDER BY started',
  ).all(dateStr) as Array<Record<string, unknown>>).map(mapRow);
}

export function findByDateRange(db: Database.Database, startDate: string, endDate: string): SpecstorySession[] {
  return (db.prepare(
    'SELECT * FROM specstory_sessions WHERE substr(started, 1, 10) >= ? AND substr(started, 1, 10) <= ? ORDER BY started',
  ).all(startDate, endDate) as Array<Record<string, unknown>>).map(mapRow);
}

export function findByRepo(db: Database.Database, repo: string): SpecstorySession[] {
  return (db.prepare(
    'SELECT * FROM specstory_sessions WHERE repo = ? ORDER BY started DESC',
  ).all(repo) as Array<Record<string, unknown>>).map(mapRow);
}

export function findStale(db: Database.Database, path: string, currentSizeBytes: number): boolean {
  const row = findByPath(db, path);
  return !row || row.size_bytes !== currentSizeBytes;
}

const UPSERT_SQL = `
  INSERT INTO specstory_sessions (path, repo, company, started, ended, size_bytes, summary, goal, outcome, user_messages, agent_messages, commits, pr_urls, cached_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(path) DO UPDATE SET
    repo = excluded.repo,
    company = excluded.company,
    started = excluded.started,
    ended = excluded.ended,
    size_bytes = excluded.size_bytes,
    summary = excluded.summary,
    goal = excluded.goal,
    outcome = excluded.outcome,
    user_messages = excluded.user_messages,
    agent_messages = excluded.agent_messages,
    commits = excluded.commits,
    pr_urls = excluded.pr_urls,
    cached_at = datetime('now')
`;

function runUpsert(stmt: Database.Statement, s: SessionInput): void {
  stmt.run(
    s.path, s.repo, s.company, s.started, s.ended, s.size_bytes, s.summary,
    s.goal, s.outcome, s.user_messages, s.agent_messages,
    JSON.stringify(s.commits ?? []), JSON.stringify(s.pr_urls ?? []),
  );
}

export function upsert(db: Database.Database, session: SessionInput): void {
  runUpsert(db.prepare(UPSERT_SQL), session);
}

export function upsertBatch(db: Database.Database, sessions: SessionInput[]): void {
  const stmt = db.prepare(UPSERT_SQL);
  const tx = db.transaction((items: typeof sessions) => {
    for (const s of items) runUpsert(stmt, s);
  });
  tx(sessions);
}

// --- Events ---

export interface SpecstoryEvent {
  id: string;
  session_path: string;
  timestamp: string;
  date_pt: string;
  role: 'user' | 'agent';
  content: string | null;
  event_type: 'message' | 'commit' | 'tool_call' | 'session_recap' | 'pr';
  metadata: Record<string, unknown>;
  // Joined from session
  repo?: string;
  company?: string | null;
}

function mapEvent(row: Record<string, unknown>): SpecstoryEvent {
  return {
    ...row,
    metadata: JSON.parse((row.metadata as string) ?? '{}'),
  } as SpecstoryEvent;
}

export function findEventsByDate(db: Database.Database, dateStr: string): SpecstoryEvent[] {
  return (db.prepare(`
    SELECT e.*, s.repo, s.company
    FROM specstory_events e
    JOIN specstory_sessions s ON s.path = e.session_path
    WHERE e.date_pt = ?
    ORDER BY e.timestamp
  `).all(dateStr) as Array<Record<string, unknown>>).map(mapEvent);
}

export function findEventsByDateRange(db: Database.Database, startDate: string, endDate: string): SpecstoryEvent[] {
  return (db.prepare(`
    SELECT e.*, s.repo, s.company
    FROM specstory_events e
    JOIN specstory_sessions s ON s.path = e.session_path
    WHERE e.date_pt >= ? AND e.date_pt <= ?
    ORDER BY e.timestamp
  `).all(startDate, endDate) as Array<Record<string, unknown>>).map(mapEvent);
}

export function deleteEventsForSession(db: Database.Database, sessionPath: string): number {
  return db.prepare('DELETE FROM specstory_events WHERE session_path = ?').run(sessionPath).changes;
}

export function removeStalePaths(db: Database.Database, validPaths: string[]): number {
  if (validPaths.length === 0) return 0;
  const placeholders = validPaths.map(() => '?').join(',');
  const result = db.prepare(
    `DELETE FROM specstory_sessions WHERE path NOT IN (${placeholders})`,
  ).run(...validPaths);
  return result.changes;
}

// --- Daily Digest ---

export interface DigestRepoInfo {
  recaps: string[];
  prs: string[];
  commit_count: number;
  commit_summary: string;
}

export interface DigestSlot {
  start_utc: string;
  end_utc: string;
  start_pt: string;
  end_pt: string;
  timer_slug: string;
  company: string;
  project: string;
  task: string;
  repos: Record<string, DigestRepoInfo>;
}

export interface DailyDigest {
  date: string;
  timezone: string;
  sessions_count: number;
  total_commits: number;
  total_recaps: number;
  total_prs: number;
  slots: DigestSlot[];
}

export interface TimerSlotInput {
  slug: string;
  started: string;
  ended: string;
  company_name: string;
  project_name: string;
  task_name: string;
}

function formatPT(utcIso: string): string {
  return new Date(utcIso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getCommitPrefix(content: string): string {
  const match = content.match(/^(\w+)(?:\(|:)/);
  return match ? match[1] : 'other';
}

function summarizeCommits(commits: Array<{ content: string | null }>): { count: number; summary: string } {
  if (commits.length === 0) return { count: 0, summary: '' };

  const prefixCounts = new Map<string, number>();
  for (const c of commits) {
    const prefix = getCommitPrefix(c.content ?? '');
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const parts = [...prefixCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([prefix, count]) => `${prefix} x${count}`);

  return { count: commits.length, summary: `${commits.length} commits: ${parts.join(', ')}` };
}

/**
 * Query high-signal events (recaps, PRs, commits) for a date.
 * Commit content is truncated to the first line for prefix grouping.
 */
export function findDigestEventsByDate(db: Database.Database, dateStr: string): SpecstoryEvent[] {
  return (db.prepare(`
    SELECT e.id, e.session_path, e.timestamp, e.date_pt, e.role, e.event_type, e.metadata,
      CASE WHEN e.event_type = 'commit'
        THEN substr(e.content, 1, CASE WHEN instr(e.content, char(10)) > 0 THEN instr(e.content, char(10)) - 1 ELSE 80 END)
        ELSE e.content
      END as content,
      s.repo, s.company
    FROM specstory_events e
    JOIN specstory_sessions s ON s.path = e.session_path
    WHERE e.date_pt = ? AND e.event_type IN ('session_recap', 'pr', 'commit')
    ORDER BY e.timestamp
  `).all(dateStr) as Array<Record<string, unknown>>).map(mapEvent);
}

/**
 * Build a compact daily digest from pre-fetched timers and events.
 * Pure function — no DB access.
 */
export function buildDailyDigest(
  date: string,
  timers: TimerSlotInput[],
  events: SpecstoryEvent[],
): DailyDigest {
  const totalCommits = events.filter(e => e.event_type === 'commit').length;
  const totalRecaps = events.filter(e => e.event_type === 'session_recap').length;
  const totalPrs = events.filter(e => e.event_type === 'pr').length;
  const sessionPaths = new Set(events.map(e => e.session_path));

  const sorted = [...timers].sort((a, b) => a.started.localeCompare(b.started));

  const slots: DigestSlot[] = sorted.map(timer => {
    const slotEvents = events.filter(e =>
      e.timestamp >= timer.started && e.timestamp < timer.ended,
    );

    // Group events by repo
    const repoGroups: Record<string, { recaps: string[]; prs: string[]; commits: Array<{ content: string | null }> }> = {};
    for (const e of slotEvents) {
      const repo = e.repo ?? 'unknown';
      if (!repoGroups[repo]) repoGroups[repo] = { recaps: [], prs: [], commits: [] };
      if (e.event_type === 'session_recap') repoGroups[repo].recaps.push(e.content ?? '');
      else if (e.event_type === 'pr') repoGroups[repo].prs.push(e.content ?? '');
      else if (e.event_type === 'commit') repoGroups[repo].commits.push(e);
    }

    const repos: Record<string, DigestRepoInfo> = {};
    for (const [repo, data] of Object.entries(repoGroups)) {
      const { count, summary } = summarizeCommits(data.commits);
      repos[repo] = { recaps: data.recaps, prs: data.prs, commit_count: count, commit_summary: summary };
    }

    return {
      start_utc: timer.started,
      end_utc: timer.ended,
      start_pt: formatPT(timer.started),
      end_pt: formatPT(timer.ended),
      timer_slug: timer.slug,
      company: timer.company_name,
      project: timer.project_name,
      task: timer.task_name,
      repos,
    };
  });

  return {
    date,
    timezone: 'America/Los_Angeles',
    sessions_count: sessionPaths.size,
    total_commits: totalCommits,
    total_recaps: totalRecaps,
    total_prs: totalPrs,
    slots,
  };
}

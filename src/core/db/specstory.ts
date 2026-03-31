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

export function removeStalePaths(db: Database.Database, validPaths: string[]): number {
  if (validPaths.length === 0) return 0;
  const placeholders = validPaths.map(() => '?').join(',');
  const result = db.prepare(
    `DELETE FROM specstory_sessions WHERE path NOT IN (${placeholders})`,
  ).run(...validPaths);
  return result.changes;
}

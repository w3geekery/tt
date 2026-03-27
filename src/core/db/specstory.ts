import type Database from 'better-sqlite3';

export interface SpecstorySession {
  path: string;
  repo: string;
  company: string | null;
  started: string | null;
  ended: string | null;
  size_bytes: number;
  summary: string | null;
  cached_at: string;
}

export function findByPath(db: Database.Database, path: string): SpecstorySession | undefined {
  return db.prepare('SELECT * FROM specstory_sessions WHERE path = ?').get(path) as SpecstorySession | undefined;
}

export function findByDate(db: Database.Database, dateStr: string): SpecstorySession[] {
  return db.prepare(
    'SELECT * FROM specstory_sessions WHERE date(started) = date(?) ORDER BY started',
  ).all(dateStr) as SpecstorySession[];
}

export function findByDateRange(db: Database.Database, startDate: string, endDate: string): SpecstorySession[] {
  return db.prepare(
    'SELECT * FROM specstory_sessions WHERE date(started) >= date(?) AND date(started) <= date(?) ORDER BY started',
  ).all(startDate, endDate) as SpecstorySession[];
}

export function findByRepo(db: Database.Database, repo: string): SpecstorySession[] {
  return db.prepare('SELECT * FROM specstory_sessions WHERE repo = ? ORDER BY started DESC').all(repo) as SpecstorySession[];
}

export function findStale(db: Database.Database, path: string, currentSizeBytes: number): boolean {
  const row = findByPath(db, path);
  return !row || row.size_bytes !== currentSizeBytes;
}

export function upsert(db: Database.Database, session: Omit<SpecstorySession, 'cached_at'>): void {
  db.prepare(`
    INSERT INTO specstory_sessions (path, repo, company, started, ended, size_bytes, summary, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(path) DO UPDATE SET
      repo = excluded.repo,
      company = excluded.company,
      started = excluded.started,
      ended = excluded.ended,
      size_bytes = excluded.size_bytes,
      summary = excluded.summary,
      cached_at = datetime('now')
  `).run(session.path, session.repo, session.company, session.started, session.ended, session.size_bytes, session.summary);
}

export function upsertBatch(db: Database.Database, sessions: Array<Omit<SpecstorySession, 'cached_at'>>): void {
  const insert = db.prepare(`
    INSERT INTO specstory_sessions (path, repo, company, started, ended, size_bytes, summary, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(path) DO UPDATE SET
      repo = excluded.repo,
      company = excluded.company,
      started = excluded.started,
      ended = excluded.ended,
      size_bytes = excluded.size_bytes,
      summary = excluded.summary,
      cached_at = datetime('now')
  `);

  const tx = db.transaction((items: typeof sessions) => {
    for (const s of items) {
      insert.run(s.path, s.repo, s.company, s.started, s.ended, s.size_bytes, s.summary);
    }
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

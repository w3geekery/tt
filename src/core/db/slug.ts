/**
 * Slug generation for timers.
 *
 * Format: YYMMDD-N where N is the sequence number for the day.
 * Example: 260326-1, 260326-2, etc.
 */

import type Database from 'better-sqlite3';

export function generateSlug(db: Database.Database, date?: Date): string {
  const d = date ?? new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const prefix = `${yy}${mm}${dd}`;

  const row = db
    .prepare(`SELECT slug FROM timers WHERE slug LIKE ? ORDER BY slug DESC LIMIT 1`)
    .get(`${prefix}-%`) as { slug: string } | undefined;

  if (!row) return `${prefix}-1`;

  const lastN = parseInt(row.slug.split('-')[1], 10);
  return `${prefix}-${lastN + 1}`;
}

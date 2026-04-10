/**
 * Entity slug generation for companies, projects, and tasks.
 *
 * Format: kebab-case from name, deduplicated with numeric suffix.
 * Examples: "ZeroBias" → "zerobias", "SME Mart" → "sme-mart", "General Development" → "general-dev"
 */

import type Database from 'better-sqlite3';

/** Convert a name to a kebab-case slug. */
export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '')  // strip non-alphanumeric (keep spaces, hyphens, underscores)
    .replace(/[\s_]+/g, '-')         // spaces/underscores → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens
}

/** Generate a unique slug for an entity, appending -2, -3, etc. if needed. */
export function generateEntitySlug(
  db: Database.Database,
  table: string,
  name: string,
  excludeId?: string,
): string {
  const base = toSlug(name);
  if (!base) return `entity-${Date.now()}`;

  const check = (slug: string): boolean => {
    const query = excludeId
      ? `SELECT id FROM ${table} WHERE slug = ? AND id != ?`
      : `SELECT id FROM ${table} WHERE slug = ?`;
    const params = excludeId ? [slug, excludeId] : [slug];
    return !!db.prepare(query).get(...params);
  };

  if (!check(base)) return base;

  let n = 2;
  while (check(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

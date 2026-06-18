/**
 * Stickies repository — personal notes/todos/reminders/checklists, decoupled from billing.
 *
 * Conventions mirror the other db modules (tasks.ts, notifications.ts):
 *   - IDs are uppercase 32-char hex (randomUUID without dashes)
 *   - timestamps are ISO 8601 strings
 *   - integer flags map to booleans at the boundary
 *   - every write returns the freshly-read, hydrated entity
 *
 * Scope is a tag namespace, not a column: a sticky with no `scope:*` tag is global
 * (visible everywhere); a sticky with `scope:<repo>` tags is repo-local. Multi-scope
 * (several scope tags) falls out for free.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Sticky, StickyTag, SessionStickyRow, NotifyOffsetUnit } from '../types.js';

export interface CreateStickyInput {
  title: string;
  parent_id?: string | null;
  body?: string | null;
  color?: string | null;
  due_at?: string | null;
  notify_enabled?: boolean;
  notify_offset_n?: number | null;
  notify_offset_unit?: NotifyOffsetUnit | null;
  pinned?: boolean;
  position?: number | null;
  tags?: StickyTag[];
}

export interface UpdateStickyInput {
  title?: string;
  parent_id?: string | null;
  body?: string | null;
  color?: string | null;
  due_at?: string | null;
  notify_enabled?: boolean;
  notify_offset_n?: number | null;
  notify_offset_unit?: NotifyOffsetUnit | null;
  pinned?: boolean;
  position?: number | null;
  /** When provided, replaces the sticky's entire tag set. */
  tags?: StickyTag[];
}

export type StickyStatus = 'open' | 'checked' | 'archived' | 'all';

export interface ListStickiesOptions {
  /** When set, restrict to global (no scope tag) + this repo scope. */
  repo_scope?: string;
  /** Default 'open' (checked = 0 AND archived = 0). */
  status?: StickyStatus;
  /** Default true — only top-level stickies (parent_id IS NULL). */
  roots_only?: boolean;
  /** Default false — nest non-archived children under each returned sticky. */
  include_children?: boolean;
  /** Default 50, hard max 100. */
  limit?: number;
}

export interface SessionSliceOptions {
  /** Caller's repo key; enables repo-scoped undated items to surface alongside global due items. */
  repo_scope?: string;
  /** Default 10. */
  limit?: number;
}

// ── helpers ────────────────────────────────────────────────────────────────

const iso = (): string => new Date().toISOString();
const genId = (): string => randomUUID().replace(/-/g, '').toUpperCase();

/**
 * Normalize any accepted datetime to canonical UTC ISO (`...Z`) so all stored
 * instants share one format — required for correct string comparison/ordering of
 * `due_at` against the UTC `now` used by the session slice and the cron fire loop.
 * Bare datetimes (no zone) are interpreted in the machine's local zone, which is
 * Pacific on this host — matching how the rest of tt parses local times.
 */
function normalizeInstant(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: ${value}`);
  return d.toISOString();
}

interface RawSticky {
  id: string;
  parent_id: string | null;
  title: string;
  body: string | null;
  color: string | null;
  due_at: string | null;
  notify_enabled: number;
  notify_offset_n: number | null;
  notify_offset_unit: NotifyOffsetUnit | null;
  checked: number;
  checked_at: string | null;
  pinned: number;
  archived: number;
  archived_at: string | null;
  position: number | null;
  created_at: string;
  updated_at: string;
}

function rawById(db: Database.Database, id: string): RawSticky | undefined {
  return db.prepare('SELECT * FROM stickies WHERE id = ?').get(id) as RawSticky | undefined;
}

function getTags(db: Database.Database, id: string): StickyTag[] {
  return db
    .prepare('SELECT key, value FROM sticky_tags WHERE sticky_id = ? ORDER BY key, value')
    .all(id) as StickyTag[];
}

function mapRow(r: RawSticky, tags: StickyTag[]): Sticky {
  return {
    id: r.id,
    parent_id: r.parent_id,
    title: r.title,
    body: r.body,
    color: r.color,
    due_at: r.due_at,
    notify_enabled: r.notify_enabled === 1,
    notify_offset_n: r.notify_offset_n,
    notify_offset_unit: r.notify_offset_unit,
    checked: r.checked === 1,
    checked_at: r.checked_at,
    pinned: r.pinned === 1,
    archived: r.archived === 1,
    archived_at: r.archived_at,
    position: r.position,
    created_at: r.created_at,
    updated_at: r.updated_at,
    tags,
  };
}

function nextPosition(db: Database.Database, parentId: string | null): number {
  const row = db
    .prepare('SELECT MAX(position) AS m FROM stickies WHERE parent_id IS ?')
    .get(parentId) as { m: number | null };
  return (row?.m ?? 0) + 1;
}

/** Re-derive a parent's checked state from its children (all checked -> checked). */
function syncParentChecked(db: Database.Database, parentId: string): void {
  const parent = rawById(db, parentId);
  if (!parent) return;
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN checked = 1 THEN 1 ELSE 0 END) AS done
       FROM stickies WHERE parent_id = ?`,
    )
    .get(parentId) as { total: number; done: number | null };
  const allDone = counts.total > 0 && (counts.done ?? 0) === counts.total;
  if (allDone && parent.checked !== 1) {
    db.prepare('UPDATE stickies SET checked = 1, checked_at = ?, updated_at = ? WHERE id = ?').run(
      iso(),
      iso(),
      parentId,
    );
  } else if (!allDone && parent.checked === 1) {
    db.prepare('UPDATE stickies SET checked = 0, checked_at = NULL, updated_at = ? WHERE id = ?').run(
      iso(),
      parentId,
    );
  }
}

/**
 * Scope filter fragment for an aliased table `s`. Returns SQL that matches global
 * stickies (no scope tag) OR stickies carrying `scope:<repo>`. Empty when no repo given.
 */
function scopeClause(repo: string | undefined): { sql: string; params: string[] } {
  if (!repo) return { sql: '', params: [] };
  return {
    sql: ` AND (
      NOT EXISTS (SELECT 1 FROM sticky_tags st WHERE st.sticky_id = s.id AND st.key = 'scope')
      OR EXISTS (SELECT 1 FROM sticky_tags st WHERE st.sticky_id = s.id AND st.key = 'scope' AND st.value = ?)
    )`,
    params: [repo],
  };
}

// ── reads ──────────────────────────────────────────────────────────────────

export function findById(db: Database.Database, id: string): Sticky | undefined {
  const raw = rawById(db, id);
  return raw ? mapRow(raw, getTags(db, id)) : undefined;
}

export function listChildren(db: Database.Database, parentId: string): Sticky[] {
  const rows = db
    .prepare(
      `SELECT * FROM stickies WHERE parent_id = ?
       ORDER BY position ASC NULLS LAST, datetime(created_at) ASC`,
    )
    .all(parentId) as RawSticky[];
  return rows.map(r => mapRow(r, getTags(db, r.id)));
}

export function list(db: Database.Database, opts: ListStickiesOptions = {}): Sticky[] {
  const status = opts.status ?? 'open';
  const rootsOnly = opts.roots_only ?? true;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

  let where = 'WHERE 1 = 1';
  if (status === 'open') where += ' AND s.checked = 0 AND s.archived = 0';
  else if (status === 'checked') where += ' AND s.checked = 1 AND s.archived = 0';
  else if (status === 'archived') where += ' AND s.archived = 1';
  if (rootsOnly) where += ' AND s.parent_id IS NULL';

  const scope = scopeClause(opts.repo_scope);

  const rows = db
    .prepare(
      `SELECT s.* FROM stickies s ${where}${scope.sql}
       ORDER BY s.pinned DESC, s.position ASC NULLS LAST, datetime(s.created_at) DESC
       LIMIT ?`,
    )
    .all(...scope.params, limit) as RawSticky[];

  return rows.map(r => {
    const sticky = mapRow(r, getTags(db, r.id));
    if (opts.include_children) {
      sticky.children = listChildren(db, r.id).filter(c => !c.archived);
    }
    return sticky;
  });
}

/**
 * SessionStart slice — the context-frugal contract. Returns open, top-level stickies that are:
 *   - due or overdue (any scope), OR
 *   - repo-scoped and undated (so a repo's todos surface in that repo even without a due date).
 * Deliberately excludes global undated stickies (the grab-bag pile is pull-on-demand).
 */
export function getSessionSlice(db: Database.Database, opts: SessionSliceOptions = {}): SessionStickyRow[] {
  const now = iso();
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const scope = scopeClause(opts.repo_scope);

  const repoScopedUndated = opts.repo_scope
    ? ` OR (s.due_at IS NULL AND EXISTS (
        SELECT 1 FROM sticky_tags st WHERE st.sticky_id = s.id AND st.key = 'scope' AND st.value = ?
      ))`
    : '';
  const surfaceParams = opts.repo_scope ? [now, opts.repo_scope] : [now];

  const rows = db
    .prepare(
      `SELECT s.id, s.title, s.due_at, s.pinned
       FROM stickies s
       WHERE s.checked = 0 AND s.archived = 0 AND s.parent_id IS NULL
         AND ((s.due_at IS NOT NULL AND s.due_at <= ?)${repoScopedUndated})
         ${scope.sql}
       ORDER BY (s.due_at IS NULL) ASC, s.due_at ASC, s.pinned DESC
       LIMIT ?`,
    )
    .all(...surfaceParams, ...scope.params, limit) as Array<{
      id: string;
      title: string;
      due_at: string | null;
      pinned: number;
    }>;

  return rows.map(r => ({ id: r.id, title: r.title, due_at: r.due_at, pinned: r.pinned === 1 }));
}

/** Pull one random open, undated, top-level grab-bag sticky (global or repo-scoped). */
export function grab(db: Database.Database, repo_scope?: string): Sticky | undefined {
  const scope = scopeClause(repo_scope);
  const row = db
    .prepare(
      `SELECT s.* FROM stickies s
       WHERE s.checked = 0 AND s.archived = 0 AND s.parent_id IS NULL AND s.due_at IS NULL
       ${scope.sql}
       ORDER BY RANDOM() LIMIT 1`,
    )
    .get(...scope.params) as RawSticky | undefined;
  return row ? mapRow(row, getTags(db, row.id)) : undefined;
}

// ── writes ─────────────────────────────────────────────────────────────────

export function create(db: Database.Database, input: CreateStickyInput): Sticky {
  const id = genId();
  const now = iso();
  const parentId = input.parent_id ?? null;
  const position = input.position ?? nextPosition(db, parentId);
  const dueAt = input.due_at != null ? normalizeInstant(input.due_at) : null;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO stickies
         (id, parent_id, title, body, color, due_at, notify_enabled, notify_offset_n,
          notify_offset_unit, pinned, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      parentId,
      input.title,
      input.body ?? null,
      input.color ?? null,
      dueAt,
      input.notify_enabled ? 1 : 0,
      input.notify_offset_n ?? null,
      input.notify_offset_unit ?? null,
      input.pinned ? 1 : 0,
      position,
      now,
      now,
    );
    if (input.tags?.length) insertTags(db, id, input.tags);
  });
  tx();

  if (parentId) syncParentChecked(db, parentId);
  return findById(db, id)!;
}

export function update(db: Database.Database, id: string, input: UpdateStickyInput): Sticky | undefined {
  const existing = rawById(db, id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown): void => {
    fields.push(`${col} = ?`);
    values.push(val);
  };

  if (input.title !== undefined) set('title', input.title);
  if (input.parent_id !== undefined) set('parent_id', input.parent_id);
  if (input.body !== undefined) set('body', input.body);
  if (input.color !== undefined) set('color', input.color);
  if (input.due_at !== undefined) set('due_at', input.due_at === null ? null : normalizeInstant(input.due_at));
  if (input.notify_enabled !== undefined) set('notify_enabled', input.notify_enabled ? 1 : 0);
  if (input.notify_offset_n !== undefined) set('notify_offset_n', input.notify_offset_n);
  if (input.notify_offset_unit !== undefined) set('notify_offset_unit', input.notify_offset_unit);
  if (input.pinned !== undefined) set('pinned', input.pinned ? 1 : 0);
  if (input.position !== undefined) set('position', input.position);

  const tx = db.transaction(() => {
    if (fields.length) {
      fields.push('updated_at = ?');
      values.push(iso(), id);
      db.prepare(`UPDATE stickies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    if (input.tags !== undefined) setTags(db, id, input.tags);
  });
  tx();

  // Reparenting can change checked-rollup on both old and new parents.
  if (input.parent_id !== undefined && input.parent_id !== existing.parent_id) {
    if (existing.parent_id) syncParentChecked(db, existing.parent_id);
    if (input.parent_id) syncParentChecked(db, input.parent_id);
  }
  return findById(db, id);
}

export function check(db: Database.Database, id: string): Sticky | undefined {
  const s = rawById(db, id);
  if (!s) return undefined;
  db.prepare('UPDATE stickies SET checked = 1, checked_at = ?, updated_at = ? WHERE id = ?').run(iso(), iso(), id);
  if (s.parent_id) syncParentChecked(db, s.parent_id);
  return findById(db, id);
}

export function uncheck(db: Database.Database, id: string): Sticky | undefined {
  const s = rawById(db, id);
  if (!s) return undefined;
  db.prepare('UPDATE stickies SET checked = 0, checked_at = NULL, updated_at = ? WHERE id = ?').run(iso(), id);
  if (s.parent_id) syncParentChecked(db, s.parent_id);
  return findById(db, id);
}

export function pin(db: Database.Database, id: string): Sticky | undefined {
  return setFlag(db, id, 'pinned', true);
}
export function unpin(db: Database.Database, id: string): Sticky | undefined {
  return setFlag(db, id, 'pinned', false);
}

export function archive(db: Database.Database, id: string): Sticky | undefined {
  if (!rawById(db, id)) return undefined;
  db.prepare("UPDATE stickies SET archived = 1, archived_at = ?, updated_at = ? WHERE id = ?").run(iso(), iso(), id);
  return findById(db, id);
}
export function unarchive(db: Database.Database, id: string): Sticky | undefined {
  if (!rawById(db, id)) return undefined;
  db.prepare('UPDATE stickies SET archived = 0, archived_at = NULL, updated_at = ? WHERE id = ?').run(iso(), id);
  return findById(db, id);
}

export function reorder(db: Database.Database, id: string, position: number): Sticky | undefined {
  if (!rawById(db, id)) return undefined;
  db.prepare('UPDATE stickies SET position = ?, updated_at = ? WHERE id = ?').run(position, iso(), id);
  return findById(db, id);
}

/** Hard delete. Children and tags cascade via FK. */
export function remove(db: Database.Database, id: string): boolean {
  const s = rawById(db, id);
  const result = db.prepare('DELETE FROM stickies WHERE id = ?').run(id);
  if (result.changes > 0 && s?.parent_id) syncParentChecked(db, s.parent_id);
  return result.changes > 0;
}

// ── hierarchy ────────────────────────────────────────────────────────────────

/** Gather existing stickies under a parent (build a checklist). Ignores self/missing ids. */
export function makeChecklist(db: Database.Database, parentId: string, childIds: string[]): Sticky | undefined {
  if (!rawById(db, parentId)) return undefined;
  const now = iso();
  const stmt = db.prepare('UPDATE stickies SET parent_id = ?, updated_at = ? WHERE id = ? AND id != ?');
  const tx = db.transaction(() => {
    for (const childId of childIds) stmt.run(parentId, now, childId, parentId);
  });
  tx();
  syncParentChecked(db, parentId);
  return findById(db, parentId);
}

/** Break a sticky out of its checklist (top-level). */
export function detach(db: Database.Database, id: string): Sticky | undefined {
  const s = rawById(db, id);
  if (!s) return undefined;
  db.prepare('UPDATE stickies SET parent_id = NULL, updated_at = ? WHERE id = ?').run(iso(), id);
  if (s.parent_id) syncParentChecked(db, s.parent_id);
  return findById(db, id);
}

// ── tags ─────────────────────────────────────────────────────────────────────

function insertTags(db: Database.Database, id: string, tags: StickyTag[]): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO sticky_tags (sticky_id, key, value) VALUES (?, ?, ?)');
  for (const t of tags) stmt.run(id, t.key, t.value);
}

export function setTags(db: Database.Database, id: string, tags: StickyTag[]): Sticky | undefined {
  if (!rawById(db, id)) return undefined;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sticky_tags WHERE sticky_id = ?').run(id);
    insertTags(db, id, tags);
    db.prepare('UPDATE stickies SET updated_at = ? WHERE id = ?').run(iso(), id);
  });
  tx();
  return findById(db, id);
}

export function addTag(db: Database.Database, id: string, key: string, value: string): Sticky | undefined {
  if (!rawById(db, id)) return undefined;
  db.prepare('INSERT OR IGNORE INTO sticky_tags (sticky_id, key, value) VALUES (?, ?, ?)').run(id, key, value);
  db.prepare('UPDATE stickies SET updated_at = ? WHERE id = ?').run(iso(), id);
  return findById(db, id);
}

export function removeTag(db: Database.Database, id: string, key: string, value: string): Sticky | undefined {
  if (!rawById(db, id)) return undefined;
  db.prepare('DELETE FROM sticky_tags WHERE sticky_id = ? AND key = ? AND value = ?').run(id, key, value);
  db.prepare('UPDATE stickies SET updated_at = ? WHERE id = ?').run(iso(), id);
  return findById(db, id);
}

// ── internal ─────────────────────────────────────────────────────────────────

function setFlag(db: Database.Database, id: string, col: 'pinned', on: boolean): Sticky | undefined {
  if (!rawById(db, id)) return undefined;
  db.prepare(`UPDATE stickies SET ${col} = ?, updated_at = ? WHERE id = ?`).run(on ? 1 : 0, iso(), id);
  return findById(db, id);
}

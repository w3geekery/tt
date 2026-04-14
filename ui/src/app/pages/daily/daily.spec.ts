import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * DailyComponent pure-helper tests.
 *
 * Follows the repo-wide convention: re-declare pure logic as standalone
 * functions mirroring the component implementation, rather than using
 * Angular TestBed. Keep these in sync with daily.ts.
 *
 * Covers the sessionStorage round-trip for collapsed timer card state
 * (plan 260408-collapsible-timer-cards.md, Phase 2 + Phase 7).
 */
describe('DailyComponent (collapsed-state helpers)', () => {
  const KEY = 'tt.daily.collapsedTimers';

  // --- In-memory sessionStorage stub used by all tests ---
  class MemoryStorage {
    private store = new Map<string, string>();
    getItem(k: string): string | null { return this.store.get(k) ?? null; }
    setItem(k: string, v: string): void { this.store.set(k, v); }
    removeItem(k: string): void { this.store.delete(k); }
    clear(): void { this.store.clear(); }
  }

  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  // Re-declared from daily.ts — keep in sync.
  function getCollapsedTimers(s: Storage | MemoryStorage = storage): Set<string> {
    try {
      const raw = s.getItem(KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveCollapsedState(
    timerId: string,
    isCollapsed: boolean,
    s: Storage | MemoryStorage = storage,
  ): void {
    const current = getCollapsedTimers(s);
    if (isCollapsed) current.add(timerId); else current.delete(timerId);
    try {
      s.setItem(KEY, JSON.stringify([...current]));
    } catch {
      // swallow quota errors
    }
  }

  describe('getCollapsedTimers', () => {
    it('returns empty Set when storage is empty', () => {
      expect(getCollapsedTimers()).toEqual(new Set());
    });

    it('reads a previously-saved Set', () => {
      storage.setItem(KEY, JSON.stringify(['t1', 't2', 't3']));
      const result = getCollapsedTimers();
      expect(result.has('t1')).toBe(true);
      expect(result.has('t2')).toBe(true);
      expect(result.has('t3')).toBe(true);
      expect(result.size).toBe(3);
    });

    it('returns empty Set on malformed JSON', () => {
      storage.setItem(KEY, 'not valid json {{{');
      expect(getCollapsedTimers()).toEqual(new Set());
    });

    it('returns empty Set when stored value is not an array', () => {
      storage.setItem(KEY, JSON.stringify({ notAnArray: true }));
      expect(getCollapsedTimers()).toEqual(new Set());
    });

    it('filters non-string entries out of the array', () => {
      storage.setItem(KEY, JSON.stringify(['t1', 42, null, 't2', { nested: 1 }]));
      const result = getCollapsedTimers();
      expect(result).toEqual(new Set(['t1', 't2']));
    });
  });

  describe('saveCollapsedState', () => {
    it('adds a timer ID when isCollapsed = true', () => {
      saveCollapsedState('timer-1', true);
      expect(getCollapsedTimers()).toEqual(new Set(['timer-1']));
    });

    it('removes a timer ID when isCollapsed = false', () => {
      saveCollapsedState('timer-1', true);
      saveCollapsedState('timer-2', true);
      saveCollapsedState('timer-1', false);
      expect(getCollapsedTimers()).toEqual(new Set(['timer-2']));
    });

    it('is idempotent when re-collapsing an already-collapsed timer', () => {
      saveCollapsedState('timer-1', true);
      saveCollapsedState('timer-1', true);
      expect(getCollapsedTimers()).toEqual(new Set(['timer-1']));
    });

    it('is idempotent when re-expanding an already-expanded timer', () => {
      saveCollapsedState('timer-1', false);
      expect(getCollapsedTimers()).toEqual(new Set());
    });

    it('silently tolerates a quota-exceeded storage', () => {
      const fullStorage = new MemoryStorage();
      fullStorage.setItem = () => { throw new Error('QuotaExceededError'); };
      expect(() => saveCollapsedState('timer-1', true, fullStorage)).not.toThrow();
    });
  });

  describe('hydration after loadTimers', () => {
    // Mirrors the hydrateCollapsedStates() shape — build a Map<timerId, bool>
    // by intersecting the timer list with persisted IDs.
    function hydrate(timers: { id: string }[]): Map<string, boolean> {
      const persisted = getCollapsedTimers();
      const map = new Map<string, boolean>();
      for (const t of timers) map.set(t.id, persisted.has(t.id));
      return map;
    }

    it('marks only previously-collapsed timers as collapsed', () => {
      saveCollapsedState('a', true);
      saveCollapsedState('c', true);
      const map = hydrate([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
      expect(map.get('a')).toBe(true);
      expect(map.get('b')).toBe(false);
      expect(map.get('c')).toBe(true);
      expect(map.get('d')).toBe(false);
    });

    it('ignores persisted IDs that are no longer in the timer list', () => {
      saveCollapsedState('ghost', true);
      saveCollapsedState('a', true);
      const map = hydrate([{ id: 'a' }, { id: 'b' }]);
      expect(map.has('ghost')).toBe(false);
      expect(map.get('a')).toBe(true);
    });
  });
});

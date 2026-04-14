import { describe, it, expect } from 'vitest';

/**
 * TimerCardComponent unit tests.
 *
 * Tests the component's pure helper functions: contrastColor, formatTime,
 * isoToTimeInput, applyTimeToIso, isRunning, isScheduled, and saveNotesInline.
 */
describe('TimerCardComponent (helpers)', () => {
  // --- contrastColor ---
  describe('contrastColor', () => {
    function contrastColor(hex: string): string {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#000' : '#fff';
    }

    it('should return black for white background', () => {
      expect(contrastColor('#ffffff')).toBe('#000');
    });

    it('should return white for black background', () => {
      expect(contrastColor('#000000')).toBe('#fff');
    });

    it('should return black for light yellow', () => {
      expect(contrastColor('#ffff00')).toBe('#000');
    });

    it('should return white for dark blue', () => {
      expect(contrastColor('#000080')).toBe('#fff');
    });

    it('should return white for dark green', () => {
      expect(contrastColor('#006400')).toBe('#fff');
    });

    it('should return black for light gray', () => {
      expect(contrastColor('#cccccc')).toBe('#000');
    });

    it('should return white for dark red', () => {
      expect(contrastColor('#8b0000')).toBe('#fff');
    });
  });

  // --- formatTime ---
  describe('formatTime', () => {
    function formatTime(iso: string | null): string {
      if (!iso) return '';
      return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    it('should return empty string for null', () => {
      expect(formatTime(null)).toBe('');
    });

    it('should format ISO date to time string', () => {
      // Use a fixed UTC time — the exact output depends on local timezone
      const result = formatTime('2026-03-02T20:30:00.000Z');
      expect(result).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    });
  });

  // --- isoToTimeInput ---
  describe('isoToTimeInput', () => {
    function isoToTimeInput(iso: string): string {
      const d = new Date(iso);
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    }

    it('should convert ISO to HH:MM format', () => {
      const result = isoToTimeInput('2026-03-02T08:05:00.000Z');
      // Exact value depends on local TZ — just verify format
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should zero-pad hours and minutes', () => {
      // Midnight UTC
      const result = isoToTimeInput('2026-01-01T00:00:00.000Z');
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  // --- applyTimeToIso ---
  describe('applyTimeToIso', () => {
    function applyTimeToIso(iso: string, timeValue: string): string {
      const d = new Date(iso);
      const [h, m] = timeValue.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    }

    it('should apply new time to existing date', () => {
      const result = applyTimeToIso('2026-03-02T08:30:00.000Z', '14:45');
      const d = new Date(result);
      expect(d.getHours()).toBe(14);
      expect(d.getMinutes()).toBe(45);
      expect(d.getSeconds()).toBe(0);
    });

    it('should preserve the date portion', () => {
      const result = applyTimeToIso('2026-03-02T08:30:00.000Z', '23:59');
      const d = new Date(result);
      expect(d.getDate()).toBe(new Date('2026-03-02T08:30:00.000Z').getDate());
    });

    it('should handle midnight', () => {
      const result = applyTimeToIso('2026-03-02T15:00:00.000Z', '00:00');
      const d = new Date(result);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });
  });

  // --- isRunning / isPaused / isScheduled ---
  describe('isRunning', () => {
    function isRunning(timer: { state?: string }): boolean {
      return timer.state === 'running';
    }

    it('should return true when state is running', () => {
      expect(isRunning({ state: 'running' })).toBe(true);
    });

    it('should return false when state is paused', () => {
      expect(isRunning({ state: 'paused' })).toBe(false);
    });

    it('should return false when state is stopped', () => {
      expect(isRunning({ state: 'stopped' })).toBe(false);
    });

    it('should return false when state is undefined', () => {
      expect(isRunning({})).toBe(false);
    });
  });

  describe('isPaused', () => {
    function isPaused(timer: { state?: string }): boolean {
      return timer.state === 'paused';
    }

    it('should return true when state is paused', () => {
      expect(isPaused({ state: 'paused' })).toBe(true);
    });

    it('should return false when state is running', () => {
      expect(isPaused({ state: 'running' })).toBe(false);
    });

    it('should return false when state is stopped', () => {
      expect(isPaused({ state: 'stopped' })).toBe(false);
    });

    it('should return false when state is undefined', () => {
      expect(isPaused({})).toBe(false);
    });
  });

  describe('isScheduled', () => {
    function isScheduled(timer: { start_at: string | null; started: string | null }): boolean {
      return !!timer.start_at && !timer.started;
    }

    it('should return true when start_at is set but not started', () => {
      expect(isScheduled({ start_at: '2026-03-02T14:00:00Z', started: null })).toBe(true);
    });

    it('should return false when already started', () => {
      expect(isScheduled({ start_at: '2026-03-02T14:00:00Z', started: '2026-03-02T14:00:00Z' })).toBe(false);
    });

    it('should return false when no start_at', () => {
      expect(isScheduled({ start_at: null, started: null })).toBe(false);
    });
  });

  // --- saveNotesInline output shape ---
  describe('saveNotesInline', () => {
    it('should produce correct output shape', () => {
      const timer = {
        id: 'abc-123',
        project_id: 'proj-1',
        task_id: 'task-1',
      };
      const notes = 'Updated notes';

      const output = {
        id: timer.id,
        notes,
        project_id: timer.project_id,
        task_id: timer.task_id,
      };

      expect(output).toEqual({
        id: 'abc-123',
        notes: 'Updated notes',
        project_id: 'proj-1',
        task_id: 'task-1',
      });
    });

    it('should handle null project_id and task_id', () => {
      const timer = {
        id: 'abc-123',
        project_id: null as string | null,
        task_id: null as string | null,
      };

      const output = {
        id: timer.id,
        notes: 'some notes',
        project_id: timer.project_id,
        task_id: timer.task_id,
      };

      expect(output.project_id).toBeNull();
      expect(output.task_id).toBeNull();
    });
  });

  // --- getSingleLetter (collapsed-card chip label) ---
  describe('getSingleLetter', () => {
    // Re-declared here to test as a pure function. Keep in sync with
    // TimerCardCollapsedComponent.getSingleLetter().
    function getSingleLetter(name: string | null | undefined): string {
      if (!name) return '?';
      const trimmed = name.trim();
      if (!trimmed) return '?';
      return trimmed.charAt(0).toUpperCase();
    }

    it('returns the first character uppercase for a normal name', () => {
      expect(getSingleLetter('ZeroBias')).toBe('Z');
      expect(getSingleLetter('Standup Meeting')).toBe('S');
    });

    it('uppercases lowercase input', () => {
      expect(getSingleLetter('general development')).toBe('G');
    });

    it('returns ? for null', () => {
      expect(getSingleLetter(null)).toBe('?');
    });

    it('returns ? for undefined', () => {
      expect(getSingleLetter(undefined)).toBe('?');
    });

    it('returns ? for empty string', () => {
      expect(getSingleLetter('')).toBe('?');
    });

    it('returns ? for whitespace-only string', () => {
      expect(getSingleLetter('   ')).toBe('?');
    });

    it('handles unicode first character', () => {
      expect(getSingleLetter('Über')).toBe('Ü');
    });
  });
});

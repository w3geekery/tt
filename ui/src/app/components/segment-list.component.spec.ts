import { describe, it, expect } from 'vitest';
import { TimerSegment } from '../models';

// Test the pure helper functions extracted from SegmentListComponent

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function breakDuration(prev: TimerSegment, next: TimerSegment): number {
  if (!prev.ended || !next.started) return 0;
  return new Date(next.started).getTime() - new Date(prev.ended).getTime();
}

const baseSegment: TimerSegment = {
  id: 'seg-1',
  timer_id: 'timer-1',
  started: '2026-03-10T10:00:00Z',
  ended: '2026-03-10T10:30:00Z',
  duration_ms: 1800000,
  notes: null,
  paused_at: null,
  resume_at: null,
  created_at: '2026-03-10T10:00:00Z',
  updated_at: '2026-03-10T10:30:00Z',
};

describe('SegmentListComponent (helpers)', () => {
  describe('formatTime', () => {
    it('formats ISO timestamp to locale time', () => {
      const result = formatTime('2026-03-10T15:30:00Z');
      expect(result).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    });
  });

  describe('breakDuration', () => {
    it('calculates break between two segments', () => {
      const seg1: TimerSegment = {
        ...baseSegment,
        id: 'seg-1',
        ended: '2026-03-10T10:30:00Z',
      };
      const seg2: TimerSegment = {
        ...baseSegment,
        id: 'seg-2',
        started: '2026-03-10T11:00:00Z',
      };
      expect(breakDuration(seg1, seg2)).toBe(1800000); // 30 min break
    });

    it('returns 0 when previous segment has no ended time', () => {
      const seg1: TimerSegment = { ...baseSegment, ended: null };
      const seg2: TimerSegment = { ...baseSegment, id: 'seg-2', started: '2026-03-10T11:00:00Z' };
      expect(breakDuration(seg1, seg2)).toBe(0);
    });

    it('returns 0 for consecutive segments with no gap', () => {
      const seg1: TimerSegment = { ...baseSegment, ended: '2026-03-10T10:30:00Z' };
      const seg2: TimerSegment = { ...baseSegment, id: 'seg-2', started: '2026-03-10T10:30:00Z' };
      expect(breakDuration(seg1, seg2)).toBe(0);
    });
  });
});

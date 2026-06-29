import { describe, it, expect } from 'vitest';
import {
  deliveryPayload,
  deliveryPayloadNullable,
  scheduleLabel,
  deliveryIcon,
  deliveryLabel,
  canSaveReminder,
} from './notification-delivery.util';

/**
 * Tests the shared notification-delivery logic used by both the
 * add-notification popover (one-off) and the recurring-reminders manager.
 * These are the real functions the components import — not re-declarations.
 */

describe('deliveryPayload (one-off, optional fields)', () => {
  it('silent omits both delivery and voice', () => {
    expect(deliveryPayload('silent', 'Zoe (Premium)')).toEqual({ delivery: undefined, voice: undefined });
  });

  it('bell sets delivery but never carries a voice', () => {
    expect(deliveryPayload('bell', 'Ava (Premium)')).toEqual({ delivery: 'bell', voice: undefined });
  });

  it('voice carries the selected voice', () => {
    expect(deliveryPayload('voice', 'Ava (Premium)')).toEqual({ delivery: 'voice', voice: 'Ava (Premium)' });
  });
});

describe('deliveryPayloadNullable (recurring, null not undefined)', () => {
  it('silent -> nulls', () => {
    expect(deliveryPayloadNullable('silent', 'Zoe (Premium)')).toEqual({ delivery: null, voice: null });
  });

  it('bell -> delivery set, voice null', () => {
    expect(deliveryPayloadNullable('bell', 'Zoe (Premium)')).toEqual({ delivery: 'bell', voice: null });
  });

  it('voice -> both set', () => {
    expect(deliveryPayloadNullable('voice', 'Fiona (Enhanced)')).toEqual({ delivery: 'voice', voice: 'Fiona (Enhanced)' });
  });
});

describe('scheduleLabel', () => {
  it('daily', () => {
    expect(scheduleLabel('daily', [], '09:00')).toBe('Every day at 09:00');
  });

  it('weekdays', () => {
    expect(scheduleLabel('weekdays', [], '08:30')).toBe('Mon-Fri at 08:30');
  });

  it('weekly sorts and labels the days', () => {
    expect(scheduleLabel('weekly', [5, 1, 3], '09:00')).toBe('Mon, Wed, Fri at 09:00');
  });

  it('weekly with Sunday included', () => {
    expect(scheduleLabel('weekly', [0, 6], '17:00')).toBe('Sun, Sat at 17:00');
  });

  it('weekly with no days is explicit, not blank', () => {
    expect(scheduleLabel('weekly', [], '09:00')).toBe('(no days) at 09:00');
  });
});

describe('deliveryIcon', () => {
  it('voice / bell / silent', () => {
    expect(deliveryIcon('voice')).toBe('record_voice_over');
    expect(deliveryIcon('bell')).toBe('notifications_active');
    expect(deliveryIcon(null)).toBe('notifications_none');
  });
});

describe('deliveryLabel', () => {
  it('voice shows the chosen voice', () => {
    expect(deliveryLabel('voice', 'Ava (Premium)', 'Zoe (Premium)')).toBe('Voice — Ava (Premium)');
  });

  it('voice with null voice falls back to the default', () => {
    expect(deliveryLabel('voice', null, 'Zoe (Premium)')).toBe('Voice — Zoe (Premium)');
  });

  it('bell and silent', () => {
    expect(deliveryLabel('bell', null, 'Zoe (Premium)')).toBe('Bell');
    expect(deliveryLabel(null, null, 'Zoe (Premium)')).toBe('Silent');
  });
});

describe('canSaveReminder', () => {
  it('requires a non-empty, non-whitespace title', () => {
    expect(canSaveReminder('', '09:00', 'daily', [])).toBe(false);
    expect(canSaveReminder('   ', '09:00', 'daily', [])).toBe(false);
    expect(canSaveReminder('Docs', '09:00', 'daily', [])).toBe(true);
  });

  it('requires a time', () => {
    expect(canSaveReminder('Docs', '', 'daily', [])).toBe(false);
  });

  it('weekly requires at least one weekday', () => {
    expect(canSaveReminder('Docs', '09:00', 'weekly', [])).toBe(false);
    expect(canSaveReminder('Docs', '09:00', 'weekly', [1, 3, 5])).toBe(true);
  });

  it('daily/weekdays do not require weekdays', () => {
    expect(canSaveReminder('Docs', '09:00', 'weekdays', [])).toBe(true);
  });
});

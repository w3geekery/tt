import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture execFile calls. The callback is invoked with no error so the code path completes.
const execFileMock = vi.fn((_cmd: string, _args: string[], cb?: (e: unknown) => void) => {
  cb?.(null);
});
vi.mock('node:child_process', () => ({ execFile: (...a: unknown[]) => execFileMock(...(a as [string, string[], (e: unknown) => void])) }));

const { sendNotification, speak } = await import('./notify.js');

function callsTo(cmd: string) {
  return execFileMock.mock.calls.filter(c => c[0] === cmd);
}

describe('sendNotification', () => {
  beforeEach(() => execFileMock.mockClear());

  it('default (no opts) fires a silent banner — osascript without a sound, no say', () => {
    sendNotification('Title', 'Body');
    const osa = callsTo('osascript');
    expect(osa).toHaveLength(1);
    expect(osa[0][1].join(' ')).not.toContain('sound name');
    expect(callsTo('say')).toHaveLength(0);
  });

  it('delivery="bell" adds a system sound to the banner', () => {
    sendNotification('Title', 'Body', { delivery: 'bell' });
    const osa = callsTo('osascript');
    expect(osa[0][1].join(' ')).toContain('sound name "Glass"');
    expect(callsTo('say')).toHaveLength(0);
  });

  it('delivery="voice" speaks via say with the requested voice', () => {
    sendNotification('Title', 'Body', { delivery: 'voice', voice: 'Ava (Premium)' });
    const say = callsTo('say');
    expect(say).toHaveLength(1);
    expect(say[0][1]).toEqual(['-v', 'Ava (Premium)', 'Body']);
  });

  it('delivery="voice" with an invalid voice falls back to the default', () => {
    sendNotification('Title', 'Body', { delivery: 'voice', voice: 'Rogue Voice; rm -rf' });
    const say = callsTo('say');
    expect(say[0][1]).toEqual(['-v', 'Zoe (Premium)', 'Body']);
  });
});

describe('speak', () => {
  beforeEach(() => execFileMock.mockClear());

  it('passes the message as a discrete argv entry (no shell interpolation)', () => {
    speak('hello "world"', 'Zoe (Premium)');
    const say = callsTo('say');
    expect(say[0][1]).toEqual(['-v', 'Zoe (Premium)', 'hello "world"']);
  });
});

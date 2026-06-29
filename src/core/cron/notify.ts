/**
 * macOS notification delivery.
 *
 * Three audio channels, chosen per-notification via `opts.delivery`:
 *   - undefined  -> silent visual banner (legacy default; cap/autocap alerts use this)
 *   - 'bell'     -> visual banner + a system sound
 *   - 'voice'    -> visual banner + the message spoken aloud via the `say` CLI
 *
 * Falls back to console.log if osascript is unavailable. `say` is best-effort.
 */

import { execFile } from 'node:child_process';
import { SPOKEN_VOICES, DEFAULT_SPOKEN_VOICE } from '../types.js';

export interface NotifyOptions {
  delivery?: 'bell' | 'voice' | null;
  /** Voice for delivery='voice'. Validated against SPOKEN_VOICES; bad/missing -> default. */
  voice?: string | null;
  /** macOS system sound name for delivery='bell'. Defaults to DEFAULT_BELL_SOUND. */
  sound?: string | null;
}

const DEFAULT_BELL_SOUND = 'Glass';

export function sendNotification(title: string, message: string, opts: NotifyOptions = {}): void {
  const soundClause =
    opts.delivery === 'bell'
      ? ` sound name "${escapeAppleScript(opts.sound || DEFAULT_BELL_SOUND)}"`
      : '';
  const script = `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"${soundClause}`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) {
      console.log(`[notification] ${title}: ${message}`);
    }
  });

  if (opts.delivery === 'voice') {
    speak(message, opts.voice);
  }
}

/** Speak text via the macOS `say` CLI. Voice is allowlist-validated — the message
 * is passed as a discrete argv entry (execFile, not a shell), so no injection risk. */
export function speak(message: string, voice?: string | null): void {
  const v = voice && (SPOKEN_VOICES as readonly string[]).includes(voice) ? voice : DEFAULT_SPOKEN_VOICE;
  execFile('say', ['-v', v, message], (err) => {
    if (err) {
      // Best-effort: a missing voice or no audio device shouldn't crash the cron tick.
      console.log(`[say:${v}] ${message}`);
    }
  });
}

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

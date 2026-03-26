/**
 * macOS notification via osascript.
 * Falls back to console.log if osascript is not available.
 */

import { execFile } from 'node:child_process';

export function sendNotification(title: string, message: string): void {
  const script = `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) {
      console.log(`[notification] ${title}: ${message}`);
    }
  });
}

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

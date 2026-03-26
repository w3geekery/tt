/**
 * Extension loader and hook runner.
 *
 * Loads tt.config.ts and provides safe hook invocation.
 * Extensions are optional — hooks that aren't registered are no-ops.
 */

import type { TtExtensions } from './types';

let extensions: TtExtensions = {};

export function loadExtensions(ext: TtExtensions): void {
  extensions = ext;
}

export async function runHook<K extends keyof TtExtensions>(
  hook: K,
  ...args: Parameters<NonNullable<TtExtensions[K]>>
): Promise<void> {
  const fn = extensions[hook];
  if (fn) {
    try {
      await (fn as Function)(...args);
    } catch (err) {
      console.error(`[extension] ${hook} failed:`, err);
    }
  }
}

export function getExtension<K extends keyof TtExtensions>(
  hook: K,
): TtExtensions[K] | undefined {
  return extensions[hook];
}

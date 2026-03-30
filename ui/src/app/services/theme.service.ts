import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'tt_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('system');
  private platformId = inject(PLATFORM_ID);
  private systemDark = signal(false);

  /** True when the effective theme is dark (explicit or system-detected) */
  readonly isDark = computed(() => {
    const m = this.mode();
    if (m === 'dark') return true;
    if (m === 'light') return false;
    return this.systemDark(); // system mode — use media query result
  });

  init() {
    if (!isPlatformBrowser(this.platformId)) return;

    // Detect system dark preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark.set(mq.matches);
    mq.addEventListener('change', (e) => this.systemDark.set(e.matches));

    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored && ['system', 'light', 'dark'].includes(stored)) {
      this.mode.set(stored);
    }
    this.apply();
  }

  setMode(mode: ThemeMode) {
    this.mode.set(mode);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    this.apply();
  }

  private apply() {
    if (!isPlatformBrowser(this.platformId)) return;

    const body = document.body;
    switch (this.mode()) {
      case 'light':
        body.style.colorScheme = 'light';
        break;
      case 'dark':
        body.style.colorScheme = 'dark';
        break;
      case 'system':
        body.style.colorScheme = 'light dark';
        break;
    }
  }
}

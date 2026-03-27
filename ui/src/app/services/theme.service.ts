import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'tt-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  mode = signal<ThemeMode>(this.loadMode());

  toggle(): void {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(this.mode());
    const next = order[(idx + 1) % order.length];
    this.setMode(next);
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    this.applyToDocument();
  }

  applyToDocument(): void {
    const m = this.mode();
    const scheme = m === 'system' ? 'light dark' : m;
    document.body.style.colorScheme = scheme;
  }

  private loadMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return stored ?? 'system';
  }
}

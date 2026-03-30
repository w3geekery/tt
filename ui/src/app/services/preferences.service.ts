import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private platformId = inject(PLATFORM_ID);

  showWeekend = signal(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.showWeekend.set(localStorage.getItem('tt-show-weekend') === 'true');
    }
  }

  toggleWeekend() {
    this.showWeekend.update((v) => {
      const next = !v;
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('tt-show-weekend', String(next));
      }
      return next;
    });
  }
}

import { Injectable, signal } from '@angular/core';

const WEEKENDS_KEY = 'tt-show-weekends';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  showWeekends = signal<boolean>(localStorage.getItem(WEEKENDS_KEY) === 'true');

  toggleWeekends(): void {
    const next = !this.showWeekends();
    this.showWeekends.set(next);
    localStorage.setItem(WEEKENDS_KEY, String(next));
  }
}

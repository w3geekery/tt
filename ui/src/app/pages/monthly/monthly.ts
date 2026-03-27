import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../services/api.service';
import { PreferencesService } from '../../services/preferences.service';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer } from '../../models/types';

interface CalendarDay {
  date: Date;
  dateStr: string;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  timers: Timer[];
  totalMs: number;
  companySummary: Array<{ name: string; color: string; ms: number }>;
}

@Component({
  selector: 'app-monthly',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatChipsModule, DurationPipe],
  template: `
    <div class="header">
      <button mat-icon-button (click)="prevMonth()"><mat-icon>chevron_left</mat-icon></button>
      <h2>{{ monthLabel }}</h2>
      <button mat-icon-button (click)="nextMonth()"><mat-icon>chevron_right</mat-icon></button>
      @if (!isCurrentMonth) {
        <button mat-stroked-button (click)="goThisMonth()">This Month</button>
      }
      <span class="total">{{ grandTotalMs | duration:'decimal' }}</span>
    </div>

    <!-- Company filter chips -->
    @if (companyChips.length > 1) {
      <div class="filter-chips">
        @for (chip of companyChips; track chip.id) {
          <mat-chip-option [selected]="chip.selected" (selectionChange)="chip.selected = !chip.selected">
            {{ chip.name }}
          </mat-chip-option>
        }
      </div>
    }

    <!-- Calendar grid -->
    <div class="calendar">
      <div class="weekday-headers">
        @for (wd of weekdayHeaders; track wd) {
          <div class="weekday-header">{{ wd }}</div>
        }
      </div>
      <div class="calendar-grid">
        @for (day of calendarDays; track day.dateStr) {
          <a class="day-cell"
             [class.other-month]="!day.isCurrentMonth"
             [class.today]="day.isToday"
             [class.has-data]="day.timers.length > 0"
             [routerLink]="['/daily']"
             [queryParams]="{date: day.dateStr}">
            <div class="day-num">{{ day.dayNum }}</div>
            @if (day.timers.length > 0) {
              <div class="day-summary">
                @for (cs of day.companySummary; track cs.name) {
                  <div class="company-dot">
                    <span class="dot" [style.background]="cs.color || 'var(--mat-sys-primary)'"></span>
                    <span class="dot-hrs">{{ cs.ms | duration:'decimal' }}</span>
                  </div>
                }
              </div>
            }
          </a>
        }
      </div>
    </div>

    <!-- Summary table -->
    @if (monthRows.length) {
      <div class="summary">
        <h3>Summary</h3>
        @for (row of monthRows; track row.key) {
          <div class="summary-row">
            <span>{{ row.companyName }} / {{ row.projectName }}</span>
            <span class="summary-hrs">{{ row.totalMs | duration:'decimal' }} ({{ row.count }} timers)</span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    h2 { margin: 0; min-width: 200px; text-align: center; }
    .total {
      margin-left: auto;
      font-size: 1.2rem;
      font-weight: 500;
      color: var(--mat-sys-primary);
    }
    .filter-chips { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .weekday-headers {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      text-align: center;
      font-weight: 600;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 4px;
    }
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }
    .day-cell {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 4px;
      padding: 4px;
      min-height: 60px;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
      transition: background 0.15s;
      &:hover { background: var(--mat-sys-surface-variant); }
    }
    .day-cell.other-month { opacity: 0.35; }
    .day-cell.today {
      border-color: var(--mat-sys-primary);
      border-width: 2px;
    }
    .day-num {
      font-size: 0.85rem;
      font-weight: 500;
    }
    .day-summary { margin-top: 2px; }
    .company-dot {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 0.7rem;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-hrs {
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface-variant);
    }
    .summary { margin-top: 24px; }
    h3 { margin: 0 0 8px; }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .summary-hrs {
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class MonthlyComponent implements OnInit {
  private api = inject(ApiService);
  prefs = inject(PreferencesService);

  year = new Date().getFullYear();
  month = new Date().getMonth();
  calendarDays: CalendarDay[] = [];
  monthRows: Array<{ key: string; companyName: string; projectName: string; totalMs: number; count: number }> = [];
  companyMap = new Map<string, string>();
  companyColorMap = new Map<string, string>();
  projectMap = new Map<string, string>();
  companyChips: Array<{ id: string; name: string; selected: boolean }> = [];
  weekdayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  get monthLabel(): string {
    return new Date(this.year, this.month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  get isCurrentMonth(): boolean {
    const now = new Date();
    return this.year === now.getFullYear() && this.month === now.getMonth();
  }

  get grandTotalMs(): number {
    return this.calendarDays
      .filter(d => d.isCurrentMonth)
      .reduce((sum, d) => sum + d.totalMs, 0);
  }

  ngOnInit(): void {
    this.api.getCompanies().subscribe(list => {
      this.companyMap = new Map(list.map(c => [c.id, c.name]));
      this.companyColorMap = new Map(list.map(c => [c.id, c.color ?? '']));
      this.api.getProjects().subscribe(projects => {
        this.projectMap = new Map(projects.map(p => [p.id, p.name]));
        this.loadMonth();
      });
    });
  }

  prevMonth(): void {
    this.month--;
    if (this.month < 0) { this.month = 11; this.year--; }
    this.loadMonth();
  }

  nextMonth(): void {
    this.month++;
    if (this.month > 11) { this.month = 0; this.year++; }
    this.loadMonth();
  }

  goThisMonth(): void {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.loadMonth();
  }

  private loadMonth(): void {
    const monthStr = `${this.year}-${String(this.month + 1).padStart(2, '0')}`;
    const todayStr = new Date().toISOString().slice(0, 10);

    this.api.getTimers().subscribe(allTimers => {
      const timersByDate = new Map<string, Timer[]>();
      for (const t of allTimers) {
        if (!t.started) continue;
        const ds = t.started.slice(0, 10);
        if (!timersByDate.has(ds)) timersByDate.set(ds, []);
        timersByDate.get(ds)!.push(t);
      }

      // Build calendar grid
      const firstDay = new Date(this.year, this.month, 1);
      const startOffset = firstDay.getDay(); // 0=Sun
      const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();

      this.calendarDays = [];

      // Previous month padding
      for (let i = startOffset - 1; i >= 0; i--) {
        const d = new Date(this.year, this.month, -i);
        this.calendarDays.push(this.makeDay(d, false, todayStr, timersByDate));
      }

      // Current month
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(this.year, this.month, i);
        this.calendarDays.push(this.makeDay(d, true, todayStr, timersByDate));
      }

      // Next month padding (fill to complete last week)
      const remaining = 7 - (this.calendarDays.length % 7);
      if (remaining < 7) {
        for (let i = 1; i <= remaining; i++) {
          const d = new Date(this.year, this.month + 1, i);
          this.calendarDays.push(this.makeDay(d, false, todayStr, timersByDate));
        }
      }

      // Summary rows
      const monthTimers = allTimers.filter(t => t.started?.startsWith(monthStr));
      this.buildSummary(monthTimers);
      this.buildChips(monthTimers);
    });
  }

  private makeDay(date: Date, isCurrentMonth: boolean, todayStr: string, timersByDate: Map<string, Timer[]>): CalendarDay {
    const dateStr = date.toISOString().slice(0, 10);
    const timers = timersByDate.get(dateStr) ?? [];
    const totalMs = timers.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);

    // Group by company for dots
    const byCompany = new Map<string, number>();
    for (const t of timers) {
      byCompany.set(t.company_id, (byCompany.get(t.company_id) ?? 0) + (t.duration_ms ?? 0));
    }
    const companySummary = [...byCompany.entries()].map(([id, ms]) => ({
      name: this.companyMap.get(id) ?? '',
      color: this.companyColorMap.get(id) ?? '',
      ms,
    }));

    return {
      date,
      dateStr,
      dayNum: date.getDate(),
      isCurrentMonth,
      isToday: dateStr === todayStr,
      timers,
      totalMs,
      companySummary,
    };
  }

  private buildSummary(timers: Timer[]): void {
    const groups = new Map<string, { companyName: string; projectName: string; totalMs: number; count: number }>();
    for (const t of timers) {
      const key = `${t.company_id}|${t.project_id ?? ''}`;
      const existing = groups.get(key);
      if (existing) {
        existing.totalMs += t.duration_ms ?? 0;
        existing.count++;
      } else {
        groups.set(key, {
          companyName: this.companyMap.get(t.company_id) ?? '—',
          projectName: t.project_id ? (this.projectMap.get(t.project_id) ?? '—') : '—',
          totalMs: t.duration_ms ?? 0,
          count: 1,
        });
      }
    }
    this.monthRows = [...groups.entries()]
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => b.totalMs - a.totalMs);
  }

  private buildChips(timers: Timer[]): void {
    const ids = new Set(timers.map(t => t.company_id));
    this.companyChips = [...ids].map(id => ({
      id,
      name: this.companyMap.get(id) ?? id,
      selected: this.companyChips.find(c => c.id === id)?.selected ?? true,
    }));
  }
}

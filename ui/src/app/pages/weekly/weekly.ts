import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../services/api.service';
import { SnackbarService } from '../../services/snackbar.service';
import { PreferencesService } from '../../services/preferences.service';
import { CapBarComponent } from '../../components/cap-bar/cap-bar';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer, CapStatus } from '../../models/types';

interface DayColumn {
  date: Date;
  dateStr: string;
  label: string;
  dayName: string;
  timers: Timer[];
  totalMs: number;
  isToday: boolean;
}

@Component({
  selector: 'app-weekly',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatButtonModule, MatIconModule, MatCardModule,
    MatChipsModule, CapBarComponent, DurationPipe,
  ],
  template: `
    <div class="header">
      <button mat-icon-button (click)="prevWeek()"><mat-icon>chevron_left</mat-icon></button>
      <h2>{{ weekLabel }}</h2>
      <button mat-icon-button (click)="nextWeek()"><mat-icon>chevron_right</mat-icon></button>
      @if (!isCurrentWeek) {
        <button mat-stroked-button (click)="goThisWeek()">This Week</button>
      }
      <span class="total">{{ grandTotalMs | duration:'decimal' }}</span>
    </div>

    <!-- Weekly caps -->
    @if (caps.length) {
      <div class="caps">
        @for (cap of caps; track cap.project_id) {
          @if (cap.weekly) {
            <app-cap-bar
              [label]="cap.company_name + ' / ' + cap.project_name"
              [capHrs]="cap.weekly.cap_hrs"
              [usedHrs]="cap.weekly.used_hrs"
              [pct]="cap.weekly.pct"
            />
          }
        }
      </div>
    }

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

    <!-- Day columns -->
    <div class="week-grid">
      @for (day of days; track day.dateStr) {
        <div class="day-column" [class.today]="day.isToday">
          <div class="day-header">
            <span class="day-name">{{ day.dayName }}</span>
            <a class="day-date" [routerLink]="['/daily']" [queryParams]="{date: day.dateStr}">
              {{ day.date | date:'MMM d' }}
            </a>
            <span class="day-total">{{ day.totalMs | duration:'decimal' }}</span>
          </div>
          <div class="day-timers">
            @for (timer of getFilteredTimers(day); track timer.id) {
              <mat-card class="mini-timer" [class]="'state-' + timer.state">
                <div class="mini-slug">{{ timer.slug }}</div>
                <div class="mini-meta">
                  {{ companyMap.get(timer.company_id) ?? '' }}
                  @if (timer.project_id) { / {{ projectMap.get(timer.project_id) ?? '' }} }
                </div>
                <div class="mini-duration">{{ timer.duration_ms | duration:'hm' }}</div>
                @if (timer.notes) {
                  <div class="mini-notes">{{ timer.notes }}</div>
                }
              </mat-card>
            }
            @if (getFilteredTimers(day).length === 0) {
              <div class="empty-day">—</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    h2 { margin: 0; min-width: 220px; text-align: center; }
    .total {
      margin-left: auto;
      font-size: 1.2rem;
      font-weight: 500;
      color: var(--mat-sys-primary);
    }
    .caps { margin: 8px 0 12px; }
    .filter-chips { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
    }
    .day-column {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 8px;
      min-height: 120px;
    }
    .day-column.today {
      border-color: var(--mat-sys-primary);
      border-width: 2px;
    }
    .day-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .day-name { font-weight: 600; font-size: 0.85rem; }
    .day-date {
      color: var(--mat-sys-primary);
      text-decoration: none;
      font-size: 0.85rem;
      &:hover { text-decoration: underline; }
    }
    .day-total {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }
    .mini-timer {
      padding: 6px 8px;
      margin-bottom: 4px;
      font-size: 0.8rem;
    }
    .mini-timer.state-running { border-left: 3px solid var(--mat-sys-primary); }
    .mini-timer.state-paused { border-left: 3px solid var(--mat-sys-tertiary); }
    .mini-slug { font-weight: 500; }
    .mini-meta { color: var(--mat-sys-on-surface-variant); font-size: 0.75rem; }
    .mini-duration { font-variant-numeric: tabular-nums; }
    .mini-notes {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.75rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .empty-day {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      padding: 16px 0;
    }
  `,
})
export class WeeklyComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(SnackbarService);
  prefs = inject(PreferencesService);

  weekOffset = 0;
  days: DayColumn[] = [];
  caps: CapStatus[] = [];
  companyMap = new Map<string, string>();
  projectMap = new Map<string, string>();
  companyChips: Array<{ id: string; name: string; selected: boolean }> = [];

  get weekLabel(): string {
    if (!this.days.length) return '';
    const start = this.days[0].date;
    const end = this.days[this.days.length - 1].date;
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  get isCurrentWeek(): boolean {
    return this.weekOffset === 0;
  }

  get grandTotalMs(): number {
    return this.days.reduce((sum, d) => sum + d.totalMs, 0);
  }

  ngOnInit(): void {
    this.api.getCompanies().subscribe(list => {
      this.companyMap = new Map(list.map(c => [c.id, c.name]));
      this.api.getProjects().subscribe(projects => {
        this.projectMap = new Map(projects.map(p => [p.id, p.name]));
        this.loadWeek();
      });
    });
    this.api.getCapStatus().subscribe(list => this.caps = list);
  }

  prevWeek(): void { this.weekOffset--; this.loadWeek(); }
  nextWeek(): void { this.weekOffset++; this.loadWeek(); }
  goThisWeek(): void { this.weekOffset = 0; this.loadWeek(); }

  getFilteredTimers(day: DayColumn): Timer[] {
    const selected = this.companyChips.filter(c => c.selected).map(c => c.id);
    if (selected.length === 0 || selected.length === this.companyChips.length) return day.timers;
    return day.timers.filter(t => selected.includes(t.company_id));
  }

  private loadWeek(): void {
    const dates = this.getWeekDates();
    const todayStr = new Date().toISOString().slice(0, 10);

    this.api.getTimers().subscribe(allTimers => {
      this.days = dates.map(d => {
        const dateStr = d.toISOString().slice(0, 10);
        const timers = allTimers.filter(t => t.started?.startsWith(dateStr));
        return {
          date: d,
          dateStr,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
          timers,
          totalMs: timers.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0),
          isToday: dateStr === todayStr,
        };
      });

      const allWeekTimers = this.days.flatMap(d => d.timers);
      const ids = new Set(allWeekTimers.map(t => t.company_id));
      this.companyChips = [...ids].map(id => ({
        id,
        name: this.companyMap.get(id) ?? id,
        selected: this.companyChips.find(c => c.id === id)?.selected ?? true,
      }));
    });
  }

  private getWeekDates(): Date[] {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + (this.weekOffset * 7));
    start.setHours(12, 0, 0, 0); // Avoid DST issues

    const showWeekends = this.prefs.showWeekends();
    const dayCount = showWeekends ? 7 : 5;
    const startDay = showWeekends ? 0 : 1; // Sun or Mon

    const dates: Date[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + startDay + i);
      dates.push(d);
    }
    return dates;
  }
}

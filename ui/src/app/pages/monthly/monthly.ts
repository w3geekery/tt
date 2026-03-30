import { Component, OnInit, OnDestroy, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BreadcrumbNavComponent, BreadcrumbItem } from '../../components/breadcrumb-nav';
import { DurationPipe } from '../../pipes/duration.pipe';
import { SkeletonComponent } from '../../components/skeleton';
import { Subscription } from 'rxjs';
import { TimerService } from '../../services/timer.service';
import { AuthService } from '../../services/auth.service';
import { SseService } from '../../services/sse.service';
import { Timer } from '../../models';

interface CompanyTotal {
  companyName: string;
  companyColor: string | null;
  totalMs: number;
}

interface DayCell {
  date: string;           // YYYY-MM-DD
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  companyTotals: CompanyTotal[];
  totalMs: number;
}

interface WeekRow {
  weekNumber: number;
  weekStartDate: string;  // YYYY-MM-DD of Sunday
  days: DayCell[];
}

@Component({
  selector: 'app-monthly',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatSnackBarModule,
    BreadcrumbNavComponent,
    DurationPipe,
    SkeletonComponent,
  ],
  templateUrl: './monthly.html',
  styleUrl: './monthly.scss',
})
export class MonthlyComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private snackBar = inject(MatSnackBar);
  private sse = inject(SseService);
  private sseSub?: Subscription;

  loading = signal(true);
  timers = signal<Timer[]>([]);
  selectedCompanies = signal<Set<string>>(new Set());
  selectedYear = signal(new Date().getFullYear());
  selectedMonth = signal(new Date().getMonth()); // 0-based

  breadcrumbs = computed<BreadcrumbItem[]>(() => [
    { label: 'Home', url: '/' },
    { label: this.monthLabel(), url: null },
  ]);

  monthLabel = computed(() => {
    const date = new Date(this.selectedYear(), this.selectedMonth(), 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  isThisMonth = computed(() => {
    const now = new Date();
    return this.selectedYear() === now.getFullYear() && this.selectedMonth() === now.getMonth();
  });

  uniqueCompanyNames = computed(() => {
    const names = new Set(this.timers().map((t) => t.company_name ?? 'Unknown'));
    return [...names].sort();
  });

  filteredTimers = computed(() => {
    const selected = this.selectedCompanies();
    if (selected.size === 0) return this.timers();
    return this.timers().filter((t) => selected.has(t.company_name ?? 'Unknown'));
  });

  calendarWeeks = computed<WeekRow[]>(() => {
    const year = this.selectedYear();
    const month = this.selectedMonth();
    const timers = this.filteredTimers();
    const todayStr = this.formatDate(new Date());

    // Build a map of date -> timers
    const timersByDate = new Map<string, Timer[]>();
    for (const t of timers) {
      const effective = t.started || t.start_at;
      if (!effective) continue;
      const dateStr = new Date(effective).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      if (!timersByDate.has(dateStr)) timersByDate.set(dateStr, []);
      timersByDate.get(dateStr)!.push(t);
    }

    // First day of month and last day
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    // Start from Sunday of the week containing the 1st
    const startDay = new Date(firstOfMonth);
    startDay.setDate(startDay.getDate() - startDay.getDay()); // back to Sunday

    const weeks: WeekRow[] = [];
    const cursor = new Date(startDay);

    while (cursor <= lastOfMonth || cursor.getDay() !== 0) {
      const days: DayCell[] = [];
      const weekStartDate = this.formatDate(new Date(cursor));

      for (let d = 0; d < 7; d++) {
        const dateStr = this.formatDate(new Date(cursor));
        const dayTimers = timersByDate.get(dateStr) || [];

        // Aggregate by company
        const companyMap = new Map<string, CompanyTotal>();
        for (const t of dayTimers) {
          const name = t.company_name ?? 'Unknown';
          const existing = companyMap.get(name);
          if (!t.started) continue; // skip scheduled (unstarted) timers
          const ms = (t.ended || t.state === 'paused')
            ? Number(t.duration_ms ?? 0)
            : (t.state === 'running' ? Date.now() - new Date(t.started).getTime() : 0);
          if (existing) {
            existing.totalMs += ms;
          } else {
            companyMap.set(name, { companyName: name, companyColor: t.company_color ?? null, totalMs: ms });
          }
        }

        const companyTotals = Array.from(companyMap.values()).sort((a, b) => b.totalMs - a.totalMs);
        const totalMs = companyTotals.reduce((sum, c) => sum + c.totalMs, 0);

        days.push({
          date: dateStr,
          dayOfMonth: cursor.getDate(),
          isCurrentMonth: cursor.getMonth() === month,
          isToday: dateStr === todayStr,
          companyTotals,
          totalMs,
        });

        cursor.setDate(cursor.getDate() + 1);
      }

      weeks.push({
        weekNumber: this.getISOWeekNumber(new Date(weekStartDate + 'T12:00:00')),
        weekStartDate,
        days,
      });

      // Stop if we've passed the last day and completed the week
      if (cursor.getMonth() !== month && cursor.getDay() === 0) break;
    }

    return weeks;
  });

  monthlyTotal = computed(() => {
    return this.calendarWeeks().reduce((sum, week) =>
      sum + week.days.reduce((wsum, day) =>
        wsum + (day.isCurrentMonth ? day.totalMs : 0), 0), 0);
  });

  monthlyCompanyTotals = computed(() => {
    const map = new Map<string, number>();
    for (const week of this.calendarWeeks()) {
      for (const day of week.days) {
        if (!day.isCurrentMonth) continue;
        for (const ct of day.companyTotals) {
          map.set(ct.companyName, (map.get(ct.companyName) ?? 0) + ct.totalMs);
        }
      }
    }
    return [...map.entries()]
      .map(([name, ms]) => ({ name, ms }))
      .sort((a, b) => b.ms - a.ms);
  });

  constructor(
    private timerService: TimerService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.sse.connect();
    this.sseSub = this.sse.timerEvents$.subscribe(() => this.loadTimers());

    this.route.paramMap.subscribe((params) => {
      const yearParam = params.get('year');
      const monthParam = params.get('month');
      if (yearParam && monthParam) {
        this.selectedYear.set(parseInt(yearParam, 10));
        this.selectedMonth.set(parseInt(monthParam, 10) - 1); // URL is 1-based
      }
      this.waitForAuthThenLoad();
    });
  }

  ngOnDestroy() {
    this.sseSub?.unsubscribe();
  }

  private waitForAuthThenLoad() {
    const check = setInterval(() => {
      if (!this.auth.loading()) {
        clearInterval(check);
        if (this.auth.user()) {
          this.loadTimers();
        } else {
          this.loading.set(false);
        }
      }
    }, 50);
  }

  loadTimers() {
    this.loading.set(true);
    const year = this.selectedYear();
    const month = this.selectedMonth();

    // Calculate full range including padding days from prev/next months
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const startDay = new Date(firstOfMonth);
    startDay.setDate(startDay.getDate() - startDay.getDay()); // Sunday before
    const endDay = new Date(lastOfMonth);
    if (endDay.getDay() !== 6) {
      endDay.setDate(endDay.getDate() + (6 - endDay.getDay())); // Saturday after
    }

    const from = this.formatDate(startDay);
    const to = this.formatDate(endDay);

    // Materialize recurring timers, then load
    this.timerService.materialize(from, to).subscribe({
      next: () => {
        this.timerService.getByRange(from, to).subscribe((t) => {
          this.timers.set(t);
          this.loading.set(false);
        });
      },
      error: () => {
        this.timerService.getByRange(from, to).subscribe((t) => {
          this.timers.set(t);
          this.loading.set(false);
        });
      },
    });
  }

  toggleCompanyFilter(name: string) {
    const current = new Set(this.selectedCompanies());
    if (current.has(name)) {
      current.delete(name);
    } else {
      current.add(name);
    }
    this.selectedCompanies.set(current);
  }

  prevMonth() {
    let y = this.selectedYear();
    let m = this.selectedMonth() - 1;
    if (m < 0) { m = 11; y--; }
    this.navigateToMonth(y, m);
  }

  nextMonth() {
    let y = this.selectedYear();
    let m = this.selectedMonth() + 1;
    if (m > 11) { m = 0; y++; }
    this.navigateToMonth(y, m);
  }

  thisMonth() {
    const now = new Date();
    this.navigateToMonth(now.getFullYear(), now.getMonth());
  }

  private navigateToMonth(year: number, month: number) {
    this.selectedYear.set(year);
    this.selectedMonth.set(month);
    this.router.navigate(['/monthly', year, month + 1]); // URL is 1-based
    this.loadTimers();
  }

  navigateToDay(date: string) {
    this.router.navigate(['/today', date], {
      queryParams: { from: 'monthly' },
    });
  }

  navigateToWeek(weekStartDate: string) {
    // Get the Monday of this week (weekStartDate is Sunday)
    const sun = new Date(weekStartDate + 'T12:00:00');
    const mon = new Date(sun);
    mon.setDate(mon.getDate() + 1);
    this.router.navigate(['/weekly', this.formatDate(mon)], {
      queryParams: { from: 'monthly' },
    });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  private getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
}

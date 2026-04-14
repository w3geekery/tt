import { Component, OnInit, OnDestroy, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { TimerCardComponent } from '../../components/timer-card';
import { NewTimerDialogComponent, NewTimerDialogData } from './new-timer-dialog';
import { BreadcrumbNavComponent, BreadcrumbItem } from '../../components/breadcrumb-nav';
import { DurationPipe } from '../../pipes/duration.pipe';
import { SkeletonComponent } from '../../components/skeleton';
import { TimerService } from '../../services/timer.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { NotificationsService } from '../../services/notifications.service';
import { NotificationTimelineComponent } from '../../components/notification-timeline';
import { SseService } from '../../services/sse.service';
import { CapStatusService } from '../../services/cap-status.service';
import { CapProgressBarComponent } from '../../components/cap-progress-bar';
import { Timer, Company, Project, Task, Notification, UserSettings, ProjectCapStatus, CapStatus, FavoriteTemplate } from '../../models';
import { ScheduleTimerDialogComponent } from './schedule-timer-dialog';

@Component({
  selector: 'app-daily',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatSnackBarModule,
    MatChipsModule,
    MatMenuModule,
    MatDatepickerModule,
    MatNativeDateModule,
    TimerCardComponent,
    BreadcrumbNavComponent,
    DurationPipe,
    SkeletonComponent,
    NotificationTimelineComponent,
    CapProgressBarComponent,
  ],
  templateUrl: './daily.html',
  styleUrl: './daily.scss',
})
export class DailyComponent implements OnInit, OnDestroy {
  timers = signal<Timer[]>([]);
  companies = signal<Company[]>([]);
  projects = signal<Project[]>([]);
  tasks = signal<Task[]>([]);
  notifications = signal<Notification[]>([]);
  timelineSettings = signal<UserSettings>({ timeline_start_hour: 5, timeline_end_hour: 19, notify_on_cap: true });
  dailyCaps = signal<ProjectCapStatus[]>([]);
  favorites = signal<FavoriteTemplate[]>([]);
  selectedDate = signal<Date>(new Date());
  selectedCompanies = signal<Set<string>>(new Set());
  selectedFavorite = signal<FavoriteTemplate | null>(null);
  collapsedStates = signal<Map<string, boolean>>(new Map());

  // Navigation context
  fromMonthly = signal(false);

  auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private sse = inject(SseService);
  private sseSub: { unsubscribe(): void } | null = null;

  dateString = computed(() => this.formatDate(this.selectedDate()));

  breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [{ label: 'Home', url: '/' }];
    if (this.fromMonthly()) {
      const d = this.selectedDate();
      items.push({ label: 'Monthly', url: `/monthly/${d.getFullYear()}/${d.getMonth() + 1}` });
    }
    items.push({ label: this.formatDisplayDate(this.selectedDate()), url: null });
    return items;
  });

  uniqueCompanyNames = computed(() => {
    const names = new Set(this.timers().map((t) => t.company_name ?? 'Unknown'));
    return [...names].sort();
  });

  filteredTimers = computed(() => {
    const selected = this.selectedCompanies();
    const timers = selected.size === 0
      ? this.timers()
      : this.timers().filter((t) => selected.has(t.company_name ?? 'Unknown'));
    const group = (t: Timer) => {
      if (t.state === 'running') return 0;
      if (t.state === 'paused') return 0; // paused stays with running
      if (!t.started) return 1; // scheduled/recurring (not yet started)
      return 2; // ended/completed
    };
    return [...timers].sort((a, b) => {
      const ga = group(a), gb = group(b);
      if (ga !== gb) return ga - gb;
      if (ga === 1) { // scheduled: ascending by start_at
        return (a.start_at || '').localeCompare(b.start_at || '');
      }
      // ended: descending by started
      return (b.started || '').localeCompare(a.started || '');
    });
  });

  activeTimers = computed(() => this.filteredTimers().filter((t) => t.state === 'running' || t.state === 'paused' || !t.started));
  historyTimers = computed(() =>
    this.filteredTimers()
      .filter((t) => t.state !== 'running' && t.state !== 'paused' && !!t.started)
      .sort((a, b) => new Date(a.started!).getTime() - new Date(b.started!).getTime())
  );

  dailyTotal = computed(() => {
    return this.filteredTimers().reduce((sum, t) => {
      if (!t.started) return sum; // skip scheduled (unstarted) timers
      return sum + this.getTimerDurationMs(t);
    }, 0);
  });

  companyTotals = computed(() => {
    const map = new Map<string, number>();
    for (const t of this.filteredTimers()) {
      if (!t.started) continue; // skip scheduled (unstarted) timers
      const name = t.company_name ?? 'Unknown';
      map.set(name, (map.get(name) ?? 0) + this.getTimerDurationMs(t));
    }
    return Array.from(map.entries()).map(([name, ms]) => ({ name, ms }));
  });

  private getTimerDurationMs(t: Timer): number {
    if (t.ended || t.state === 'paused') return Number(t.duration_ms ?? 0);
    if (t.state === 'running' && t.started) return Date.now() - new Date(t.started).getTime();
    return Number(t.duration_ms ?? 0);
  }

  private notificationsService = inject(NotificationsService);
  private capStatusService = inject(CapStatusService);

  constructor(
    private timerService: TimerService,
    private api: ApiService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.sse.connect();
    this.sseSub = this.sse.timerEvents$.subscribe(() => {
      this.loadTimers();
      this.loadCapStatus();
    });

    this.route.queryParamMap.subscribe((qp) => {
      this.fromMonthly.set(qp.get('from') === 'monthly');
    });
    // Check for date param
    this.route.paramMap.subscribe((params) => {
      const dateParam = params.get('date');
      if (dateParam) {
        this.selectedDate.set(new Date(dateParam + 'T00:00:00'));
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
          this.loadEntities();
          this.loadNotifications();
          this.loadTimelineSettings();
          this.loadCapStatus();
          this.loadFavorites();
        }
      }
    }, 50);
  }

  loadTimers() {
    this.timerService.getByDate(this.dateString()).subscribe((t) => {
      this.timers.set(t);
      this.hydrateCollapsedStates();
    });
  }

  /**
   * sessionStorage key for persisting per-timer collapse state on the daily page.
   * Scope is the tab/session — reloads preserve, closing the tab clears.
   */
  static readonly COLLAPSED_STORAGE_KEY = 'tt.daily.collapsedTimers';

  /** Read the set of collapsed timer IDs from sessionStorage. Tolerates missing/malformed data. */
  getCollapsedTimers(): Set<string> {
    if (!isPlatformBrowser(this.platformId)) return new Set();
    try {
      const raw = sessionStorage.getItem(DailyComponent.COLLAPSED_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }

  /** Write a single timer's collapse state. Silently no-ops if sessionStorage is unavailable or full. */
  saveCollapsedState(timerId: string, isCollapsed: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const current = this.getCollapsedTimers();
    if (isCollapsed) current.add(timerId); else current.delete(timerId);
    try {
      sessionStorage.setItem(DailyComponent.COLLAPSED_STORAGE_KEY, JSON.stringify([...current]));
    } catch {
      // Overflow/quota — degrade silently per plan edge-case spec.
    }
  }

  /** Called after loadTimers(): populate collapsedStates signal from sessionStorage. */
  private hydrateCollapsedStates(): void {
    const persisted = this.getCollapsedTimers();
    const map = new Map<string, boolean>();
    for (const t of this.timers()) {
      map.set(t.id, persisted.has(t.id));
    }
    this.collapsedStates.set(map);
  }

  /** Handler for <app-timer-card>'s onCollapseToggle output. */
  onTimerCollapsed(event: { timerId: string; isCollapsed: boolean }): void {
    this.saveCollapsedState(event.timerId, event.isCollapsed);
    const current = new Map(this.collapsedStates());
    current.set(event.timerId, event.isCollapsed);
    this.collapsedStates.set(current);
  }

  loadEntities() {
    this.api.getCompanies().subscribe((c) => this.companies.set(c));
    this.api.getProjects().subscribe((p) => this.projects.set(p));
    this.api.getTasks().subscribe((t) => this.tasks.set(t));
  }

  loadNotifications() {
    this.notificationsService.list({ date: this.dateString() }).subscribe((n) => this.notifications.set(n));
  }

  loadTimelineSettings() {
    this.notificationsService.getSettings().subscribe((s) => this.timelineSettings.set(s));
  }

  loadCapStatus() {
    this.capStatusService.getCapStatus(this.dateString()).subscribe((status) => {
      this.dailyCaps.set(status.projects.filter((p) => p.daily));
      this.lastCapStatus.set(status);
    });
  }

  lastCapStatus = signal<CapStatus | null>(null);

  getProjectNotifyOnCap(projectId: string): boolean {
    const project = this.projects().find((p) => p.id === projectId);
    return project?.notify_on_cap !== false;
  }

  toggleProjectCapNotification(cap: ProjectCapStatus) {
    const current = this.getProjectNotifyOnCap(cap.projectId);
    const newValue = !current;
    this.api.updateProject(cap.projectId, { notify_on_cap: newValue }).subscribe(() => {
      this.loadEntities();
      this.snackBar.open(
        newValue ? `Cap alerts enabled for ${cap.project}` : `Cap alerts disabled for ${cap.project}`,
        'OK',
        { duration: 2000 },
      );
    });
  }

  onAddNotification(event: { time: string; title: string }) {
    this.notificationsService.create({
      trigger_at: event.time,
      type: 'manual',
      title: event.title,
    }).subscribe(() => {
      this.loadNotifications();
      this.snackBar.open('Notification scheduled', 'OK', { duration: 2000 });
    });
  }

  prevDay() {
    const d = new Date(this.selectedDate());
    d.setDate(d.getDate() - 1);
    this.navigateToDate(d);
  }

  nextDay() {
    const d = new Date(this.selectedDate());
    d.setDate(d.getDate() + 1);
    this.navigateToDate(d);
  }

  today() {
    this.navigateToDate(new Date());
  }

  onDateChange(date: Date) {
    this.navigateToDate(date);
  }

  private navigateToDate(date: Date) {
    this.selectedDate.set(date);
    this.router.navigate(['/today', this.formatDate(date)]);
    this.loadTimers();
    this.loadNotifications();
    this.loadCapStatus();
  }

  addTimer() {
    const ref = this.dialog.open(NewTimerDialogComponent, {
      width: '450px',
      data: {
        companies: this.companies(),
        projects: this.projects(),
        tasks: this.tasks(),
      } as NewTimerDialogData,
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.timerService.create(result).subscribe(() => {
        this.loadTimers();
        this.snackBar.open('Timer started', 'OK', { duration: 2000 });
      });
    });
  }

  stopTimer(id: string) {
    this.timerService.stop(id).subscribe(() => {
      this.loadTimers();
      this.snackBar.open('Timer stopped', 'OK', { duration: 2000 });
    });
  }

  pauseTimer(id: string) {
    this.timerService.pause(id).subscribe(() => {
      this.loadTimers();
      this.snackBar.open('Timer paused', 'OK', { duration: 2000 });
    });
  }

  resumeTimer(id: string) {
    this.timerService.resume(id).subscribe(() => {
      this.loadTimers();
      this.snackBar.open('Timer resumed', 'OK', { duration: 2000 });
    });
  }

  deleteTimer(id: string) {
    if (!confirm('Delete this timer?')) return;
    this.timerService.delete(id).subscribe(() => {
      this.loadTimers();
      this.snackBar.open('Timer deleted', 'OK', { duration: 2000 });
    });
  }

  scheduleStopTimer(event: { id: string; ended: string }) {
    this.timerService.update(event.id, { ended: event.ended }).subscribe(() => {
      this.loadTimers();
      this.snackBar.open('Timer stopped at scheduled time', 'OK', { duration: 2000 });
    });
  }

  updateTimerTime(event: { id: string; started?: string; ended?: string; start_at?: string }) {
    const data: Record<string, string> = {};
    if (event.started) data['started'] = event.started;
    if (event.ended) data['ended'] = event.ended;
    if (event.start_at) data['start_at'] = event.start_at;
    this.timerService.update(event.id, data).subscribe(() => {
      this.loadTimers();
      this.snackBar.open('Time updated', 'OK', { duration: 2000 });
    });
  }

  updateTimer(event: { id: string; notes: string; project_id?: string | null; task_id?: string | null; notify_on_switch?: boolean }) {
    const data: Record<string, any> = { notes: event.notes };
    if (event.project_id !== undefined) data['project_id'] = event.project_id;
    if (event.task_id !== undefined) data['task_id'] = event.task_id;
    if (event.notify_on_switch !== undefined) data['notify_on_switch'] = event.notify_on_switch;
    this.timerService.update(event.id, data).subscribe(() => {
      this.loadTimers();
      this.snackBar.open('Timer updated', 'OK', { duration: 2000 });
    });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  formatDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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

  loadFavorites() {
    this.api.getFavorites().subscribe((f) => this.favorites.set(f));
  }

  isFavoriteTimer(timer: Timer): boolean {
    return this.favorites().some((f) =>
      f.company_id === timer.company_id
      && (f.project_id ?? null) === (timer.project_id ?? null)
      && (f.task_id ?? null) === (timer.task_id ?? null),
    );
  }

  toggleFavorite(event: { company_id: string; project_id: string | null; task_id: string | null }) {
    const existing = this.favorites().find((f) =>
      f.company_id === event.company_id
      && (f.project_id ?? null) === (event.project_id ?? null)
      && (f.task_id ?? null) === (event.task_id ?? null),
    );
    if (existing) {
      this.api.deleteFavorite(existing.id).subscribe(() => {
        this.loadFavorites();
        this.snackBar.open('Removed from favorites', 'OK', { duration: 2000 });
      });
    } else {
      this.api.createFavorite(event.company_id, event.project_id, event.task_id).subscribe(() => {
        this.loadFavorites();
        this.snackBar.open('Added to favorites', 'OK', { duration: 2000 });
      });
    }
  }

  selectFavorite(fav: FavoriteTemplate) {
    this.selectedFavorite.set(this.selectedFavorite()?.id === fav.id ? null : fav);
  }

  startFromFavorite() {
    const fav = this.selectedFavorite();
    if (!fav) return;
    this.timerService.create({
      company_id: fav.company_id,
      project_id: fav.project_id,
      task_id: fav.task_id,
    }).subscribe(() => {
      this.selectedFavorite.set(null);
      this.loadTimers();
      this.snackBar.open('Timer started', 'OK', { duration: 2000 });
    });
  }

  scheduleFromFavorite() {
    const fav = this.selectedFavorite();
    if (!fav) return;
    const ref = this.dialog.open(ScheduleTimerDialogComponent, {
      width: '400px',
      data: {
        company_name: fav.company_name,
        project_name: fav.project_name,
        task_name: fav.task_name,
        company_color: fav.company_color,
      },
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.timerService.create({
        company_id: fav.company_id,
        project_id: fav.project_id,
        task_id: fav.task_id,
        start_at: result.start_at,
      }).subscribe(() => {
        this.selectedFavorite.set(null);
        this.loadTimers();
        this.snackBar.open('Timer scheduled', 'OK', { duration: 2000 });
      });
    });
  }

  isToday(): boolean {
    return this.formatDate(this.selectedDate()) === this.formatDate(new Date());
  }
}

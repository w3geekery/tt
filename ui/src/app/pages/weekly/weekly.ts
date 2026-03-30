import { Component, OnInit, OnDestroy, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TimerCardComponent } from '../../components/timer-card';
import { BreadcrumbNavComponent, BreadcrumbItem } from '../../components/breadcrumb-nav';
import { DurationPipe } from '../../pipes/duration.pipe';
import { SkeletonComponent } from '../../components/skeleton';
import { TimerService } from '../../services/timer.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { NotificationTimelineComponent } from '../../components/notification-timeline';
import { NotificationsService } from '../../services/notifications.service';
import { SseService } from '../../services/sse.service';
import { CapStatusService } from '../../services/cap-status.service';
import { CapProgressBarComponent } from '../../components/cap-progress-bar';
import { PreferencesService } from '../../services/preferences.service';
import { Timer, TimerTemplate, Company, Project, Task, Notification, UserSettings, CapStatus, ProjectCapStatus } from '../../models';

interface DayColumn {
  date: string;       // YYYY-MM-DD
  label: string;      // "Mon 2/24"
  dayName: string;    // "Monday"
  timers: Timer[];
  totalMs: number;
}

@Component({
  selector: 'app-weekly',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatMenuModule,
    MatSnackBarModule,
    TimerCardComponent,
    BreadcrumbNavComponent,
    DurationPipe,
    RouterLink,
    SkeletonComponent,
    NotificationTimelineComponent,
    CapProgressBarComponent,
  ],
  templateUrl: './weekly.html',
  styleUrl: './weekly.scss',
})
export class WeeklyComponent implements OnInit, OnDestroy {
  timers = signal<Timer[]>([]);
  selectedWeekStart = signal<Date>(this.getMonday(new Date()));
  loading = signal(true);
  expandedTimerId = signal<string | null>(null);
  selectedCompanies = signal<Set<string>>(new Set());

  // New timer form state
  newTimerForDate = signal<string | null>(null); // YYYY-MM-DD of column with open form
  showFullForm = signal(false);
  templates = signal<TimerTemplate[]>([]);
  companies = signal<Company[]>([]);
  projects = signal<Project[]>([]);
  tasks = signal<Task[]>([]);
  newCompanyId = signal<string>('');
  newProjectId = signal<string | null>(null);
  newTaskId: string | null = null;
  newNotes = '';
  scheduleStart = '';
  scheduleEnd = '';

  // Recurring timer form state
  newRecurring = signal(false);
  newRecurringPattern = signal<'weekdays' | 'weekly'>('weekdays');
  newRecurringWeekday = signal<number>(1); // Monday default
  newRecurringStartTime = signal('09:00');

  // Notifications
  notificationsByDay = signal<Map<string, Notification[]>>(new Map());
  timelineSettings = signal<UserSettings>({ timeline_start_hour: 5, timeline_end_hour: 19, notify_on_cap: true });

  // Cap status
  capStatus = signal<CapStatus | null>(null);
  weeklyCaps = computed(() => (this.capStatus()?.projects ?? []).filter((p) => p.weekly));
  dailyCapsByDate = signal<Map<string, ProjectCapStatus[]>>(new Map());

  // Weekly ZB task links
  weeklyZbTasks = signal<Array<{ company: string; taskId: string; taskCode?: string }>>([]);

  // Navigation context
  fromMonthly = signal(false);

  auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private snackBar = inject(MatSnackBar);
  private notificationsService = inject(NotificationsService);
  private sse = inject(SseService);
  private capStatusService = inject(CapStatusService);
  prefs = inject(PreferencesService);
  private sseSub: { unsubscribe(): void } | null = null;

  // Monday of the selected week
  weekStart = computed(() => this.selectedWeekStart());

  // Sunday before Monday (start of calendar week)
  weekSunday = computed(() => {
    const sun = new Date(this.selectedWeekStart());
    sun.setDate(sun.getDate() - 1);
    return sun;
  });

  // Saturday after Friday (end of calendar week)
  weekEnd = computed(() => {
    const end = new Date(this.selectedWeekStart());
    end.setDate(end.getDate() + 5); // Saturday
    return end;
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

  dayColumns = computed<DayColumn[]>(() => {
    const timers = this.filteredTimers();
    const monday = this.selectedWeekStart();
    const showWeekend = this.prefs.showWeekend();
    const columns: DayColumn[] = [];

    const makeDayColumn = (d: Date): DayColumn => {
      const dateStr = this.formatDate(d);
      const dayTimers = timers.filter((t) => {
        const effective = t.started || t.start_at;
        if (!effective) return false;
        const timerDate = new Date(effective).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        return timerDate === dateStr;
      });
      const totalMs = dayTimers.reduce((sum, t) => {
        if (!t.started) return sum; // skip scheduled (unstarted) timers
        if (t.ended || t.state === 'paused') return sum + Number(t.duration_ms ?? 0);
        if (t.state === 'running') return sum + (Date.now() - new Date(t.started).getTime());
        return sum + Number(t.duration_ms ?? 0);
      }, 0);
      return {
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'America/Los_Angeles' }),
        dayName: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' }),
        timers: dayTimers,
        totalMs,
      };
    };

    // Sunday first (if showing weekends)
    if (showWeekend) {
      columns.push(makeDayColumn(this.weekSunday()));
    }

    // Monday through Friday
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      columns.push(makeDayColumn(d));
    }

    // Saturday last (if showing weekends)
    if (showWeekend) {
      columns.push(makeDayColumn(this.weekEnd()));
    }

    return columns;
  });

  weeklyTotal = computed(() => {
    return this.dayColumns().reduce((sum, col) => sum + col.totalMs, 0);
  });

  weeklyCompanyTotals = computed(() => {
    const map = new Map<string, number>();
    for (const col of this.dayColumns()) {
      for (const timer of col.timers) {
        if (!timer.started) continue; // skip scheduled (unstarted) timers
        const name = timer.company_name ?? 'Unknown';
        const ms = (timer.ended || timer.state === 'paused')
          ? Number(timer.duration_ms ?? 0)
          : Date.now() - new Date(timer.started).getTime();
        map.set(name, (map.get(name) ?? 0) + ms);
      }
    }
    return [...map.entries()]
      .map(([name, ms]) => ({ name, ms }))
      .sort((a, b) => b.ms - a.ms);
  });

  weekLabel = computed(() => {
    const sun = this.weekSunday();
    const sat = this.weekEnd();
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' };
    const startStr = sun.toLocaleDateString('en-US', opts);
    const endStr = sat.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
    return `${startStr} – ${endStr}`;
  });

  isThisWeek = computed(() => {
    return this.formatDate(this.selectedWeekStart()) === this.formatDate(this.getMonday(new Date()));
  });

  filteredProjects = computed(() => {
    const cid = this.newCompanyId();
    return cid ? this.projects().filter((p) => p.company_id === cid) : [];
  });

  filteredTasks = computed(() => {
    const pid = this.newProjectId();
    return pid ? this.tasks().filter((t) => t.project_id === pid) : [];
  });

  todayStr = computed(() => this.formatDate(new Date()));

  breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [{ label: 'Home', url: '/' }];
    if (this.fromMonthly()) {
      const mon = this.selectedWeekStart();
      items.push({ label: 'Monthly', url: `/monthly/${mon.getFullYear()}/${mon.getMonth() + 1}` });
    }
    items.push({ label: this.weekLabel(), url: null });
    return items;
  });

  constructor(
    private timerService: TimerService,
    private api: ApiService,
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
    this.route.paramMap.subscribe((params) => {
      const dateParam = params.get('date');
      if (dateParam) {
        this.selectedWeekStart.set(this.getMonday(new Date(dateParam + 'T00:00:00')));
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
          // Start any overdue scheduled timers first
          this.timerService.startScheduled().subscribe({
            next: (started) => {
              if (started.length > 0) {
                this.snackBar.open(`${started.length} scheduled timer(s) started`, 'OK', { duration: 3000 });
              }
              this.loadTimers();
            },
            error: () => this.loadTimers(),
          });
          this.loadEntities();
          this.loadWeekNotifications();
          this.loadTimelineSettings();
          this.loadCapStatus();
        } else {
          this.loading.set(false);
        }
      }
    }, 50);
  }

  private loadEntities() {
    this.api.getCompanies().subscribe((c) => this.companies.set(c));
    this.api.getProjects().subscribe((p) => this.projects.set(p));
    this.api.getTasks().subscribe((t) => this.tasks.set(t));
    this.timerService.getTemplates().subscribe((t) => this.templates.set(t));
  }

  loadTimers() {
    this.loading.set(true);
    // Always fetch Sun-Sat range so toggling weekend doesn't need a refetch
    const from = this.formatDate(this.weekSunday());
    const sat = this.weekEnd();
    const to = this.formatDate(sat);

    // Materialize recurring timers first, then load all timers
    this.timerService.materialize(from, to).subscribe({
      next: () => {
        this.timerService.getByRange(from, to).subscribe((t) => {
          this.timers.set(t);
          this.loading.set(false);
        });
      },
      error: () => {
        // Fall back to loading without materialization
        this.timerService.getByRange(from, to).subscribe((t) => {
          this.timers.set(t);
          this.loading.set(false);
        });
      },
    });

    // Fetch weekly ZB task links for this week
    const weekStartStr = this.formatDate(this.selectedWeekStart());
    this.api.getWeeklyTasks(weekStartStr).subscribe({
      next: (tasks) => this.weeklyZbTasks.set(tasks),
      error: () => this.weeklyZbTasks.set([]),
    });
  }

  prevWeek() {
    const d = new Date(this.selectedWeekStart());
    d.setDate(d.getDate() - 7);
    this.navigateToWeek(d);
  }

  nextWeek() {
    const d = new Date(this.selectedWeekStart());
    d.setDate(d.getDate() + 7);
    this.navigateToWeek(d);
  }

  thisWeek() {
    this.navigateToWeek(this.getMonday(new Date()));
  }

  private navigateToWeek(monday: Date) {
    this.selectedWeekStart.set(monday);
    this.router.navigate(['/weekly', this.formatDate(monday)]);
    this.loadTimers();
    this.loadWeekNotifications();
    this.loadCapStatus();
  }

  loadWeekNotifications() {
    const from = this.formatDate(this.weekSunday());
    const to = this.formatDate(this.weekEnd());
    this.notificationsService.list({ from, to }).subscribe((notifs) => {
      const byDay = new Map<string, Notification[]>();
      for (const notif of notifs) {
        const dayStr = new Date(notif.trigger_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        if (!byDay.has(dayStr)) byDay.set(dayStr, []);
        byDay.get(dayStr)!.push(notif);
      }
      this.notificationsByDay.set(byDay);
    });
  }

  loadTimelineSettings() {
    this.notificationsService.getSettings().subscribe((s) => this.timelineSettings.set(s));
  }

  loadCapStatus() {
    const monday = this.selectedWeekStart();
    const days = this.prefs.showWeekend() ? 7 : 5;
    const dailyMap = new Map<string, ProjectCapStatus[]>();

    // Fetch Monday for weekly caps
    const mondayStr = this.formatDate(monday);
    this.capStatusService.getCapStatus(mondayStr).subscribe((status) => {
      this.capStatus.set(status);
    });

    // Fetch each day for daily caps
    for (let i = 0; i < days; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = this.formatDate(d);
      this.capStatusService.getCapStatus(dateStr).subscribe((status) => {
        const caps = (status.projects ?? []).filter((p) => p.daily);
        dailyMap.set(dateStr, caps);
        this.dailyCapsByDate.set(new Map(dailyMap));
      });
    }
  }

  getDailyCapsForDay(date: string): ProjectCapStatus[] {
    return this.dailyCapsByDate().get(date) ?? [];
  }

  getDailyCapTooltip(cap: ProjectCapStatus): string {
    if (!cap.daily) return '';
    return `${cap.company} | ${cap.project} ${cap.daily.cap}hr daily cap`;
  }

  getNotificationsForDay(date: string): Notification[] {
    return this.notificationsByDay().get(date) ?? [];
  }

  onAddNotification(date: string, event: { time: string; title: string }) {
    this.notificationsService.create({
      trigger_at: event.time,
      type: 'manual',
      title: event.title,
    }).subscribe(() => {
      this.loadWeekNotifications();
      this.snackBar.open('Notification scheduled', 'OK', { duration: 2000 });
    });
  }

  copyZbTaskLink(task: { taskId: string; taskCode?: string; company: string }) {
    const url = `https://app.zerobias.com/resource/${task.taskId}`;
    navigator.clipboard.writeText(url);
    this.snackBar.open(`Copied ${task.taskCode} link`, '', { duration: 2000 });
  }

  openZbTask(task: { taskId: string }) {
    window.open(`https://app.zerobias.com/resource/${task.taskId}`, '_blank');
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

  toggleExpand(id: string) {
    this.expandedTimerId.set(this.expandedTimerId() === id ? null : id);
  }

  stopTimer(id: string) {
    this.timerService.stop(id).subscribe(() => this.loadTimers());
  }

  pauseTimer(id: string) {
    this.timerService.pause(id).subscribe(() => this.loadTimers());
  }

  resumeTimer(id: string) {
    this.timerService.resume(id).subscribe(() => this.loadTimers());
  }

  scheduleStopTimer(event: { id: string; ended: string }) {
    this.timerService.update(event.id, { ended: event.ended }).subscribe(() => this.loadTimers());
  }

  updateTimerTime(event: { id: string; started?: string; ended?: string; start_at?: string }) {
    const data: Record<string, string> = {};
    if (event.started) data['started'] = event.started;
    if (event.ended) data['ended'] = event.ended;
    if (event.start_at) data['start_at'] = event.start_at;
    this.timerService.update(event.id, data).subscribe(() => this.loadTimers());
  }

  deleteTimer(id: string) {
    const timer = this.timers().find((t) => t.id === id);
    if (timer?.recurring_id) {
      // Recurring timer: skip this occurrence (don't delete the rule)
      const action = confirm(
        'This is a recurring timer. Click OK to skip this occurrence, or Cancel to keep it.'
      );
      if (!action) return;
      const timerDate = timer.started || timer.start_at;
      if (timerDate) {
        const dateStr = new Date(timerDate).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        this.timerService.skipOccurrence(timer.recurring_id, dateStr).subscribe(() => {
          this.timerService.delete(id).subscribe(() => this.loadTimers());
        });
      }
    } else {
      if (!confirm('Delete this timer?')) return;
      this.timerService.delete(id).subscribe(() => this.loadTimers());
    }
  }

  updateTimer(event: { id: string; notes: string; project_id?: string | null; task_id?: string | null; notify_on_switch?: boolean }) {
    const data: Record<string, any> = { notes: event.notes };
    if (event.project_id !== undefined) data['project_id'] = event.project_id;
    if (event.task_id !== undefined) data['task_id'] = event.task_id;
    if (event.notify_on_switch !== undefined) data['notify_on_switch'] = event.notify_on_switch;
    this.timerService.update(event.id, data).subscribe(() => this.loadTimers());
  }

  // --- New timer form ---

  toggleNewTimerForm(date: string) {
    if (this.newTimerForDate() === date) {
      this.newTimerForDate.set(null);
      this.showFullForm.set(false);
      return;
    }
    this.resetNewForm();
    this.newTimerForDate.set(date);
    // Default to schedule mode for non-today
    if (date !== this.todayStr()) {
      this.scheduleStart = `${date}T09:00`;
    }
  }

  onNewCompanyChange(id: string) {
    this.newCompanyId.set(id);
    this.newProjectId.set(null);
    this.newTaskId = null;
  }

  onNewProjectChange(id: string | null) {
    this.newProjectId.set(id);
    this.newTaskId = null;
  }

  startFromTemplate(tpl: TimerTemplate) {
    const date = this.newTimerForDate();
    if (!date) return;

    if (date === this.todayStr()) {
      // Today: start immediately
      this.timerService.create({
        company_id: tpl.company_id,
        project_id: tpl.project_id,
        task_id: tpl.task_id,
      }).subscribe(() => {
        this.loadTimers();
        this.newTimerForDate.set(null);
        this.snackBar.open('Timer started', 'OK', { duration: 2000 });
      });
    } else {
      // Non-today: populate form and show time picker
      this.newCompanyId.set(tpl.company_id);
      this.newProjectId.set(tpl.project_id);
      this.newTaskId = tpl.task_id;
      if (!this.scheduleStart) {
        this.scheduleStart = `${date}T09:00`;
      }
      this.showFullForm.set(true);
    }
  }

  startNewTimer() {
    const date = this.newTimerForDate();
    if (!date) return;

    // If recurring, create a recurring rule instead
    if (this.newRecurring()) {
      this.timerService.createRecurring({
        company_id: this.newCompanyId(),
        project_id: this.newProjectId(),
        task_id: this.newTaskId,
        pattern: this.newRecurringPattern(),
        weekday: this.newRecurringPattern() === 'weekly' ? this.newRecurringWeekday() : null,
        start_time: this.newRecurringStartTime(),
        start_date: date,
        notes: this.newNotes || null,
      } as any).subscribe(() => {
        this.loadTimers();
        this.newTimerForDate.set(null);
        this.showFullForm.set(false);
        this.resetNewForm();
        this.snackBar.open('Recurring timer created', 'OK', { duration: 2000 });
      });
      return;
    }

    const data: Record<string, unknown> = {
      company_id: this.newCompanyId(),
      project_id: this.newProjectId(),
      task_id: this.newTaskId,
      notes: this.newNotes || null,
    };
    if (date !== this.todayStr()) {
      // Non-today: create a scheduled timer using start_at
      // datetime-local value is already in local time, convert to ISO with timezone
      const localDt = this.scheduleStart || `${date}T09:00`;
      data['start_at'] = new Date(localDt).toISOString();
    }
    const isScheduled = date !== this.todayStr();
    this.timerService.create(data as Partial<Timer>).subscribe(() => {
      this.loadTimers();
      this.newTimerForDate.set(null);
      this.showFullForm.set(false);
      this.resetNewForm();
      this.snackBar.open(isScheduled ? 'Timer scheduled' : 'Timer started', 'OK', { duration: 2000 });
    });
  }

  private resetNewForm() {
    this.newCompanyId.set('');
    this.newProjectId.set(null);
    this.newTaskId = null;
    this.newNotes = '';
    this.scheduleStart = '';
    this.showFullForm.set(false);
    this.newRecurring.set(false);
    this.newRecurringPattern.set('weekdays');
    this.newRecurringWeekday.set(1);
    this.newRecurringStartTime.set('09:00');
  }

  openRecurringFromTimer(event: { company_id: string; project_id: string | null; task_id: string | null; start_time: string }, date: string) {
    // Pre-populate the new timer form with recurring enabled
    this.resetNewForm();
    this.newTimerForDate.set(date);
    this.showFullForm.set(true);
    this.newCompanyId.set(event.company_id);
    this.newProjectId.set(event.project_id);
    this.newTaskId = event.task_id;
    this.newRecurring.set(true);
    this.newRecurringStartTime.set(event.start_time);
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    d.setDate(diff);
    return d;
  }
}

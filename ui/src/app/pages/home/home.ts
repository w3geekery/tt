import { Component, OnInit, OnDestroy, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StopTimerMenuComponent } from '../../components/stop-timer-menu';
import { MarkdownNoteEditorComponent } from '../../components/markdown-note-editor.component';
import { DurationPipe } from '../../pipes/duration.pipe';
import { SkeletonComponent } from '../../components/skeleton';
import { TimerService } from '../../services/timer.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { SseService } from '../../services/sse.service';
import { CapStatusService } from '../../services/cap-status.service';
import { CapProgressBarComponent } from '../../components/cap-progress-bar';
import { SegmentListComponent } from '../../components/segment-list.component';
import { Timer, TimerTemplate, Company, Project, Task, CapStatus, ProjectCapStatus } from '../../models';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    StopTimerMenuComponent,
    MarkdownNoteEditorComponent,
    SkeletonComponent,
    CapProgressBarComponent,
    SegmentListComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private sse = inject(SseService);

  loading = signal(true);
  currentTimer = signal<Timer | null>(null);
  companies = signal<Company[]>([]);
  projects = signal<Project[]>([]);
  tasks = signal<Task[]>([]);

  // Live duration
  liveDuration = signal('0m');
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private sseSub: { unsubscribe(): void } | null = null;

  // Autocap suggestion
  autocapSuggestion = signal<{ switchTime: Date; remainingMs: number } | null>(null);

  // Cap status
  capStatus = signal<ProjectCapStatus | null>(null);
  private capStatusService = inject(CapStatusService);

  // Templates
  templates = signal<TimerTemplate[]>([]);

  // New timer form
  showNewForm = signal(false);
  showFullForm = signal(false);
  showSchedule = signal(false);
  newCompanyId = signal<string>('');
  newProjectId = signal<string | null>(null);
  newTaskId: string | null = null;
  newNotes = '';
  scheduleStart = '';

  // (schedule stop handled by StopTimerMenuComponent)

  // Switch timer
  showSwitchPicker = signal(false);
  showSegments = signal(false);

  // Inline start time editing
  editingStartTime = signal(false);
  editStartValue = '';

  filteredProjects = computed(() => {
    const cid = this.newCompanyId();
    return cid ? this.projects().filter((p) => p.company_id === cid) : [];
  });

  filteredTasks = computed(() => {
    const pid = this.newProjectId();
    return pid ? this.tasks().filter((t) => t.project_id === pid) : [];
  });

  constructor(
    private timerService: TimerService,
    private api: ApiService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.sse.connect();
    this.sseSub = this.sse.timerEvents$.subscribe(() => this.loadRunningTimer());
    this.waitForAuthThenLoad();
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.sseSub?.unsubscribe();
  }

  private waitForAuthThenLoad() {
    const check = setInterval(() => {
      if (!this.auth.loading()) {
        clearInterval(check);
        if (this.auth.user()) {
          // Start any overdue scheduled timers, then load running timer
          this.timerService.startScheduled().subscribe({
            next: (started) => {
              if (started.length > 0) {
                this.snackBar.open(`${started.length} scheduled timer(s) started`, 'OK', { duration: 3000 });
              }
              this.loadRunningTimer();
            },
            error: () => this.loadRunningTimer(),
          });
          this.loadEntities();
        }
      }
    }, 50);
  }

  loadRunningTimer() {
    this.loading.set(true);
    this.timerService.getRunning().subscribe((t) => {
      this.currentTimer.set(t);
      this.loading.set(false);
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      if (t) {
        this.updateLiveDuration();
        this.intervalId = setInterval(() => this.updateLiveDuration(), 1000);
        // Show autocap suggestion if ZeroBias is running
        if (t.company_name?.toLowerCase() === 'zerobias') {
          this.checkAutocap(t);
        } else {
          this.autocapSuggestion.set(null);
        }
        // Load cap status for running timer
        this.loadCapStatus(t);
      } else {
        this.autocapSuggestion.set(null);
        this.capStatus.set(null);
      }
    });
  }

  loadEntities() {
    this.api.getCompanies().subscribe((c) => this.companies.set(c));
    this.api.getProjects().subscribe((p) => this.projects.set(p));
    this.api.getTasks().subscribe((t) => this.tasks.set(t));
    this.timerService.getTemplates().subscribe((t) => this.templates.set(t));
  }

  private updateLiveDuration() {
    const timer = this.currentTimer();
    if (!timer || !timer.started) return;
    const pipe = new DurationPipe();

    // Use segments if available for accurate duration (excludes breaks)
    if (timer.segments && timer.segments.length > 0) {
      let total = 0;
      for (const seg of timer.segments) {
        if (seg.ended) {
          total += Number(seg.duration_ms ?? 0);
        } else {
          total += Date.now() - new Date(seg.started).getTime();
        }
      }
      this.liveDuration.set(pipe.transform(total));
    } else {
      const ms = Date.now() - new Date(timer.started).getTime();
      this.liveDuration.set(pipe.transform(ms));
    }
  }

  // --- Timer actions ---

  stopTimer() {
    const timer = this.currentTimer();
    if (!timer) return;
    this.timerService.stop(timer.id).subscribe(() => {
      this.currentTimer.set(null);
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.snackBar.open('Timer stopped', 'OK', { duration: 2000 });
    });
  }

  pauseTimer() {
    this.stopTimer();
  }

  resumeTimer() {
    const timer = this.currentTimer();
    // If no current timer, try to find last stopped from today
    // For now, just use stored references
    if (timer) return; // already running
    // Resume based on last known timer info — handled by creating from stored state
    this.snackBar.open('No timer to resume', 'OK', { duration: 2000 });
  }

  // --- Notes editing ---

  saveNotesInline(notes: string) {
    const timer = this.currentTimer();
    if (!timer) return;
    this.timerService.update(timer.id, { notes }).subscribe(() => {
      this.loadRunningTimer();
      this.snackBar.open('Notes updated', 'OK', { duration: 2000 });
    });
  }

  // --- Start time editing ---

  startEditStartTime() {
    const timer = this.currentTimer();
    if (!timer || !timer.started) return;
    const d = new Date(timer.started);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    this.editStartValue = `${h}:${m}`;
    this.editingStartTime.set(true);
  }

  saveStartTime() {
    const timer = this.currentTimer();
    if (!timer || !timer.started || !this.editStartValue) { this.editingStartTime.set(false); return; }
    const d = new Date(timer.started);
    const origH = d.getHours().toString().padStart(2, '0');
    const origM = d.getMinutes().toString().padStart(2, '0');
    if (this.editStartValue === `${origH}:${origM}`) { this.editingStartTime.set(false); return; }
    const [h, m] = this.editStartValue.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    this.timerService.update(timer.id, { started: d.toISOString() }).subscribe(() => {
      this.loadRunningTimer();
      this.editingStartTime.set(false);
      this.snackBar.open('Start time updated', 'OK', { duration: 2000 });
    });
  }

  // --- New timer form ---

  toggleNewForm() {
    this.showNewForm.update((v) => !v);
    if (this.showNewForm()) {
      this.showSchedule.set(false);
      this.showFullForm.set(false);
      this.resetNewForm();
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

  toggleSchedule() {
    this.showSchedule.update((v) => !v);
    if (this.showSchedule()) {
      this.scheduleStart = '';
    }
  }

  startNewTimer() {
    const data: Partial<Timer> = {
      company_id: this.newCompanyId(),
      project_id: this.newProjectId(),
      task_id: this.newTaskId,
      notes: this.newNotes || null,
    };

    if (this.showSchedule() && this.scheduleStart) {
      // Schedule mode: create with start_at for future start
      (data as Record<string, unknown>)['start_at'] = new Date(this.scheduleStart).toISOString();
    }

    // If there's a running timer, stop it first
    const current = this.currentTimer();
    if (current) {
      this.timerService.stop(current.id).subscribe(() => {
        this.createTimer(data);
      });
    } else {
      this.createTimer(data);
    }
  }

  private createTimer(data: Partial<Timer>) {
    this.timerService.create(data).subscribe((created) => {
      this.loadRunningTimer();
      this.showNewForm.set(false);
      this.showSchedule.set(false);
      this.resetNewForm();
      this.snackBar.open('Timer started', 'OK', { duration: 2000 });
      // Check autocap if this is a ZeroBias timer (not scheduled)
      if (created.company_name?.toLowerCase() === 'zerobias' && !data.start_at) {
        this.checkAutocap(created);
      } else {
        this.autocapSuggestion.set(null);
      }
    });
  }

  saveScheduledEntry() {
    if (!this.scheduleStart) return;
    const data: Record<string, unknown> = {
      company_id: this.newCompanyId(),
      project_id: this.newProjectId(),
      task_id: this.newTaskId,
      notes: this.newNotes || null,
      start_at: new Date(this.scheduleStart).toISOString(),
    };

    this.timerService.create(data as Partial<Timer>).subscribe(() => {
      this.loadRunningTimer();
      this.showNewForm.set(false);
      this.showSchedule.set(false);
      this.resetNewForm();
      this.snackBar.open('Timer scheduled', 'OK', { duration: 2000 });
    });
  }

  private resetNewForm() {
    this.newCompanyId.set('');
    this.newProjectId.set(null);
    this.newTaskId = null;
    this.newNotes = '';
    this.scheduleStart = '';
  }

  // --- Template quick-start ---

  startFromTemplate(tpl: TimerTemplate) {
    const data: Partial<Timer> = {
      company_id: tpl.company_id,
      project_id: tpl.project_id,
      task_id: tpl.task_id,
    };
    const current = this.currentTimer();
    if (current) {
      this.timerService.stop(current.id).subscribe(() => this.createTimer(data));
    } else {
      this.createTimer(data);
    }
  }

  switchToTemplate(tpl: TimerTemplate) {
    this.showSwitchPicker.set(false);
    this.startFromTemplate(tpl);
  }

  // --- Schedule stop ---

  scheduleStop(ended: string) {
    const timer = this.currentTimer();
    if (!timer) return;
    this.timerService.update(timer.id, { ended }).subscribe(() => {
      this.loadRunningTimer();
      this.snackBar.open('Timer stopped at scheduled time', 'OK', { duration: 2000 });
    });
  }

  // --- Autocap ---

  private checkAutocap(runningTimer: Timer) {
    const today = new Date().toISOString().slice(0, 10);
    this.timerService.getByDate(today).subscribe((timers) => {
      // Skip if an autocap scheduled timer already exists
      const hasAutocap = timers.some(t =>
        t.company_name?.toLowerCase().includes('w3geekery') && t.start_at && !t.started
      );
      if (hasAutocap) {
        this.autocapSuggestion.set(null);
        return;
      }

      const CAP_MS = 4 * 60 * 60 * 1000;
      // Sum completed ZeroBias entries (exclude current running timer)
      const completedMs = timers
        .filter(t => t.company_name?.toLowerCase() === 'zerobias' && t.id !== runningTimer.id && t.duration_ms)
        .reduce((sum, t) => sum + Number(t.duration_ms), 0);

      // Include elapsed time on the running timer
      const runningElapsedMs = runningTimer.started
        ? Date.now() - new Date(runningTimer.started).getTime()
        : 0;

      const totalMs = completedMs + runningElapsedMs;
      const remainingMs = CAP_MS - totalMs;
      if (remainingMs <= 0) {
        this.autocapSuggestion.set(null);
        return;
      }
      const switchTime = new Date(Date.now() + remainingMs);
      this.autocapSuggestion.set({ switchTime, remainingMs });
    });
  }

  createAutocap() {
    const suggestion = this.autocapSuggestion();
    const runningTimer = this.currentTimer();
    if (!suggestion || !runningTimer) return;

    // Find W3Geekery company + SME Mart project + General Development task
    const w3Company = this.companies().find(c => c.name.toLowerCase().includes('w3geekery'));
    if (!w3Company) {
      this.snackBar.open('W3Geekery company not found', 'OK', { duration: 3000 });
      return;
    }

    const smeMartProject = this.projects().find(p => p.company_id === w3Company.id && p.name.toLowerCase().includes('sme mart'));
    const genDevTask = smeMartProject
      ? this.tasks().find(t => t.project_id === smeMartProject.id && t.name.toLowerCase().includes('general development'))
      : null;

    // Enable notify_on_switch on current timer
    this.timerService.update(runningTimer.id, { notify_on_switch: true } as Partial<Timer>).subscribe();

    // Create scheduled timer at switch time
    const scheduledData: Partial<Timer> = {
      company_id: w3Company.id,
      project_id: smeMartProject?.id ?? null,
      task_id: genDevTask?.id ?? null,
      start_at: suggestion.switchTime.toISOString(),
    };

    this.timerService.create(scheduledData).subscribe(() => {
      this.autocapSuggestion.set(null);
      this.snackBar.open(
        `Autocap set — switching to W3Geekery at ${this.formatTime(suggestion.switchTime.toISOString())}`,
        'OK',
        { duration: 4000 },
      );
    });
  }

  dismissAutocap() {
    this.autocapSuggestion.set(null);
  }

  private lastCapStatusResponse = signal<CapStatus | null>(null);

  private loadCapStatus(timer: Timer) {
    this.capStatusService.getCapStatus().subscribe((status) => {
      this.lastCapStatusResponse.set(status);
      // Only show cap bar if the running timer's project has a cap
      const match = timer.project_id
        ? status.projects.find((p) => p.projectId === timer.project_id)
        : null;
      this.capStatus.set(match ?? null);
    });
  }

  capTooltip(): string {
    const cap = this.capStatus();
    if (!cap) return '';
    const parts: string[] = [];
    if (cap.daily) {
      parts.push(`${cap.company} | ${cap.project} ${cap.daily.cap}hr daily cap: ${cap.daily.logged}h logged (${cap.daily.pct}%)`);
    }
    if (cap.weekly) {
      parts.push(`${cap.company} | ${cap.project} ${cap.weekly.cap}hr weekly cap: ${cap.weekly.logged}h logged (${cap.weekly.pct}%)`);
    }
    return parts.join('\n');
  }

  capPct(): number {
    const cap = this.capStatus();
    if (!cap) return 0;
    // Show daily cap pct if available, otherwise weekly
    return cap.daily?.pct ?? cap.weekly?.pct ?? 0;
  }

  capBarStatus(): 'ok' | 'warning' | 'at_cap' | 'over_cap' {
    const cap = this.capStatus();
    if (!cap) return 'ok';
    return cap.daily?.status ?? cap.weekly?.status ?? 'ok';
  }

  // --- Cap notification per-project toggle ---

  projectNotifyOnCap(): boolean {
    const cap = this.capStatus();
    if (!cap) return true;
    const project = this.projects().find((p) => p.id === cap.projectId);
    return project?.notify_on_cap !== false;
  }

  toggleProjectCapNotification() {
    const cap = this.capStatus();
    if (!cap) return;
    const current = this.projectNotifyOnCap();
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

  // --- Helpers ---

  contrastColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000' : '#fff';
  }

  formatTime(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

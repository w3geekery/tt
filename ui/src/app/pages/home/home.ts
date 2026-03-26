import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { SseService } from '../../services/sse.service';
import { TimerCardComponent } from '../../components/timer-card/timer-card';
import { CapBarComponent } from '../../components/cap-bar/cap-bar';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer, Company, Project, CapStatus } from '../../models/types';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatFormFieldModule, MatInputModule, MatDividerModule, FormsModule,
    TimerCardComponent, CapBarComponent, DurationPipe,
  ],
  template: `
    <h2>Today</h2>

    <!-- Quick start -->
    <div class="quick-start">
      <mat-form-field appearance="outline">
        <mat-label>Company</mat-label>
        <mat-select [(ngModel)]="newTimer.company_id">
          @for (co of companies; track co.id) {
            <mat-option [value]="co.id">{{ co.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Project</mat-label>
        <mat-select [(ngModel)]="newTimer.project_id">
          <mat-option [value]="null">None</mat-option>
          @for (proj of filteredProjects; track proj.id) {
            <mat-option [value]="proj.id">{{ proj.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Notes</mat-label>
        <input matInput [(ngModel)]="newTimer.notes" placeholder="What are you working on?">
      </mat-form-field>
      <button mat-fab extended color="primary" (click)="quickStart()" [disabled]="!newTimer.company_id">
        <mat-icon>play_arrow</mat-icon> Start
      </button>
    </div>

    <!-- Cap status -->
    @if (caps.length) {
      <div class="caps-section">
        @for (cap of caps; track cap.project_id) {
          @if (cap.daily) {
            <app-cap-bar
              [label]="cap.company_name + ' / ' + cap.project_name + ' (daily)'"
              [capHrs]="cap.daily.cap_hrs"
              [usedHrs]="cap.daily.used_hrs"
              [pct]="cap.daily.pct"
            />
          }
          @if (cap.weekly) {
            <app-cap-bar
              [label]="cap.company_name + ' / ' + cap.project_name + ' (weekly)'"
              [capHrs]="cap.weekly.cap_hrs"
              [usedHrs]="cap.weekly.used_hrs"
              [pct]="cap.weekly.pct"
            />
          }
        }
      </div>
    }

    <mat-divider />

    <!-- Today's timers -->
    <div class="today-total">
      Total: {{ todayTotalMs | duration:'decimal' }}
    </div>

    @for (timer of todayTimers; track timer.id) {
      <app-timer-card
        [timer]="timer"
        [companyName]="companyMap.get(timer.company_id) ?? ''"
        [projectName]="timer.project_id ? (projectMap.get(timer.project_id) ?? '') : ''"
        (start)="onStart($event)"
        (stop)="onStop($event)"
        (pause)="onPause($event)"
        (resume)="onResume($event)"
      />
    }

    @if (!todayTimers.length) {
      <p class="empty">No timers yet today. Start one above!</p>
    }
  `,
  styles: `
    .quick-start {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .quick-start mat-form-field { flex: 1; min-width: 160px; }
    .caps-section { margin: 16px 0; }
    .today-total {
      font-size: 1.1rem;
      font-weight: 500;
      margin: 16px 0 8px;
      color: var(--mat-sys-primary);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
      padding: 32px;
    }
  `,
})
export class HomeComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private sse = inject(SseService);
  private sub = new Subscription();

  companies: Company[] = [];
  projects: Project[] = [];
  todayTimers: Timer[] = [];
  caps: CapStatus[] = [];

  companyMap = new Map<string, string>();
  projectMap = new Map<string, string>();

  newTimer = { company_id: '', project_id: null as string | null, notes: '' };

  get filteredProjects(): Project[] {
    if (!this.newTimer.company_id) return this.projects;
    return this.projects.filter(p => p.company_id === this.newTimer.company_id);
  }

  get todayTotalMs(): number {
    return this.todayTimers.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  }

  ngOnInit(): void {
    this.loadData();
    this.sse.connect();
    this.sub.add(this.sse.onTimerChange().subscribe(() => this.loadTimers()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private loadData(): void {
    this.api.getCompanies().subscribe(list => {
      this.companies = list;
      this.companyMap = new Map(list.map(c => [c.id, c.name]));
      if (list.length === 1) this.newTimer.company_id = list[0].id;
    });
    this.api.getProjects().subscribe(list => {
      this.projects = list;
      this.projectMap = new Map(list.map(p => [p.id, p.name]));
    });
    this.loadTimers();
    this.api.getCapStatus().subscribe(list => this.caps = list);
  }

  private loadTimers(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.api.getTimersByDate(today).subscribe(list => this.todayTimers = list);
    this.api.getCapStatus().subscribe(list => this.caps = list);
  }

  quickStart(): void {
    this.api.createTimer({
      company_id: this.newTimer.company_id,
      project_id: this.newTimer.project_id ?? undefined,
      notes: this.newTimer.notes || undefined,
    }).subscribe(timer => {
      this.api.startTimer(timer.id).subscribe(() => {
        this.newTimer.notes = '';
        this.loadTimers();
      });
    });
  }

  onStart(timer: Timer): void {
    this.api.startTimer(timer.id).subscribe(() => this.loadTimers());
  }

  onStop(timer: Timer): void {
    this.api.stopTimer(timer.id).subscribe(() => this.loadTimers());
  }

  onPause(timer: Timer): void {
    this.api.pauseTimer(timer.id).subscribe(() => this.loadTimers());
  }

  onResume(timer: Timer): void {
    this.api.resumeTimer(timer.id).subscribe(() => this.loadTimers());
  }
}

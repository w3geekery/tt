import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { TimerCardComponent } from '../../components/timer-card/timer-card';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer, Company, Project } from '../../models/types';

@Component({
  selector: 'app-daily',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatIconModule, MatDatepickerModule,
    MatFormFieldModule, MatInputModule, MatNativeDateModule, FormsModule,
    TimerCardComponent, DurationPipe,
  ],
  template: `
    <div class="header">
      <button mat-icon-button (click)="prevDay()"><mat-icon>chevron_left</mat-icon></button>
      <mat-form-field appearance="outline">
        <mat-label>Date</mat-label>
        <input matInput [matDatepicker]="picker" [(ngModel)]="selectedDate" (dateChange)="onDateChange()">
        <mat-datepicker-toggle matSuffix [for]="picker" />
        <mat-datepicker #picker />
      </mat-form-field>
      <button mat-icon-button (click)="nextDay()"><mat-icon>chevron_right</mat-icon></button>
      <span class="total">{{ totalMs | duration:'decimal' }}</span>
    </div>

    @for (timer of timers; track timer.id) {
      <app-timer-card
        [timer]="timer"
        [companyName]="companyMap.get(timer.company_id) ?? ''"
        [projectName]="timer.project_id ? (projectMap.get(timer.project_id) ?? '') : ''"
        (start)="onAction('start', $event)"
        (stop)="onAction('stop', $event)"
        (pause)="onAction('pause', $event)"
        (resume)="onAction('resume', $event)"
      />
    }

    @if (!timers.length) {
      <p class="empty">No timers for this date.</p>
    }
  `,
  styles: `
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .total {
      margin-left: auto;
      font-size: 1.2rem;
      font-weight: 500;
      color: var(--mat-sys-primary);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
      padding: 32px;
    }
  `,
})
export class DailyComponent implements OnInit {
  private api = inject(ApiService);

  selectedDate = new Date();
  timers: Timer[] = [];
  companyMap = new Map<string, string>();
  projectMap = new Map<string, string>();

  get totalMs(): number {
    return this.timers.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  }

  ngOnInit(): void {
    this.api.getCompanies().subscribe(list => this.companyMap = new Map(list.map(c => [c.id, c.name])));
    this.api.getProjects().subscribe(list => this.projectMap = new Map(list.map(p => [p.id, p.name])));
    this.loadTimers();
  }

  onDateChange(): void { this.loadTimers(); }

  prevDay(): void {
    this.selectedDate = new Date(this.selectedDate.getTime() - 86400000);
    this.loadTimers();
  }

  nextDay(): void {
    this.selectedDate = new Date(this.selectedDate.getTime() + 86400000);
    this.loadTimers();
  }

  onAction(action: string, timer: Timer): void {
    const obs = action === 'start' ? this.api.startTimer(timer.id)
      : action === 'stop' ? this.api.stopTimer(timer.id)
      : action === 'pause' ? this.api.pauseTimer(timer.id)
      : this.api.resumeTimer(timer.id);
    obs.subscribe(() => this.loadTimers());
  }

  private loadTimers(): void {
    const dateStr = this.selectedDate.toISOString().slice(0, 10);
    this.api.getTimersByDate(dateStr).subscribe(list => this.timers = list);
  }
}

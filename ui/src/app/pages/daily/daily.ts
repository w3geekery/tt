import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { SnackbarService } from '../../services/snackbar.service';
import { TimerCardComponent } from '../../components/timer-card/timer-card';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer, TimerSegment } from '../../models/types';

@Component({
  selector: 'app-daily',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatIconModule, MatDatepickerModule,
    MatFormFieldModule, MatInputModule, MatNativeDateModule, MatChipsModule, FormsModule,
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
      @if (!isToday) {
        <button mat-stroked-button (click)="goToday()">Today</button>
      }
      <span class="total">{{ totalMs | duration:'decimal' }}</span>
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

    @for (timer of filteredTimers; track timer.id) {
      <app-timer-card
        [timer]="timer"
        [companyName]="companyMap.get(timer.company_id) ?? ''"
        [projectName]="timer.project_id ? (projectMap.get(timer.project_id) ?? '') : ''"
        [segments]="segmentsMap.get(timer.id) ?? []"
        (start)="onAction('start', $event)"
        (stop)="onAction('stop', $event)"
        (pause)="onAction('pause', $event)"
        (resume)="onAction('resume', $event)"
        (deleteTimer)="onAction('delete', $event)"
        (updateTimer)="onUpdate($event)"
      />
    }

    @if (!filteredTimers.length) {
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
    .filter-chips {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
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
  private snack = inject(SnackbarService);

  selectedDate = new Date();
  timers: Timer[] = [];
  companyMap = new Map<string, string>();
  projectMap = new Map<string, string>();
  segmentsMap = new Map<string, TimerSegment[]>();
  companyChips: Array<{ id: string; name: string; selected: boolean }> = [];

  get isToday(): boolean {
    return this.selectedDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  }

  get filteredTimers(): Timer[] {
    const selected = this.companyChips.filter(c => c.selected).map(c => c.id);
    if (selected.length === 0 || selected.length === this.companyChips.length) return this.timers;
    return this.timers.filter(t => selected.includes(t.company_id));
  }

  get totalMs(): number {
    return this.filteredTimers.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
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

  goToday(): void {
    this.selectedDate = new Date();
    this.loadTimers();
  }

  onAction(action: string, timer: Timer): void {
    const obs = action === 'start' ? this.api.startTimer(timer.id)
      : action === 'stop' ? this.api.stopTimer(timer.id)
      : action === 'pause' ? this.api.pauseTimer(timer.id)
      : action === 'delete' ? this.api.deleteTimer(timer.id) as any
      : this.api.resumeTimer(timer.id);
    obs.subscribe(() => {
      const verb = action.charAt(0).toUpperCase() + action.slice(1) + (action.endsWith('e') ? 'd' : 'ed');
      this.snack.show(`${verb} ${timer.slug}`);
      this.loadTimers();
    });
  }

  onUpdate(event: { id: string; changes: Record<string, unknown> }): void {
    this.api.updateTimer(event.id, event.changes as Partial<Timer>).subscribe(() => {
      this.snack.show('Timer updated');
      this.loadTimers();
    });
  }

  private loadTimers(): void {
    const dateStr = this.selectedDate.toISOString().slice(0, 10);
    this.api.getTimersByDate(dateStr).subscribe(list => {
      this.timers = list;
      this.updateChips(list);
      for (const t of list) {
        this.api.getSegments(t.id).subscribe(segs => this.segmentsMap.set(t.id, segs));
      }
    });
  }

  private updateChips(timers: Timer[]): void {
    const ids = new Set(timers.map(t => t.company_id));
    this.companyChips = [...ids].map(id => ({
      id,
      name: this.companyMap.get(id) ?? id,
      selected: this.companyChips.find(c => c.id === id)?.selected ?? true,
    }));
  }
}

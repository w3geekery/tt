import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer } from '../../models/types';

@Component({
  selector: 'app-timer-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatTooltipModule, DurationPipe],
  template: `
    <mat-card [class.running]="timer.state === 'running'" [class.paused]="timer.state === 'paused'">
      <mat-card-header>
        <mat-card-title>{{ timer.slug }}</mat-card-title>
        <mat-card-subtitle>{{ companyName }}{{ projectName ? ' / ' + projectName : '' }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="timer-display">
          <span class="elapsed" [class]="'timer-state-' + timer.state">
            {{ effectiveMs | duration:'hms' }}
          </span>
          <mat-chip [class]="'timer-state-' + timer.state">{{ timer.state }}</mat-chip>
        </div>
        @if (timer.notes) {
          <p class="notes">{{ timer.notes }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        @if (timer.state === 'stopped') {
          <button mat-icon-button matTooltip="Start" (click)="start.emit(timer)">
            <mat-icon>play_arrow</mat-icon>
          </button>
        }
        @if (timer.state === 'running') {
          <button mat-icon-button matTooltip="Pause" (click)="pause.emit(timer)">
            <mat-icon>pause</mat-icon>
          </button>
          <button mat-icon-button matTooltip="Stop" (click)="stop.emit(timer)">
            <mat-icon>stop</mat-icon>
          </button>
        }
        @if (timer.state === 'paused') {
          <button mat-icon-button matTooltip="Resume" (click)="resume.emit(timer)">
            <mat-icon>play_arrow</mat-icon>
          </button>
          <button mat-icon-button matTooltip="Stop" (click)="stop.emit(timer)">
            <mat-icon>stop</mat-icon>
          </button>
        }
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    mat-card {
      margin-bottom: 12px;
      transition: border-color 0.2s;
    }
    mat-card.running {
      border-left: 4px solid var(--mat-sys-primary);
    }
    mat-card.paused {
      border-left: 4px solid var(--mat-sys-tertiary);
    }
    .timer-display {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 8px 0;
    }
    .elapsed {
      font-size: 1.8rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .notes {
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0 0;
    }
  `,
})
export class TimerCardComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  @Input() timer!: Timer;
  @Input() companyName = '';
  @Input() projectName = '';

  @Output() start = new EventEmitter<Timer>();
  @Output() stop = new EventEmitter<Timer>();
  @Output() pause = new EventEmitter<Timer>();
  @Output() resume = new EventEmitter<Timer>();

  effectiveMs = 0;

  ngOnInit(): void {
    this.updateEffectiveMs();
    if (this.timer.state === 'running') {
      this.startTick();
    }
  }

  ngOnDestroy(): void {
    this.stopTick();
  }

  private startTick(): void {
    this.tickInterval = setInterval(() => {
      this.updateEffectiveMs();
      this.cdr.markForCheck();
    }, 1000);
  }

  private stopTick(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private updateEffectiveMs(): void {
    if (this.timer.state === 'running' && this.timer.started) {
      const baseMs = this.timer.duration_ms ?? 0;
      const elapsed = Date.now() - new Date(this.timer.started).getTime();
      this.effectiveMs = baseMs > 0 ? baseMs : elapsed;
    } else {
      this.effectiveMs = this.timer.duration_ms ?? 0;
    }
  }
}

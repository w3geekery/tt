import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { StopTimerMenuComponent } from './stop-timer-menu';
import { DurationPipe } from '../pipes/duration.pipe';
import { Timer } from '../models';
import { TimerService } from '../services/timer.service';

/**
 * Compact single-line view of a timer card used when the user collapses it
 * on the daily page. Emits back to the parent TimerCardComponent which owns
 * the collapse state + live-duration interval.
 *
 * Layout (left → right):
 *   [slug] [recur?] [C][P][T]   [duration]   [• status dot]   [⋮ menu]   [^ expand]
 */
@Component({
  selector: 'app-timer-card-collapsed',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, StopTimerMenuComponent, DurationPipe],
  template: `
    <div
      class="collapsed-card"
      [class.running]="isRunning()"
      [class.paused]="isPaused()"
      [class.scheduled]="isScheduled()"
      [class.cancelled]="isCancelled()"
      [class.skipped]="isSkipped()"
      (click)="handleStripClick($event)"
    >
      @if (timer().slug) {
        <span class="slug-chip" (click)="copySlug($event)" [title]="'Copy ' + timer().slug">{{ timer().slug }}</span>
      }

      @if (timer().recurring_id) {
        <mat-icon class="recurring-badge" title="Recurring">repeat</mat-icon>
      }
      @if (isSkipped()) {
        <mat-icon class="skipped-badge" title="Skipped occurrence">event_busy</mat-icon>
      }

      <span class="letter-chips">
        <span
          class="letter-chip company-chip"
          [style.background]="timer().company_color || 'var(--mat-sys-primary-container)'"
          [style.color]="timer().company_color ? contrastColor(timer().company_color!) : ''"
          [title]="timer().company_name || ''"
        >{{ getSingleLetter(timer().company_name) }}</span>
        @if (timer().project_name) {
          <span
            class="letter-chip project-chip"
            [style.background]="timer().project_color || 'var(--mat-sys-secondary-container)'"
            [style.color]="timer().project_color ? contrastColor(timer().project_color!) : ''"
            [title]="timer().project_name || ''"
          >{{ getSingleLetter(timer().project_name) }}</span>
        }
        @if (timer().task_name) {
          <span class="letter-chip task-chip" [title]="timer().task_name || ''">{{ getSingleLetter(timer().task_name) }}</span>
        }
      </span>

      <span class="duration" [class.live]="isRunning()" [class.paused-duration]="isPaused()">
        {{ isRunning() || isPaused() ? liveDuration() : (timer().duration_ms | duration) }}
      </span>

      <span
        class="status-glyph"
        [class.glyph-running]="isRunning()"
        [class.glyph-paused]="isPaused()"
        [class.glyph-scheduled]="isScheduled()"
        [class.glyph-stopped]="!isRunning() && !isPaused() && !isScheduled()"
        [title]="statusLabel()"
        [attr.aria-label]="statusLabel()"
      ></span>

      @if (isRunning()) {
        <button mat-icon-button (click)="emitPause($event)" title="Pause">
          <mat-icon>pause</mat-icon>
        </button>
        <app-stop-timer-menu
          [timerId]="timer().id"
          [stopAtValue]="timer().stop_at"
          (onStopNow)="onStop.emit(timer().id)"
          (onScheduleStop)="onScheduleStop.emit({ id: timer().id, ended: $event })"
        />
      }
      @if (isPaused()) {
        <button mat-icon-button (click)="emitResume($event)" title="Resume">
          <mat-icon>play_arrow</mat-icon>
        </button>
        <button mat-icon-button (click)="emitStop($event)" title="Stop">
          <mat-icon>stop</mat-icon>
        </button>
      }

      <button mat-icon-button [matMenuTriggerFor]="menu" (click)="$event.stopPropagation()" title="More">
        <mat-icon>more_vert</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        <button mat-menu-item (click)="onStartEdit.emit()">
          <mat-icon>edit</mat-icon> Edit
        </button>
        <button mat-menu-item (click)="onToggleNotify.emit()">
          <mat-icon>{{ timer().notify_on_switch ? 'notifications_active' : 'notifications_none' }}</mat-icon>
          Notify on activation
        </button>
        @if (timer().recurring_id && !isSkipped()) {
          <button mat-menu-item (click)="skipToday()">
            <mat-icon>event_busy</mat-icon> Skip occurrence
          </button>
        }
        @if (timer().recurring_id && isSkipped()) {
          <button mat-menu-item (click)="unskipToday()">
            <mat-icon>event_available</mat-icon> Unskip occurrence
          </button>
        }
        <button mat-menu-item (click)="onDelete.emit(timer().id)" class="delete-menu-item">
          <mat-icon color="warn">delete</mat-icon> Delete
        </button>
      </mat-menu>

      <button mat-icon-button class="expand-btn" (click)="emitExpand($event)" title="Expand">
        <mat-icon>expand_more</mat-icon>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; margin-bottom: 6px; }
    .collapsed-card {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      min-height: 36px;
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 6px;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
      cursor: pointer;
      user-select: none;
    }
    .collapsed-card:hover { border-color: var(--mat-sys-primary); }
    .collapsed-card.running { border-left: 4px solid #4caf50; }
    .collapsed-card.paused { border-left: 4px solid #ff9800; }
    .collapsed-card.scheduled { border-left: 4px solid #ff9800; opacity: 0.85; }
    .collapsed-card.cancelled { border-left: 4px solid #666; opacity: 0.5; }
    .collapsed-card.skipped { border-left: 4px solid #9c27b0; opacity: 0.55; }
    .skipped-badge { font-size: 14px; width: 14px; height: 14px; color: #9c27b0; flex-shrink: 0; }

    .slug-chip {
      font-family: monospace;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 3px;
      padding: 0 4px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .slug-chip:hover { color: var(--mat-sys-primary); border-color: var(--mat-sys-primary); }

    .recurring-badge {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--mat-sys-tertiary);
      flex-shrink: 0;
    }

    .letter-chips { display: flex; gap: 3px; flex-shrink: 0; }
    .letter-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: help;
    }
    .letter-chip.task-chip {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    .duration {
      font-size: 13px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      margin-left: auto;
      white-space: nowrap;
    }
    .duration.live { color: #4caf50; }
    .duration.paused-duration { color: #ff9800; }

    /* Media-control style status glyph: running = play triangle, stopped = stop square, paused = two bars, scheduled = hollow dot. */
    .status-glyph {
      flex-shrink: 0;
      display: inline-block;
      width: 10px;
      height: 10px;
    }
    .status-glyph.glyph-running {
      width: 0; height: 0;
      border-left: 9px solid #4caf50;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      filter: drop-shadow(0 0 2px rgba(76,175,80,0.5));
    }
    .status-glyph.glyph-stopped {
      background: var(--mat-sys-outline-variant);
      border-radius: 1px;
    }
    .status-glyph.glyph-paused {
      /* two vertical bars using a linear-gradient */
      background: linear-gradient(to right, #ff9800 0 3px, transparent 3px 6px, #ff9800 6px 9px);
      width: 9px;
    }
    .status-glyph.glyph-scheduled {
      border: 2px solid #ff9800;
      border-radius: 50%;
      width: 8px;
      height: 8px;
      opacity: 0.6;
    }

    .expand-btn,
    .collapsed-card .mat-mdc-icon-button {
      --mdc-icon-button-state-layer-size: 28px;
      --mdc-icon-button-icon-size: 16px;
      width: 28px;
      height: 28px;
      padding: 0;
      flex-shrink: 0;
    }
  `],
})
export class TimerCardCollapsedComponent {
  timer = input.required<Timer>();
  liveDuration = input<string>('0m');

  onExpand = output<void>();
  onStop = output<string>();
  onPause = output<string>();
  onResume = output<string>();
  onScheduleStop = output<{ id: string; ended: string }>();
  onDelete = output<string>();
  onToggleNotify = output<void>();
  onStartEdit = output<void>();

  private timerService = inject(TimerService);

  isRunning(): boolean {
    return this.timer().state === 'running';
  }

  isPaused(): boolean {
    return this.timer().state === 'paused';
  }

  isScheduled(): boolean {
    const t = this.timer();
    return !t.started && t.state === 'stopped' && !this.isCancelled();
  }

  isCancelled(): boolean {
    const t = this.timer();
    const notes = t.notes?.toLowerCase() ?? '';
    return t.state === 'stopped' && t.duration_ms === 0
      && (notes.includes('cancelled') || notes.includes('canceled'));
  }

  isSkipped(): boolean {
    return !!this.timer().is_skipped;
  }

  private timerDate(): string {
    const ref = this.timer().started ?? this.timer().created_at;
    return new Date(ref).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  skipToday(): void {
    const recurringId = this.timer().recurring_id;
    if (!recurringId) return;
    this.timerService.skipOccurrence(recurringId, this.timerDate()).subscribe();
  }

  unskipToday(): void {
    const recurringId = this.timer().recurring_id;
    if (!recurringId) return;
    this.timerService.removeSkip(recurringId, this.timerDate()).subscribe();
  }

  statusLabel(): string {
    if (this.isRunning()) return 'Running';
    if (this.isPaused()) return 'Paused';
    if (this.isScheduled()) return 'Scheduled';
    if (this.isCancelled()) return 'Cancelled';
    if (this.isSkipped()) return 'Skipped';
    return 'Stopped';
  }

  /**
   * First character of `name`, uppercased. Returns `?` for null, undefined,
   * empty, or whitespace-only input. See timer-card.spec.ts for test coverage.
   */
  getSingleLetter(name: string | null | undefined): string {
    if (!name) return '?';
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toUpperCase();
  }

  contrastColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000' : '#fff';
  }

  /** Clicks anywhere on the card strip expand — except on action buttons (they stopPropagation). */
  handleStripClick(_event: MouseEvent): void {
    this.onExpand.emit();
  }

  emitExpand(event: MouseEvent): void {
    event.stopPropagation();
    this.onExpand.emit();
  }

  emitPause(event: MouseEvent): void {
    event.stopPropagation();
    this.onPause.emit(this.timer().id);
  }

  emitResume(event: MouseEvent): void {
    event.stopPropagation();
    this.onResume.emit(this.timer().id);
  }

  emitStop(event: MouseEvent): void {
    event.stopPropagation();
    this.onStop.emit(this.timer().id);
  }

  copySlug(event: MouseEvent): void {
    event.stopPropagation();
    const slug = this.timer().slug;
    if (!slug) return;
    navigator.clipboard.writeText(slug).catch(() => {});
  }
}

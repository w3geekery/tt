import { Component, input, output, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TimerService } from '../services/timer.service';

@Component({
  selector: 'app-stop-timer-menu',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <div class="split-button">
      <button class="split-main" (click)="onStopNow.emit()" title="Stop now">
        <mat-icon>stop</mat-icon> Stop
      </button>
      <button class="split-caret" [matMenuTriggerFor]="stopMenu" title="More stop options">
        <mat-icon>arrow_drop_down</mat-icon>
      </button>
    </div>

    <mat-menu #stopMenu="matMenu">
      <button mat-menu-item (click)="openScheduleStop()">
        <mat-icon>schedule</mat-icon>
        <span>Stop at Time...</span>
      </button>
    </mat-menu>

    @if (showScheduleForm()) {
      <div class="schedule-stop-form" (click)="$event.stopPropagation()">
        <div class="schedule-row">
          <mat-form-field class="time-field">
            <mat-label>Stop at</mat-label>
            <input matInput type="time" [(ngModel)]="stopTime" />
          </mat-form-field>
          <button mat-raised-button color="primary" [disabled]="!stopTime" (click)="confirmScheduleStop()">
            Set
          </button>
          <button mat-icon-button (click)="cancelScheduleStop()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        @if (scheduledLabel()) {
          <div class="scheduled-info">
            <mat-icon>alarm_on</mat-icon>
            <span>Stopping at {{ scheduledLabel() }}</span>
            <button mat-icon-button (click)="clearScheduledStop()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; align-items: center; }
    .split-button {
      display: inline-flex;
      border-radius: 20px;
      overflow: hidden;
      height: 40px;
      box-shadow: var(--mat-sys-level1, 0 1px 3px rgba(0,0,0,0.2));
    }
    .split-main, .split-caret {
      border: none;
      cursor: pointer;
      color: var(--app-stop-fg);
      background: var(--app-stop-bg);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--mat-sys-label-large-font, Roboto, sans-serif);
      font-size: var(--mat-sys-label-large-size, 0.875rem);
      font-weight: var(--mat-sys-label-large-weight, 500);
      letter-spacing: var(--mat-sys-label-large-tracking, 0.1px);
      transition: box-shadow 0.2s, filter 0.15s;
    }
    .split-main {
      padding: 0 16px 0 12px;
      gap: 6px;
    }
    .split-main mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .split-caret {
      padding: 0 8px;
      border-left: 1px solid rgba(255,255,255,0.25);
    }
    .split-caret mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .split-main:hover, .split-caret:hover { filter: brightness(1.15); }
    .split-main:active, .split-caret:active { filter: brightness(0.9); }
    .schedule-stop-form {
      margin-top: 12px;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      width: 100%;
    }
    .schedule-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .time-field { flex: 1; }
    .scheduled-info {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font-size: 0.875rem;
    }
    .scheduled-info mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .scheduled-info button { margin-left: auto; }
  `],
})
export class StopTimerMenuComponent {
  timerId = input.required<string>();
  /** Existing stop_at from the timer record (ISO string or null) */
  stopAtValue = input<string | null>(null);
  onStopNow = output<void>();
  onScheduleStop = output<string>(); // emits ISO datetime string for the stop time

  showScheduleForm = signal(false);
  scheduledLabel = signal('');
  stopTime = '';

  private timerService = inject(TimerService);

  ngOnInit() {
    this.syncScheduledLabel();
  }

  ngOnChanges() {
    this.syncScheduledLabel();
  }

  openScheduleStop() {
    this.showScheduleForm.set(true);
  }

  cancelScheduleStop() {
    this.showScheduleForm.set(false);
    this.stopTime = '';
  }

  confirmScheduleStop() {
    if (!this.stopTime) return;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    // Compute the current Pacific Time UTC offset (handles PST vs PDT)
    const ptOffset = this.getPacificOffset(new Date());
    const stopAtIso = `${today}T${this.stopTime}${ptOffset}`;
    const stopAtDate = new Date(stopAtIso);
    const now = new Date();

    if (stopAtDate.getTime() <= now.getTime()) {
      // Time is in the past — stop immediately with that end time
      this.onScheduleStop.emit(stopAtIso);
      this.showScheduleForm.set(false);
      this.stopTime = '';
      return;
    }

    // Persist stop_at to the server via PATCH
    this.timerService.update(this.timerId(), { stop_at: stopAtIso } as any).subscribe(() => {
      this.scheduledLabel.set(
        stopAtDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
      );
      this.stopTime = '';
    });
  }

  clearScheduledStop() {
    this.timerService.update(this.timerId(), { stop_at: null } as any).subscribe(() => {
      this.scheduledLabel.set('');
    });
  }

  /** Returns the UTC offset string for Pacific Time (e.g., "-07:00" for PDT, "-08:00" for PST) */
  private getPacificOffset(date: Date): string {
    const utc = date.getTime() + date.getTimezoneOffset() * 60_000;
    const pt = new Date(utc).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const ptDate = new Date(pt);
    const diffMinutes = Math.round((ptDate.getTime() - utc) / 60_000);
    const sign = diffMinutes >= 0 ? '+' : '-';
    const absMin = Math.abs(diffMinutes);
    const h = String(Math.floor(absMin / 60)).padStart(2, '0');
    const m = String(absMin % 60).padStart(2, '0');
    return `${sign}${h}:${m}`;
  }

  private syncScheduledLabel() {
    const stopAt = this.stopAtValue();
    if (stopAt) {
      this.scheduledLabel.set(
        new Date(stopAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
      );
    } else {
      this.scheduledLabel.set('');
    }
  }
}

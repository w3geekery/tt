import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer, TimerSegment } from '../../models/types';

@Component({
  selector: 'app-timer-card',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatTooltipModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    DurationPipe,
  ],
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

        <!-- Time range -->
        @if (timer.started) {
          <div class="time-range">
            @if (editingTimes) {
              <input type="time" [value]="startTimeValue" (change)="onStartTimeChange($event)" step="60">
              <span> — </span>
              @if (timer.ended) {
                <input type="time" [value]="endTimeValue" (change)="onEndTimeChange($event)" step="60">
              } @else {
                <span>now</span>
              }
              <button mat-icon-button matTooltip="Done" (click)="editingTimes = false">
                <mat-icon>check</mat-icon>
              </button>
            } @else {
              <span class="clickable-time" (click)="editingTimes = true">
                {{ timer.started | date:'shortTime' }}
                —
                {{ timer.ended ? (timer.ended | date:'shortTime') : 'now' }}
              </span>
            }
          </div>
        }

        <!-- Notes -->
        @if (editingNotes) {
          <mat-form-field appearance="outline" class="notes-field">
            <mat-label>Notes</mat-label>
            <textarea matInput [(ngModel)]="notesValue" rows="2" (keydown.escape)="cancelNotesEdit()" (keydown.enter)="saveNotes()"></textarea>
          </mat-form-field>
          <div class="notes-actions">
            <button mat-button (click)="saveNotes()">Save</button>
            <button mat-button (click)="cancelNotesEdit()">Cancel</button>
          </div>
        } @else {
          <p class="notes clickable" (click)="startNotesEdit()">
            {{ timer.notes || 'Add notes...' }}
          </p>
        }

        <!-- Segments (expandable) -->
        @if (segments.length > 1) {
          <div class="segments-toggle">
            <button mat-button (click)="showSegments = !showSegments">
              <mat-icon>{{ showSegments ? 'expand_less' : 'expand_more' }}</mat-icon>
              {{ segments.length }} segments
            </button>
          </div>
          @if (showSegments) {
            <div class="segments-list">
              @for (seg of segments; track seg.id; let i = $index) {
                @if (i > 0) {
                  <div class="segment-break">
                    <mat-icon>coffee</mat-icon>
                    {{ getBreakMs(i) | duration:'hm' }} break
                  </div>
                }
                <div class="segment">
                  <span class="seg-num">#{{ i + 1 }}</span>
                  <span>{{ seg.started | date:'shortTime' }} — {{ seg.ended ? (seg.ended | date:'shortTime') : 'now' }}</span>
                  <span class="seg-dur">{{ seg.duration_ms | duration:'hm' }}</span>
                </div>
              }
            </div>
          }
        }
      </mat-card-content>
      <mat-card-actions align="end">
        @if (timer.state === 'stopped') {
          <button mat-icon-button matTooltip="Start" (click)="start.emit(timer)">
            <mat-icon>play_arrow</mat-icon>
          </button>
          <button mat-icon-button matTooltip="Delete" (click)="deleteTimer.emit(timer)">
            <mat-icon>delete_outline</mat-icon>
          </button>
        }
        @if (timer.state === 'running') {
          <button mat-icon-button matTooltip="Pause" (click)="pause.emit(timer)">
            <mat-icon>pause</mat-icon>
          </button>
          <button mat-icon-button [matMenuTriggerFor]="stopMenu" matTooltip="Stop">
            <mat-icon>stop</mat-icon>
          </button>
          <mat-menu #stopMenu="matMenu">
            <button mat-menu-item (click)="stop.emit(timer)">
              <mat-icon>stop</mat-icon> Stop now
            </button>
            <button mat-menu-item (click)="showStopAt = true">
              <mat-icon>schedule</mat-icon> Stop at time...
            </button>
          </mat-menu>
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

      <!-- Stop-at-time popover -->
      @if (showStopAt) {
        <div class="stop-at-form">
          <input type="time" [(ngModel)]="stopAtValue" step="60">
          <button mat-raised-button color="primary" (click)="setStopAt()">Set</button>
          <button mat-button (click)="showStopAt = false">Cancel</button>
        </div>
      }
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
    .time-range {
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .time-range input {
      background: transparent;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 4px;
      padding: 2px 4px;
      color: inherit;
      font-size: 0.85rem;
    }
    .clickable-time {
      cursor: pointer;
      &:hover { text-decoration: underline; }
    }
    .notes {
      color: var(--mat-sys-on-surface-variant);
      margin: 4px 0 0;
    }
    .notes.clickable {
      cursor: pointer;
      &:hover { text-decoration: underline; }
    }
    .notes-field { width: 100%; margin-top: 8px; }
    .notes-actions { display: flex; gap: 4px; justify-content: flex-end; }
    .segments-toggle { margin-top: 4px; }
    .segments-list {
      margin: 4px 0 0 8px;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .segment {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 2px 0;
    }
    .seg-num {
      font-weight: 500;
      min-width: 24px;
    }
    .seg-dur {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
    }
    .segment-break {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 0 2px 24px;
      font-style: italic;
      opacity: 0.7;
    }
    .segment-break mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .stop-at-form {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .stop-at-form input {
      background: transparent;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 4px;
      padding: 6px 8px;
      color: inherit;
    }
  `,
})
export class TimerCardComponent implements OnInit, OnDestroy, OnChanges {
  private cdr = inject(ChangeDetectorRef);
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  @Input() timer!: Timer;
  @Input() companyName = '';
  @Input() projectName = '';
  @Input() segments: TimerSegment[] = [];

  @Output() start = new EventEmitter<Timer>();
  @Output() stop = new EventEmitter<Timer>();
  @Output() pause = new EventEmitter<Timer>();
  @Output() resume = new EventEmitter<Timer>();
  @Output() deleteTimer = new EventEmitter<Timer>();
  @Output() updateTimer = new EventEmitter<{ id: string; changes: Record<string, unknown> }>();

  effectiveMs = 0;
  editingTimes = false;
  editingNotes = false;
  notesValue = '';
  showSegments = false;
  showStopAt = false;
  stopAtValue = '';

  get startTimeValue(): string {
    return this.timer.started ? new Date(this.timer.started).toTimeString().slice(0, 5) : '';
  }

  get endTimeValue(): string {
    return this.timer.ended ? new Date(this.timer.ended).toTimeString().slice(0, 5) : '';
  }

  ngOnInit(): void {
    this.updateEffectiveMs();
    if (this.timer.state === 'running') this.startTick();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['timer']) {
      this.updateEffectiveMs();
      this.stopTick();
      if (this.timer.state === 'running') this.startTick();
    }
  }

  ngOnDestroy(): void {
    this.stopTick();
  }

  getBreakMs(segIndex: number): number {
    const prev = this.segments[segIndex - 1];
    const curr = this.segments[segIndex];
    if (!prev?.ended || !curr?.started) return 0;
    return new Date(curr.started).getTime() - new Date(prev.ended).getTime();
  }

  startNotesEdit(): void {
    this.notesValue = this.timer.notes ?? '';
    this.editingNotes = true;
  }

  cancelNotesEdit(): void {
    this.editingNotes = false;
  }

  saveNotes(): void {
    this.editingNotes = false;
    this.updateTimer.emit({ id: this.timer.id, changes: { notes: this.notesValue } });
  }

  onStartTimeChange(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    if (!val || !this.timer.started) return;
    const d = new Date(this.timer.started);
    const [h, m] = val.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    this.updateTimer.emit({ id: this.timer.id, changes: { started: d.toISOString() } });
  }

  onEndTimeChange(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    if (!val || !this.timer.ended) return;
    const d = new Date(this.timer.ended);
    const [h, m] = val.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    this.updateTimer.emit({ id: this.timer.id, changes: { ended: d.toISOString() } });
  }

  setStopAt(): void {
    if (!this.stopAtValue) return;
    const now = new Date();
    const [h, m] = this.stopAtValue.split(':').map(Number);
    now.setHours(h, m, 0, 0);
    if (now.getTime() < Date.now()) now.setDate(now.getDate() + 1);
    this.updateTimer.emit({ id: this.timer.id, changes: { stop_at: now.toISOString() } });
    this.showStopAt = false;
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

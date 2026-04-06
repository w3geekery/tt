import { Component, input, output, signal, OnInit, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { DurationPipe } from '../pipes/duration.pipe';
import { StopTimerMenuComponent } from './stop-timer-menu';
import { MarkdownNoteEditorComponent } from './markdown-note-editor.component';
import { SegmentListComponent } from './segment-list.component';
import { Timer, Project, Task, ExternalTaskLink } from '../models';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-timer-card',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatMenuModule,
    DurationPipe,
    StopTimerMenuComponent,
    MarkdownNoteEditorComponent,
    SegmentListComponent,
  ],
  template: `
    <mat-card [class.running]="isRunning()" [class.paused]="isPaused()" [class.scheduled]="isScheduled()" [class.cancelled]="isCancelled()" [class.compact]="compact()" [class.expanded]="expandable() && !compact()" (click)="handleCardClick($event)">
      <div class="card-top-row">
        <div class="timer-chips">
          @if (timer().recurring_id) {
            <mat-icon class="recurring-badge" title="Recurring">repeat</mat-icon>
          }
          @if (timer().company_name) {
            <mat-chip-set>
              <mat-chip [style.--mat-chip-elevated-container-color]="timer().company_color || 'var(--mat-sys-primary-container)'"
                        [style.--mat-chip-label-text-color]="timer().company_color ? contrastColor(timer().company_color!) : ''">
                {{ timer().company_name }}
              </mat-chip>
              @if (timer().project_name) {
                <mat-chip [style.--mat-chip-elevated-container-color]="timer().project_color || ''"
                          [style.--mat-chip-label-text-color]="timer().project_color ? contrastColor(timer().project_color!) : ''">
                  {{ timer().project_name }}
                </mat-chip>
              }
              @if (timer().task_name) {
                <mat-chip>{{ timer().task_name }}</mat-chip>
              }
              <!-- External task links shown at page level (weekly ZB task links), not per-card -->
            </mat-chip-set>
          }
        </div>
        <button mat-icon-button class="favorite-star" [class.is-favorite]="isFavorite()" (click)="toggleFavorite($event)" [title]="isFavorite() ? 'Remove from favorites' : 'Add to favorites'">
          <mat-icon>{{ isFavorite() ? 'star' : 'star_border' }}</mat-icon>
        </button>
        @if (isScheduled()) {
          <div class="timer-duration scheduled-label">
            <mat-icon class="scheduled-icon">schedule</mat-icon>
            @if (timer().start_at) {
              @if (editingScheduledTime()) {
                <input type="time" class="inline-time-input scheduled-time-input" [value]="editScheduledValue"
                  (change)="editScheduledValue = $any($event.target).value"
                  (blur)="saveScheduledTime()" (keydown.enter)="$any($event.target).blur()"
                  (keydown.escape)="editingScheduledTime.set(false)" (click)="$event.stopPropagation()" />
              } @else {
                <span class="editable-time" (click)="startEditScheduledTime(); $event.stopPropagation()">{{ formatTime(timer().start_at) }}</span>
              }
            } @else {
              <span>Pending</span>
            }
          </div>
        } @else {
          <div class="timer-duration" [class.live]="isRunning()" [class.paused-duration]="isPaused()">
            {{ isRunning() || isPaused() ? liveDuration() : (timer().duration_ms | duration) }}
          </div>
        }
      </div>
      <mat-card-content (click)="stopIfExpanded($event)">
        @if (isScheduled()) {
          <div class="timer-times">
            <span class="time-range">
              {{ timer().recurring_id ? formatTime(timer().start_at) || formatHHMM(timer().recurring_start_time) : 'Scheduled' }}{{ !timer().recurring_id && timer().start_at ? ' for ' + formatTime(timer().start_at) : '' }}
              <span> — </span>
              @if (editingEndTime()) {
                <input type="time" class="inline-time-input" [value]="editEndValue"
                  (change)="editEndValue = $any($event.target).value"
                  (blur)="saveEndTime()" (keydown.enter)="$any($event.target).blur()"
                  (keydown.escape)="editingEndTime.set(false)" (click)="$event.stopPropagation()" />
              } @else if (timer().ended) {
                <span class="editable-time" (click)="startEditEndTime(); $event.stopPropagation()">{{ formatTime(timer().ended!) }}</span>
              } @else {
                <span class="set-end-link" (click)="startEditScheduledEndTime(); $event.stopPropagation()">+ end time</span>
              }
            </span>
          </div>
        } @else {
        <div class="timer-times">
          <span class="time-range">
            @if (editingStartTime()) {
              <input type="time" class="inline-time-input" [value]="editStartValue"
                (change)="editStartValue = $any($event.target).value"
                (blur)="saveStartTime()" (keydown.enter)="$any($event.target).blur()"
                (keydown.escape)="editingStartTime.set(false)" (click)="$event.stopPropagation()" />
            } @else {
              <span class="editable-time" (click)="startEditStartTime(); $event.stopPropagation()">{{ formatTime(timer().started) }}</span>
            }
            <span> — </span>
            @if (editingEndTime()) {
              <input type="time" class="inline-time-input" [value]="editEndValue"
                (change)="editEndValue = $any($event.target).value"
                (blur)="saveEndTime()" (keydown.enter)="$any($event.target).blur()"
                (keydown.escape)="editingEndTime.set(false)" (click)="$event.stopPropagation()" />
            } @else if (timer().ended) {
              <span class="editable-time" (click)="startEditEndTime(); $event.stopPropagation()">{{ formatTime(timer().ended!) }}</span>
            } @else {
              @if (isPaused()) {
                <span class="paused-label">paused</span>
              } @else {
                <span class="editable-time running-end" (click)="startEditRunningEndTime(); $event.stopPropagation()">running</span>
              }
            }
          </span>
          <span class="time-duration" [class.live]="isRunning()" [class.paused-duration]="isPaused()">
            {{ isRunning() || isPaused() ? liveDuration() : (timer().duration_ms | duration) }}
          </span>
        </div>
        }
        @if (!compact() && hasMultipleSegments()) {
          <div class="segments-toggle" (click)="showSegments.set(!showSegments()); $event.stopPropagation()">
            <mat-icon class="segments-icon">{{ showSegments() ? 'expand_less' : 'expand_more' }}</mat-icon>
            <span>{{ timer().segments!.length }} segments</span>
          </div>
          @if (showSegments()) {
            <app-segment-list
              [segments]="timer().segments!"
              (onEditNotes)="onSegmentNotesEdit($event)"
            />
          }
        }
        @if (!compact()) {
          @if (editing()) {
            <div class="edit-fields">
              <mat-form-field class="edit-select">
                <mat-label>Project</mat-label>
                <mat-select [(ngModel)]="editProjectId" (selectionChange)="onProjectChange()">
                  <mat-option [value]="null">None</mat-option>
                  @for (p of projects(); track p.id) {
                    <mat-option [value]="p.id">{{ p.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field class="edit-select">
                <mat-label>Task</mat-label>
                <mat-select [(ngModel)]="editTaskId">
                  <mat-option [value]="null">None</mat-option>
                  @for (t of tasks(); track t.id) {
                    <mat-option [value]="t.id">{{ t.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <app-markdown-note-editor
              [notes]="editNotes"
              height="180px"
              (notesChanged)="editNotes = $event"
            />
            <mat-checkbox [(ngModel)]="editNotifyOnSwitch" class="notify-switch-check">
              <mat-icon class="notify-switch-icon">notifications</mat-icon> Notify on switch
            </mat-checkbox>
          } @else {
            <app-markdown-note-editor
              [notes]="timer().notes ?? ''"
              (notesChanged)="saveNotesInline($event)"
            />
          }
        }
      </mat-card-content>
      @if (!compact()) {
      <mat-card-actions (click)="stopIfExpanded($event)">
        @if (editing()) {
          @if (!timer().recurring_id) {
            <button mat-button (click)="makeRecurring()" class="make-recurring-btn">
              <mat-icon>repeat</mat-icon> Make Recurring
            </button>
          }
          <span class="edit-spacer"></span>
          <button mat-button (click)="cancelEdit()">Cancel</button>
          <button mat-button color="primary" (click)="saveEdit()">Save</button>
        } @else {
          <div class="card-bottom-row">
            <div class="bottom-left">
              @if (timer().slug) {
                <span class="slug-chip" (click)="copySlug($event)" [title]="'Copy ' + timer().slug">{{ timer().slug }}</span>
                @if (slugCopied()) { <span class="slug-copied">Copied!</span> }
              }
            </div>
            <div class="bottom-right">
              @if (isRunning()) {
                <button mat-icon-button (click)="onPause.emit(timer().id)" title="Pause">
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
                <button mat-icon-button (click)="onResume.emit(timer().id)" title="Resume">
                  <mat-icon>play_arrow</mat-icon>
                </button>
                <button mat-icon-button (click)="onStop.emit(timer().id)" title="Stop">
                  <mat-icon>stop</mat-icon>
                </button>
              }
              <button mat-icon-button [matMenuTriggerFor]="timerMenu">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #timerMenu="matMenu">
                <button mat-menu-item (click)="startEdit()">
                  <mat-icon>edit</mat-icon> Edit
                </button>
                <button mat-menu-item (click)="toggleNotifyOnSwitch()">
                  <mat-icon>{{ timer().notify_on_switch ? 'notifications_active' : 'notifications_none' }}</mat-icon>
                  Notify on activation
                  @if (timer().notify_on_switch) {
                    <mat-icon class="notify-check">check</mat-icon>
                  }
                </button>
                <button mat-menu-item (click)="onDelete.emit(timer().id)" class="delete-menu-item">
                  <mat-icon color="warn">delete</mat-icon> Delete
                </button>
              </mat-menu>
            </div>
          </div>
        }
      </mat-card-actions>
      }
    </mat-card>
  `,
  styles: [`
    :host { display: block; margin-bottom: 12px; }
    mat-card { transition: box-shadow 0.15s ease; }
    mat-card.running { border-left: 4px solid #4caf50; }
    mat-card.paused { border-left: 4px solid #ff9800; }
    mat-card.scheduled { border-left: 4px solid #ff9800; opacity: 0.85; }
    mat-card.cancelled { border-left: 4px solid #666; opacity: 0.5; }
    .scheduled-label { display: flex; align-items: center; gap: 4px; color: #ff9800; font-size: 0.9rem; }
    .scheduled-icon { font-size: 18px; width: 18px; height: 18px; }
    mat-card.expanded { outline: 2px solid var(--mat-sys-primary); box-shadow: var(--mat-sys-level3); }
    mat-card.expanded .card-top-row { flex-direction: column; align-items: flex-start; gap: 4px; }
    mat-card.expanded .timer-duration { display: none; }
    mat-card.expanded .editable-time { padding-left: 8px; }
    .card-top-row { display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 0; }
    .timer-chips { display: flex; gap: 4px; flex: 1; min-width: 0; align-items: center; }
    .recurring-badge { font-size: 18px; width: 18px; height: 18px; color: var(--mat-sys-tertiary); }
    .favorite-star { --mdc-icon-button-state-layer-size: 28px; --mdc-icon-button-icon-size: 18px; width: 28px; height: 28px; padding: 0; flex-shrink: 0; }
    .favorite-star mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--mat-sys-on-surface-variant); opacity: 0.4; }
    .favorite-star:hover mat-icon { opacity: 0.8; }
    .favorite-star.is-favorite mat-icon { color: #ffc107; opacity: 1; }
    .timer-duration { display: none; }
    .timer-duration.live { color: #4caf50; }
    .timer-times { font-size: 0.875rem; color: var(--mat-sys-on-surface-variant); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
    .time-range { display: flex; align-items: center; }
    .time-duration { font-size: 0.875rem; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .time-duration.live { color: #4caf50; }
    .time-duration.paused-duration { color: #ff9800; }
    .editable-time { cursor: pointer; border-bottom: 1px dashed var(--mat-sys-outline-variant); padding: 0 2px; border-radius: 2px; }
    .editable-time:hover { background: var(--mat-sys-surface-container-highest); border-bottom-color: var(--mat-sys-primary); }
    .inline-time-input { font-size: 0.875rem; border: 1px solid var(--mat-sys-primary); border-radius: 4px; padding: 2px 4px; background: var(--mat-sys-surface); color: var(--mat-sys-on-surface); outline: none; width: auto; }
    .running-end { color: #4caf50; border-bottom-color: #4caf50; }
    .paused-label { color: #ff9800; font-style: italic; }
    .paused-duration { color: #ff9800; }
    .set-end-link { cursor: pointer; color: var(--mat-sys-primary); font-size: 0.8rem; opacity: 0.7; }
    .set-end-link:hover { opacity: 1; }
    .scheduled-time-input { font-size: 1.1rem; padding: 4px 6px; }
    .edit-fields { display: flex; gap: 8px; margin-top: 8px; }
    .edit-select { flex: 1; }
    .make-recurring-btn { font-size: 0.75rem; }
    .make-recurring-btn mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 2px; }
    .notify-switch-check { margin-top: 4px; font-size: 0.85rem; }
    .notify-switch-icon { font-size: 16px; width: 16px; height: 16px; vertical-align: middle; margin-right: 2px; }
    .edit-spacer { flex: 1; }
    .card-bottom-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .bottom-left { display: flex; align-items: center; gap: 6px; }
    .bottom-right { display: flex; align-items: center; }
    .slug-chip { font-family: monospace; font-size: 12px; color: var(--mat-sys-on-surface-variant); background: var(--mat-sys-surface-container); border: 1px solid var(--mat-sys-outline-variant); border-radius: 4px; padding: 1px 6px; cursor: pointer; user-select: none; }
    .bottom-right .mat-mdc-icon-button { --mdc-icon-button-state-layer-size: 28px; --mdc-icon-button-icon-size: 12px; width: 28px; height: 28px; padding: 0; }
    .bottom-right .mat-mdc-icon-button mat-icon { font-size: 12px; width: 12px; height: 12px; }
    .slug-chip:hover { background: var(--mat-sys-surface-container-highest); border-color: var(--mat-sys-primary); color: var(--mat-sys-primary); }
    .slug-copied { font-size: 0.65rem; color: var(--mat-sys-primary); }
    .notify-check { font-size: 16px; width: 16px; height: 16px; color: #4caf50; margin-left: auto; }
    .segments-toggle { display: flex; align-items: center; gap: 2px; font-size: 0.75rem; color: var(--mat-sys-primary); cursor: pointer; padding: 2px 0; user-select: none; }
    .segments-toggle:hover { text-decoration: underline; }
    .segments-icon { font-size: 16px; width: 16px; height: 16px; }
    .external-task-chip { cursor: pointer; border: 1px solid; }
    .external-task-chip mat-icon { color: inherit; }
    .external-link-icon { font-size: 14px; width: 14px; height: 14px; margin-right: 2px; }
    .external-caret-icon { font-size: 16px; width: 16px; height: 16px; margin-left: -2px; margin-right: -4px; }
    .external-task-copied { font-size: 0.65rem; color: var(--mat-sys-primary); white-space: nowrap; }
    /* Compact mode */
    mat-card.compact { margin-bottom: 0; }
    mat-card.compact .card-top-row { padding: 8px 10px 0; flex-direction: column; align-items: flex-start; gap: 2px; }
    mat-card.compact .timer-chips { overflow: hidden; width: 100%; }
    mat-card.compact .timer-chips mat-chip-set { --mat-chip-container-height: 22px; font-size: 0.7rem; flex-wrap: nowrap; }
    mat-card.compact .timer-duration { display: none; }
    mat-card.compact .timer-times { font-size: 0.7rem; margin-bottom: 4px; }
    :host:has(mat-card.compact) { margin-bottom: 6px; }
  `],
})
export class TimerCardComponent implements OnInit, OnDestroy {
  compact = input(false);
  expandable = input(false);
  timer = input.required<Timer>();
  onStop = output<string>();
  onPause = output<string>();
  onResume = output<string>();
  onScheduleStop = output<{ id: string; ended: string }>();
  onDelete = output<string>();
  onUpdate = output<{ id: string; notes: string; project_id?: string | null; task_id?: string | null; notify_on_switch?: boolean }>();
  onTimeUpdate = output<{ id: string; started?: string; ended?: string; start_at?: string }>();
  onMakeRecurring = output<{ company_id: string; project_id: string | null; task_id: string | null; start_time: string }>();
  onToggleExpand = output<void>();
  onToggleFavorite = output<{ company_id: string; project_id: string | null; task_id: string | null }>();
  isFavorite = input(false);

  slugCopied = signal(false);
  externalTaskCopied = signal(false);
  editing = signal(false);
  editNotes = '';
  editProjectId: string | null = null;
  editTaskId: string | null = null;
  editNotifyOnSwitch = false;
  projects = signal<Project[]>([]);
  tasks = signal<Task[]>([]);
  liveDuration = signal('0m');
  showSegments = signal(false);
  editingStartTime = signal(false);
  editingEndTime = signal(false);
  editingScheduledTime = signal(false);
  editStartValue = '';
  editEndValue = '';
  editScheduledValue = '';

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private platformId = inject(PLATFORM_ID);
  private api = inject(ApiService);

  isRunning() {
    return this.timer().state === 'running';
  }

  isPaused() {
    return this.timer().state === 'paused';
  }

  isScheduled() {
    return !this.timer().started && this.timer().state === 'stopped' && !this.isCancelled();
  }

  isCancelled() {
    return this.timer().state === 'stopped' && this.timer().duration_ms === 0
      && (this.timer().notes?.toLowerCase().includes('cancelled') || this.timer().notes?.toLowerCase().includes('canceled'));
  }

  hasMultipleSegments(): boolean {
    return (this.timer().segments?.length ?? 0) > 1;
  }

  onSegmentNotesEdit(event: { segmentId: string; notes: string }) {
    this.api.patchSegmentNotes(this.timer().id, event.segmentId, event.notes).subscribe();
  }

  ngOnInit() {
    if ((this.isRunning() || this.isPaused()) && isPlatformBrowser(this.platformId)) {
      this.updateLiveDuration();
      if (this.isRunning()) {
        this.intervalId = setInterval(() => this.updateLiveDuration(), 1000);
      }
    }
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private updateLiveDuration() {
    const t = this.timer();
    if (!t.started) return;
    const pipe = new DurationPipe();

    if (t.state === 'paused') {
      // Paused: all segments closed, duration_ms is accurate
      this.liveDuration.set(pipe.transform(Number(t.duration_ms ?? 0)));
      return;
    }

    // Running: duration_ms holds completed segment time; add current segment elapsed
    const completedMs = Number(t.duration_ms ?? 0);
    const segments = t.segments;
    if (segments && segments.length > 0) {
      const openSegment = segments.find(s => !s.ended);
      const currentElapsed = openSegment ? Date.now() - new Date(openSegment.started).getTime() : 0;
      this.liveDuration.set(pipe.transform(completedMs + currentElapsed));
    } else {
      // Fallback: no segments loaded, use started time
      this.liveDuration.set(pipe.transform(Date.now() - new Date(t.started!).getTime()));
    }
  }

  formatTime(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  formatHHMM(time: string | null | undefined): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  contrastColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000' : '#fff';
  }

  startEditStartTime() {
    if (!this.timer().started) return;
    this.editStartValue = this.isoToTimeInput(this.timer().started!);
    this.editingStartTime.set(true);
  }

  startEditEndTime() {
    if (!this.timer().ended) return;
    this.editEndValue = this.isoToTimeInput(this.timer().ended!);
    this.editingEndTime.set(true);
  }

  startEditScheduledTime() {
    if (!this.timer().start_at) return;
    this.editScheduledValue = this.isoToTimeInput(this.timer().start_at!);
    this.editingScheduledTime.set(true);
  }

  saveScheduledTime() {
    if (!this.editScheduledValue || !this.timer().start_at) { this.editingScheduledTime.set(false); return; }
    const original = this.isoToTimeInput(this.timer().start_at!);
    if (this.editScheduledValue === original) { this.editingScheduledTime.set(false); return; }
    const newIso = this.applyTimeToIso(this.timer().start_at!, this.editScheduledValue);
    this.onTimeUpdate.emit({ id: this.timer().id, start_at: newIso });
    this.editingScheduledTime.set(false);
  }

  saveStartTime() {
    if (!this.editStartValue || !this.timer().started) { this.editingStartTime.set(false); return; }
    const original = this.isoToTimeInput(this.timer().started!);
    if (this.editStartValue === original) { this.editingStartTime.set(false); return; }
    const newIso = this.applyTimeToIso(this.timer().started!, this.editStartValue);
    this.onTimeUpdate.emit({ id: this.timer().id, started: newIso });
    this.editingStartTime.set(false);
  }

  startEditRunningEndTime() {
    // Default to current time for a running timer
    const now = new Date();
    this.editEndValue = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    this.editingEndTime.set(true);
  }

  startEditScheduledEndTime() {
    // Default to 1 hour after scheduled start
    if (this.timer().start_at) {
      const start = new Date(this.timer().start_at!);
      const end = new Date(start.getTime() + 3600000);
      this.editEndValue = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    } else {
      this.editEndValue = '';
    }
    this.editingEndTime.set(true);
  }

  saveEndTime() {
    if (!this.editEndValue) { this.editingEndTime.set(false); return; }
    // Use ended, started, or start_at as the reference date
    const referenceIso = this.timer().ended || this.timer().started || this.timer().start_at;
    if (!referenceIso) { this.editingEndTime.set(false); return; }
    if (this.timer().ended) {
      const original = this.isoToTimeInput(this.timer().ended!);
      if (this.editEndValue === original) { this.editingEndTime.set(false); return; }
    }
    const newIso = this.applyTimeToIso(referenceIso, this.editEndValue);
    this.onTimeUpdate.emit({ id: this.timer().id, ended: newIso });
    this.editingEndTime.set(false);
  }

  private isoToTimeInput(iso: string): string {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private applyTimeToIso(iso: string, timeValue: string): string {
    const d = new Date(iso);
    const [h, m] = timeValue.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  startEdit() {
    this.editNotes = this.timer().notes ?? '';
    this.editProjectId = this.timer().project_id;
    this.editTaskId = this.timer().task_id;
    this.editNotifyOnSwitch = this.timer().notify_on_switch ?? false;
    this.editing.set(true);
    // Load projects for this company
    this.api.getProjects(this.timer().company_id).subscribe(p => {
      this.projects.set(p);
      // Load tasks for current project
      if (this.editProjectId) {
        this.api.getTasks(this.editProjectId).subscribe(t => this.tasks.set(t));
      }
    });
  }

  onProjectChange() {
    this.editTaskId = null;
    this.tasks.set([]);
    if (this.editProjectId) {
      this.api.getTasks(this.editProjectId).subscribe(t => this.tasks.set(t));
    }
  }

  cancelEdit() {
    this.editing.set(false);
  }

  saveEdit() {
    this.onUpdate.emit({
      id: this.timer().id,
      notes: this.editNotes,
      project_id: this.editProjectId,
      task_id: this.editTaskId,
      notify_on_switch: this.editNotifyOnSwitch,
    });
    this.editing.set(false);
  }

  saveNotesInline(notes: string) {
    this.onUpdate.emit({
      id: this.timer().id,
      notes,
      project_id: this.timer().project_id,
      task_id: this.timer().task_id,
    });
  }

  handleCardClick(event: MouseEvent) {
    if (!this.expandable()) return;
    this.onToggleExpand.emit();
  }

  copySlug(event: MouseEvent) {
    event.stopPropagation();
    const slug = this.timer().slug;
    if (!slug) return;
    navigator.clipboard.writeText(slug).then(() => {
      this.slugCopied.set(true);
      setTimeout(() => this.slugCopied.set(false), 1500);
    });
  }

  stopIfExpanded(event: MouseEvent) {
    if (this.expandable() && !this.compact()) {
      event.stopPropagation();
    }
  }

  toggleNotifyOnSwitch() {
    const toggled = !(this.timer().notify_on_switch ?? false);
    this.onUpdate.emit({
      id: this.timer().id,
      notes: this.timer().notes ?? '',
      project_id: this.timer().project_id,
      task_id: this.timer().task_id,
      notify_on_switch: toggled,
    });
  }

  getExternalTaskAccent(provider: string): string {
    const accents: Record<string, string> = {
      zerobias: '#66bb6a',
      jira: '#42a5f5',
      github: '#9e9e9e',
    };
    return accents[provider] ?? '#9e9e9e';
  }

  private externalTaskUrl(link: ExternalTaskLink): string {
    if (link.task.url) return link.task.url;
    if (link.provider === 'zerobias') return `https://app.zerobias.com/resource/${link.task.id}`;
    return '';
  }

  copyExternalTaskLink(link: ExternalTaskLink): void {
    const text = this.externalTaskUrl(link) || link.task.code;
    navigator.clipboard.writeText(text).then(() => {
      this.externalTaskCopied.set(true);
      setTimeout(() => this.externalTaskCopied.set(false), 1500);
    });
  }

  openExternalTask(link: ExternalTaskLink): void {
    const url = this.externalTaskUrl(link);
    if (url) window.open(url, '_blank');
  }

  toggleFavorite(event: MouseEvent) {
    event.stopPropagation();
    this.onToggleFavorite.emit({
      company_id: this.timer().company_id,
      project_id: this.timer().project_id,
      task_id: this.timer().task_id,
    });
  }

  makeRecurring() {
    // Extract start time from the timer's started or start_at
    const iso = this.timer().started || this.timer().start_at;
    const startTime = iso ? this.isoToTimeInput(iso) : '09:00';
    this.onMakeRecurring.emit({
      company_id: this.timer().company_id,
      project_id: this.timer().project_id,
      task_id: this.timer().task_id,
      start_time: startTime,
    });
    this.editing.set(false);
  }
}

import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DurationPipe } from '../pipes/duration.pipe';
import { MarkdownNoteEditorComponent } from './markdown-note-editor.component';
import { TimerSegment } from '../models';

export type SegmentTimeUpdate = {
  segmentId: string;
  started?: string;
  ended?: string;
};

export type SegmentNotesUpdate = {
  segmentId: string;
  notes: string;
};

export type SegmentBreakNoteUpdate = {
  segmentId: string;
  break_note: string;
};

@Component({
  selector: 'app-segment-list',
  standalone: true,
  imports: [FormsModule, MatIconModule, DurationPipe, MarkdownNoteEditorComponent],
  template: `
    <div class="segment-list">
      @for (seg of segments(); track seg.id; let i = $index) {
        <div class="segment-block">
          <div class="segment-row" [class.open]="!seg.ended">
            <span class="segment-index">#{{ i + 1 }}</span>
            <span class="segment-times">
              @if (editingStartId() === seg.id) {
                <input type="time" class="inline-time-input" [(ngModel)]="editStartValue"
                  (blur)="saveStart(seg)" (keydown.enter)="$any($event.target).blur()"
                  (keydown.escape)="cancelTimeEdit()" (click)="$event.stopPropagation()" />
              } @else {
                <span class="editable-time" (click)="startEditStart(seg); $event.stopPropagation()">{{ formatTime(seg.started) }}</span>
              }
              <span class="sep">–</span>
              @if (editingEndId() === seg.id) {
                <input type="time" class="inline-time-input" [(ngModel)]="editEndValue"
                  (blur)="saveEnd(seg)" (keydown.enter)="$any($event.target).blur()"
                  (keydown.escape)="cancelTimeEdit()" (click)="$event.stopPropagation()" />
              } @else if (seg.ended) {
                <span class="editable-time" (click)="startEditEnd(seg); $event.stopPropagation()">{{ formatTime(seg.ended) }}</span>
              } @else {
                <span class="running-label">running</span>
              }
            </span>
            <span class="segment-duration">
              @if (seg.ended) {
                {{ seg.duration_ms | duration }}
              } @else {
                <mat-icon class="pulse-icon">fiber_manual_record</mat-icon>
              }
            </span>
          </div>
          <div class="segment-notes-wrap" (click)="$event.stopPropagation()">
            <app-markdown-note-editor
              [notes]="seg.notes ?? ''"
              height="120px"
              placeholder="Click to add segment-specific notes…"
              (notesChanged)="onNotesChanged(seg, $event)"
            />
          </div>
        </div>
        @if (!$last && segments()[i + 1]) {
          <div class="break-row" (click)="$event.stopPropagation()">
            <mat-icon class="break-icon">coffee</mat-icon>
            <span class="break-duration">{{ breakDuration(seg, segments()[i + 1]) | duration }} break</span>
            <span class="break-sep">·</span>
            @if (editingBreakNoteId() === segments()[i + 1].id) {
              <input type="text" class="break-note-input" [(ngModel)]="editBreakNoteValue"
                placeholder="What was the break for?"
                (blur)="saveBreakNote(segments()[i + 1])"
                (keydown.enter)="$any($event.target).blur()"
                (keydown.escape)="cancelBreakNoteEdit()" />
            } @else if (segments()[i + 1].break_note) {
              <span class="break-note" (click)="startEditBreakNote(segments()[i + 1])">{{ segments()[i + 1].break_note }}</span>
            } @else {
              <span class="break-note-add" (click)="startEditBreakNote(segments()[i + 1])">+ reason</span>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .segment-list { padding: 4px 0; }

    .segment-block { padding: 2px 0; }

    .segment-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      font-size: 0.8rem;
      border-radius: 4px;
    }

    .segment-row.open { color: #4caf50; }

    .segment-index {
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
      min-width: 20px;
    }

    .segment-times {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .sep { margin: 0 2px; color: var(--mat-sys-outline-variant); }

    .running-label { color: #4caf50; font-style: italic; }

    .segment-duration {
      font-weight: 500;
      min-width: 48px;
      text-align: right;
    }

    .pulse-icon {
      font-size: 10px;
      width: 10px;
      height: 10px;
      color: #4caf50;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .editable-time {
      cursor: pointer;
      border-bottom: 1px dashed transparent;
      padding: 0 2px;
      border-radius: 2px;
    }
    .editable-time:hover {
      background: var(--mat-sys-surface-container-highest);
      border-bottom-color: var(--mat-sys-primary);
    }

    .inline-time-input {
      font-size: 0.8rem;
      border: 1px solid var(--mat-sys-primary);
      border-radius: 4px;
      padding: 1px 3px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      outline: none;
      font-variant-numeric: tabular-nums;
    }

    .segment-notes-wrap {
      padding: 0 8px 6px 28px;
      font-size: 0.8rem;
    }

    .break-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px 2px 28px;
      font-size: 0.7rem;
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.85;
    }

    .break-icon { font-size: 12px; width: 12px; height: 12px; }

    .break-duration { font-style: italic; white-space: nowrap; }

    .break-sep { color: var(--mat-sys-outline-variant); opacity: 0.6; }

    .break-note {
      cursor: pointer;
      border-bottom: 1px dashed transparent;
      padding: 0 2px;
      border-radius: 2px;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .break-note:hover {
      border-bottom-color: var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-lowest);
    }

    .break-note-add {
      cursor: pointer;
      color: var(--mat-sys-primary);
      opacity: 0.5;
      font-style: italic;
    }
    .break-note-add:hover { opacity: 1; }

    .break-note-input {
      flex: 1;
      font-size: 0.7rem;
      border: 1px solid var(--mat-sys-primary);
      border-radius: 4px;
      padding: 1px 6px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      outline: none;
      min-width: 0;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentListComponent {
  segments = input.required<TimerSegment[]>();
  onEditNotes = output<SegmentNotesUpdate>();
  onEditTime = output<SegmentTimeUpdate>();
  onEditBreakNote = output<SegmentBreakNoteUpdate>();

  editingStartId = signal<string | null>(null);
  editingEndId = signal<string | null>(null);
  editingBreakNoteId = signal<string | null>(null);
  editStartValue = '';
  editEndValue = '';
  editBreakNoteValue = '';

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  breakDuration(prev: TimerSegment, next: TimerSegment): number {
    if (!prev.ended || !next.started) return 0;
    return new Date(next.started).getTime() - new Date(prev.ended).getTime();
  }

  startEditStart(seg: TimerSegment) {
    this.cancelTimeEdit();
    this.editStartValue = this.isoToTimeInput(seg.started);
    this.editingStartId.set(seg.id);
  }

  startEditEnd(seg: TimerSegment) {
    if (!seg.ended) return;
    this.cancelTimeEdit();
    this.editEndValue = this.isoToTimeInput(seg.ended);
    this.editingEndId.set(seg.id);
  }

  cancelTimeEdit() {
    this.editingStartId.set(null);
    this.editingEndId.set(null);
  }

  saveStart(seg: TimerSegment) {
    const value = this.editStartValue;
    this.editingStartId.set(null);
    if (!value) return;
    if (value === this.isoToTimeInput(seg.started)) return;
    const newIso = this.applyTimeToIso(seg.started, value);
    this.onEditTime.emit({ segmentId: seg.id, started: newIso });
  }

  saveEnd(seg: TimerSegment) {
    const value = this.editEndValue;
    this.editingEndId.set(null);
    if (!value || !seg.ended) return;
    if (value === this.isoToTimeInput(seg.ended)) return;
    const newIso = this.applyTimeToIso(seg.ended, value);
    this.onEditTime.emit({ segmentId: seg.id, ended: newIso });
  }

  onNotesChanged(seg: TimerSegment, notes: string) {
    if ((seg.notes ?? '') === notes) return;
    this.onEditNotes.emit({ segmentId: seg.id, notes });
  }

  startEditBreakNote(seg: TimerSegment) {
    this.editBreakNoteValue = seg.break_note ?? '';
    this.editingBreakNoteId.set(seg.id);
  }

  cancelBreakNoteEdit() {
    this.editingBreakNoteId.set(null);
  }

  saveBreakNote(seg: TimerSegment) {
    const value = this.editBreakNoteValue;
    this.editingBreakNoteId.set(null);
    const original = seg.break_note ?? '';
    if (value === original) return;
    this.onEditBreakNote.emit({ segmentId: seg.id, break_note: value });
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
}

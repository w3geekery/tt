import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DurationPipe } from '../pipes/duration.pipe';
import { TimerSegment } from '../models';

@Component({
  selector: 'app-segment-list',
  standalone: true,
  imports: [MatIconModule, DurationPipe],
  template: `
    <div class="segment-list">
      @for (seg of segments(); track seg.id; let i = $index) {
        <div class="segment-row" [class.open]="!seg.ended">
          <span class="segment-index">#{{ i + 1 }}</span>
          <span class="segment-times">
            {{ formatTime(seg.started) }}
            <span class="sep">–</span>
            @if (seg.ended) {
              {{ formatTime(seg.ended) }}
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
          @if (seg.notes) {
            <span class="segment-notes" (click)="onEditNotes.emit({ segmentId: seg.id, notes: seg.notes }); $event.stopPropagation()">
              {{ seg.notes }}
            </span>
          }
        </div>
        @if (!$last && segments()[i + 1]) {
          <div class="break-row">
            <mat-icon class="break-icon">coffee</mat-icon>
            <span class="break-duration">{{ breakDuration(seg, segments()[i + 1]) | duration }} break</span>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .segment-list { padding: 4px 0; }

    .segment-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      font-size: 0.8rem;
      border-radius: 4px;
    }

    .segment-row:hover { background: var(--mat-sys-surface-container-lowest); }

    .segment-row.open { color: #4caf50; }

    .segment-index {
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
      min-width: 20px;
    }

    .segment-times {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
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

    .segment-notes {
      flex: 1;
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      border-bottom: 1px dashed transparent;
    }

    .segment-notes:hover {
      border-bottom-color: var(--mat-sys-outline-variant);
    }

    .break-row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px 2px 28px;
      font-size: 0.7rem;
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.7;
    }

    .break-icon { font-size: 12px; width: 12px; height: 12px; }

    .break-duration { font-style: italic; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentListComponent {
  segments = input.required<TimerSegment[]>();
  onEditNotes = output<{ segmentId: string; notes: string }>();

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  breakDuration(prev: TimerSegment, next: TimerSegment): number {
    if (!prev.ended || !next.started) return 0;
    return new Date(next.started).getTime() - new Date(prev.ended).getTime();
  }
}

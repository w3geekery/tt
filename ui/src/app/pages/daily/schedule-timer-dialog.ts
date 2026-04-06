import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';

export interface ScheduleTimerDialogData {
  company_name: string;
  project_name: string | null;
  task_name: string | null;
  company_color: string | null;
}

@Component({
  selector: 'app-schedule-timer-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatChipsModule],
  template: `
    <h2 mat-dialog-title>Schedule Timer</h2>
    <mat-dialog-content>
      <div class="template-display">
        <mat-chip-set>
          <mat-chip [style.--mat-chip-elevated-container-color]="data.company_color || 'var(--mat-sys-primary-container)'">
            {{ data.company_name }}
          </mat-chip>
          @if (data.project_name) {
            <mat-chip>{{ data.project_name }}</mat-chip>
          }
          @if (data.task_name) {
            <mat-chip>{{ data.task_name }}</mat-chip>
          }
        </mat-chip-set>
      </div>
      <div class="time-field">
        <label for="start-time">Start Time</label>
        <input type="time" id="start-time" [(ngModel)]="startTime" class="time-input" />
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!startTime" (click)="submit()">Add</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .template-display { margin-bottom: 16px; }
    .time-field { display: flex; flex-direction: column; gap: 4px; }
    .time-field label { font-size: 0.875rem; color: var(--mat-sys-on-surface-variant); }
    .time-input { font-size: 1rem; padding: 8px; border: 1px solid var(--mat-sys-outline); border-radius: 4px; background: var(--mat-sys-surface); color: var(--mat-sys-on-surface); }
  `],
})
export class ScheduleTimerDialogComponent {
  data = inject<ScheduleTimerDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<ScheduleTimerDialogComponent>);

  startTime = '';

  submit() {
    if (!this.startTime) return;
    const [h, m] = this.startTime.split(':').map(Number);
    const today = new Date();
    today.setHours(h, m, 0, 0);
    this.dialogRef.close({ start_at: today.toISOString() });
  }
}

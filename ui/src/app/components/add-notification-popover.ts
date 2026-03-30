import { Component, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-add-notification-popover',
  imports: [FormsModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatCardModule],
  template: `
    <mat-card class="popover-card">
      <mat-card-content>
        <mat-form-field class="full-width time-field">
          <mat-label>Time</mat-label>
          <input matInput type="time" [(ngModel)]="editTime" />
        </mat-form-field>
        <mat-form-field class="full-width">
          <mat-label>Message</mat-label>
          <input matInput [(ngModel)]="message" placeholder="e.g., take out trash" (keydown.enter)="submit()" />
        </mat-form-field>
        <div class="popover-actions">
          <button mat-button (click)="onCancel.emit()">Cancel</button>
          <button mat-raised-button color="primary" (click)="submit()" [disabled]="!message">
            Set
          </button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    :host {
      position: absolute;
      top: 100%;
      margin-top: 4px;
      z-index: 1000;
    }
    .popover-card {
      width: 280px;
    }
    .time-field {
      margin-bottom: -8px;
    }
    .full-width {
      width: 100%;
    }
    .popover-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `],
})
export class AddNotificationPopoverComponent implements OnInit {
  time = input.required<string>();
  onAdd = output<{ time: string; title: string }>();
  onCancel = output<void>();

  message = '';
  editTime = '';

  ngOnInit() {
    // Initialize the editable time from the ISO input
    const d = new Date(this.time());
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    this.editTime = `${h}:${m}`;
  }

  private buildIso(): string {
    const d = new Date(this.time());
    const [h, m] = this.editTime.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  submit() {
    if (!this.message) return;
    this.onAdd.emit({
      time: this.buildIso(),
      title: this.message,
    });
  }
}

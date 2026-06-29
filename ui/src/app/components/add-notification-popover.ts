import { Component, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SPOKEN_VOICES, NotificationDelivery } from '../models';
import { DeliveryChoice, deliveryPayload } from './notification-delivery.util';

export interface AddNotificationEvent {
  time: string;
  title: string;
  delivery?: NotificationDelivery;
  voice?: string;
}

@Component({
  selector: 'app-add-notification-popover',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
  ],
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

        <mat-button-toggle-group
          class="delivery-toggle"
          [value]="delivery()"
          (change)="delivery.set($event.value)"
          aria-label="Delivery"
        >
          <mat-button-toggle value="silent" matTooltip="Silent banner">
            <mat-icon>notifications_none</mat-icon> Silent
          </mat-button-toggle>
          <mat-button-toggle value="bell" matTooltip="Banner + sound">
            <mat-icon>notifications_active</mat-icon> Bell
          </mat-button-toggle>
          <mat-button-toggle value="voice" matTooltip="Spoken aloud">
            <mat-icon>record_voice_over</mat-icon> Voice
          </mat-button-toggle>
        </mat-button-toggle-group>

        @if (delivery() === 'voice') {
          <mat-form-field class="full-width voice-field">
            <mat-label>Voice</mat-label>
            <mat-select [value]="voice()" (selectionChange)="voice.set($event.value)">
              @for (v of voices; track v) {
                <mat-option [value]="v">{{ v }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

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
      width: 300px;
    }
    .time-field {
      margin-bottom: -8px;
    }
    .full-width {
      width: 100%;
    }
    .delivery-toggle {
      width: 100%;
      margin: 4px 0 8px;
    }
    .delivery-toggle .mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 2px;
      vertical-align: middle;
    }
    .voice-field {
      margin-top: 4px;
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
  onAdd = output<AddNotificationEvent>();
  onCancel = output<void>();

  message = '';
  editTime = '';

  readonly voices = SPOKEN_VOICES;
  readonly delivery = signal<DeliveryChoice>('silent');
  readonly voice = signal<string>(SPOKEN_VOICES[0]);

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
      ...deliveryPayload(this.delivery(), this.voice()),
    });
  }
}

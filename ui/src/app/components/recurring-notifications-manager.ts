import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  RecurringNotification,
  RecurringNotificationPattern,
  SPOKEN_VOICES,
} from '../models';
import { RecurringNotificationsService } from '../services/recurring-notifications.service';
import {
  DeliveryChoice,
  deliveryPayloadNullable,
  scheduleLabel,
  deliveryIcon,
  deliveryLabel,
  canSaveReminder,
} from './notification-delivery.util';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-recurring-notifications-manager',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="reminders">
      <!-- Existing reminders -->
      @if (reminders().length === 0 && !adding()) {
        <p class="empty-message">No recurring reminders yet.</p>
      }

      <div class="card-grid">
        @for (r of reminders(); track r.id) {
          <mat-card class="reminder-card" [class.inactive]="!r.active">
            <mat-card-content>
              <div class="reminder-head">
                <span class="reminder-title">{{ r.title }}</span>
                <mat-slide-toggle
                  [checked]="r.active"
                  (change)="toggleActive(r, $event.checked)"
                  matTooltip="{{ r.active ? 'Active' : 'Paused' }}"
                />
              </div>

              <div class="reminder-schedule">
                <mat-icon class="meta-icon">schedule</mat-icon>
                <span>{{ scheduleLabel(r) }}</span>
              </div>

              <div class="reminder-delivery">
                <mat-icon class="meta-icon">{{ deliveryIcon(r) }}</mat-icon>
                <span>{{ deliveryLabel(r) }}</span>
              </div>

              @if (r.message) {
                <p class="reminder-message">{{ r.message }}</p>
              }

              <div class="reminder-actions">
                <button mat-button (click)="skipToday(r)" matTooltip="Skip today's occurrence">
                  <mat-icon>event_busy</mat-icon> Skip today
                </button>
                <button mat-button color="warn" (click)="remove(r)">
                  <mat-icon>delete</mat-icon> Delete
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        }

        <!-- Add form / add tile -->
        @if (adding()) {
          <mat-card class="reminder-card add-form">
            <mat-card-content>
              <mat-form-field class="full-width">
                <mat-label>Title</mat-label>
                <input matInput [(ngModel)]="formTitle" placeholder="e.g., Update zb-dx docs" />
              </mat-form-field>

              <mat-form-field class="full-width">
                <mat-label>Spoken / shown message</mat-label>
                <textarea matInput rows="2" [(ngModel)]="formMessage"
                  placeholder="What should the reminder say?"></textarea>
              </mat-form-field>

              <div class="row">
                <mat-form-field class="pattern-field">
                  <mat-label>Repeats</mat-label>
                  <mat-select [value]="pattern()" (selectionChange)="pattern.set($event.value)">
                    <mat-option value="daily">Every day</mat-option>
                    <mat-option value="weekdays">Weekdays (Mon-Fri)</mat-option>
                    <mat-option value="weekly">Specific days</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-form-field class="time-field">
                  <mat-label>Time (PT)</mat-label>
                  <input matInput type="time" [(ngModel)]="formTime" />
                </mat-form-field>
              </div>

              @if (pattern() === 'weekly') {
                <mat-button-toggle-group class="dow-toggle" multiple
                  [value]="weekdays()" (change)="weekdays.set($event.value)" aria-label="Weekdays">
                  @for (d of dow; track d.value) {
                    <mat-button-toggle [value]="d.value">{{ d.label }}</mat-button-toggle>
                  }
                </mat-button-toggle-group>
              }

              <mat-button-toggle-group class="delivery-toggle"
                [value]="delivery()" (change)="delivery.set($event.value)" aria-label="Delivery">
                <mat-button-toggle value="silent"><mat-icon>notifications_none</mat-icon> Silent</mat-button-toggle>
                <mat-button-toggle value="bell"><mat-icon>notifications_active</mat-icon> Bell</mat-button-toggle>
                <mat-button-toggle value="voice"><mat-icon>record_voice_over</mat-icon> Voice</mat-button-toggle>
              </mat-button-toggle-group>

              @if (delivery() === 'voice') {
                <mat-form-field class="full-width">
                  <mat-label>Voice</mat-label>
                  <mat-select [value]="voice()" (selectionChange)="voice.set($event.value)">
                    @for (v of voices; track v) {
                      <mat-option [value]="v">{{ v }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }

              <div class="form-actions">
                <button mat-button (click)="cancelAdd()">Cancel</button>
                <button mat-raised-button color="primary" (click)="save()" [disabled]="!canSave()">
                  Create
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        } @else {
          <mat-card class="reminder-card add-tile" (click)="startAdd()">
            <mat-card-content class="add-body">
              <mat-icon>add_alarm</mat-icon>
              <span>New reminder</span>
            </mat-card-content>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: [`
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }
    .reminder-card.inactive { opacity: 0.55; }
    .reminder-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .reminder-title { font-size: 16px; font-weight: 600; }
    .reminder-schedule, .reminder-delivery {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      font-size: 14px;
      color: var(--mat-sys-on-surface-variant);
    }
    .meta-icon { font-size: 18px; width: 18px; height: 18px; }
    .reminder-message {
      margin: 8px 0 0;
      font-size: 14px;
      color: var(--mat-sys-on-surface-variant);
    }
    .reminder-actions {
      display: flex;
      justify-content: flex-end;
      gap: 4px;
      margin-top: 8px;
    }
    .reminder-actions .mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 2px; }
    .full-width { width: 100%; }
    .row { display: flex; gap: 8px; }
    .pattern-field { flex: 1 1 60%; }
    .time-field { flex: 1 1 40%; }
    .dow-toggle, .delivery-toggle { width: 100%; margin: 4px 0 8px; }
    .delivery-toggle .mat-icon { font-size: 18px; width: 18px; height: 18px; vertical-align: middle; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
    .add-tile { cursor: pointer; border: 1px dashed var(--mat-sys-outline-variant); }
    .add-body {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 4px; min-height: 120px; color: var(--mat-sys-on-surface-variant);
    }
    .add-body .mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .empty-message { color: var(--mat-sys-on-surface-variant); font-size: 14px; }
  `],
})
export class RecurringNotificationsManagerComponent implements OnInit {
  private svc = inject(RecurringNotificationsService);
  private snackBar = inject(MatSnackBar);

  readonly reminders = signal<RecurringNotification[]>([]);
  readonly adding = signal(false);

  readonly voices = SPOKEN_VOICES;
  readonly dow = DOW.map((label, value) => ({ label, value }));

  // Add-form state
  formTitle = '';
  formMessage = '';
  formTime = '09:00';
  readonly pattern = signal<RecurringNotificationPattern>('weekly');
  readonly weekdays = signal<number[]>([1, 3, 5]);
  readonly delivery = signal<DeliveryChoice>('voice');
  readonly voice = signal<string>(SPOKEN_VOICES[0]);

  canSave(): boolean {
    return canSaveReminder(this.formTitle, this.formTime, this.pattern(), this.weekdays());
  }

  ngOnInit() {
    this.load();
  }

  private load() {
    this.svc.list(false).subscribe(list => this.reminders.set(list));
  }

  scheduleLabel(r: RecurringNotification): string {
    return scheduleLabel(r.pattern, r.weekdays, r.trigger_time);
  }

  deliveryIcon(r: RecurringNotification): string {
    return deliveryIcon(r.delivery);
  }

  deliveryLabel(r: RecurringNotification): string {
    return deliveryLabel(r.delivery, r.voice, SPOKEN_VOICES[0]);
  }

  startAdd() { this.adding.set(true); }

  cancelAdd() {
    this.adding.set(false);
    this.resetForm();
  }

  private resetForm() {
    this.formTitle = '';
    this.formMessage = '';
    this.formTime = '09:00';
    this.pattern.set('weekly');
    this.weekdays.set([1, 3, 5]);
    this.delivery.set('voice');
    this.voice.set(SPOKEN_VOICES[0]);
  }

  save() {
    if (!this.canSave()) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    this.svc.create({
      title: this.formTitle.trim(),
      message: this.formMessage.trim() || null,
      pattern: this.pattern(),
      weekdays: this.pattern() === 'weekly' ? this.weekdays() : [],
      trigger_time: this.formTime,
      start_date: today,
      ...deliveryPayloadNullable(this.delivery(), this.voice()),
    }).subscribe(rec => {
      this.reminders.update(list => [rec, ...list]);
      this.cancelAdd();
      this.snackBar.open('Recurring reminder created', 'OK', { duration: 2000 });
    });
  }

  toggleActive(r: RecurringNotification, active: boolean) {
    this.svc.update(r.id, { active }).subscribe(updated => {
      this.reminders.update(list => list.map(x => (x.id === r.id ? updated : x)));
    });
  }

  skipToday(r: RecurringNotification) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    this.svc.skip(r.id, today).subscribe(updated => {
      this.reminders.update(list => list.map(x => (x.id === r.id ? updated : x)));
      this.snackBar.open(`Skipped ${today}`, 'OK', { duration: 2000 });
    });
  }

  remove(r: RecurringNotification) {
    this.svc.delete(r.id).subscribe(() => {
      this.reminders.update(list => list.filter(x => x.id !== r.id));
      this.snackBar.open('Reminder deleted', 'OK', { duration: 2000 });
    });
  }
}

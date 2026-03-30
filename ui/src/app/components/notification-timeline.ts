import { Component, input, output, signal, computed, ElementRef, viewChild, AfterViewInit, OnInit, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { Notification, UserSettings } from '../models';
import { AddNotificationPopoverComponent } from './add-notification-popover';

@Component({
  selector: 'app-notification-timeline',
  imports: [MatTooltipModule, MatIconModule, AddNotificationPopoverComponent],
  template: `
    <div class="timeline-container" #container>
      <!-- Header row -->
      @if (!compact()) {
        <div class="timeline-header">
          <span class="timeline-heading">Notifications</span>
          @if (activeMessage()) {
            <div class="active-notification">
              <span class="active-notification-text">{{ activeMessage() }}</span>
              <button class="active-notification-clear" (click)="clearActiveMessage()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
        </div>
      }

      <svg
        class="timeline-svg"
        [attr.viewBox]="'0 0 ' + svgWidth + ' ' + svgHeight()"
        [style.height.px]="svgHeight()"
        preserveAspectRatio="none"
        (click)="onTimelineClick($event)"
        (mousemove)="onTimelineHover($event)"
        (mouseleave)="onMouseLeave()"
      >
        <!-- Background -->
        <rect x="0" y="0" [attr.width]="svgWidth" [attr.height]="svgHeight()" fill="var(--mat-sys-surface-container-lowest)" rx="4" />

        <!-- Hour ticks and labels -->
        @for (hour of hourMarkers(); track hour) {
          <line
            [attr.x1]="hourToX(hour)"
            y1="0"
            [attr.x2]="hourToX(hour)"
            [attr.y2]="compact() ? 6 : 10"
            stroke="var(--mat-sys-outline-variant)"
            stroke-width="1"
          />
          @if (!compact()) {
            <text
              [attr.x]="hourToX(hour)"
              y="22"
              text-anchor="middle"
              font-size="10"
              fill="var(--mat-sys-on-surface-variant)"
            >
              {{ formatHour(hour) }}
            </text>
          }
        }

        <!-- Current time indicator -->
        @if (currentTimeX() !== null) {
          <line
            [attr.x1]="currentTimeX()"
            y1="0"
            [attr.x2]="currentTimeX()"
            [attr.y2]="svgHeight()"
            stroke="#ff9800"
            stroke-width="2"
          />
        }

        <!-- Notification dots -->
        @for (notif of notifications(); track notif.id) {
          <circle
            [attr.cx]="notificationToX(notif.trigger_at)"
            [attr.cy]="dotY()"
            [attr.r]="compact() ? 3 : 5"
            [attr.fill]="dotColor(notif.status)"
            class="notification-dot"
            [matTooltip]="tooltipText(notif)"
            matTooltipPosition="above"
          />
        }

        <!-- Hover indicator -->
        @if (hoverX() !== null) {
          <line
            [attr.x1]="hoverX()"
            y1="0"
            [attr.x2]="hoverX()"
            [attr.y2]="svgHeight()"
            stroke="var(--mat-sys-primary)"
            stroke-width="1"
            opacity="0.4"
            stroke-dasharray="2,2"
          />
          @if (!compact()) {
            <text
              [attr.x]="hoverX()! + 4"
              [attr.y]="svgHeight() - 3"
              font-size="9"
              fill="var(--mat-sys-primary)"
            >
              + {{ hoverTimeLabel() }}
            </text>
          }
        }
      </svg>

      @if (showPopover()) {
        <div class="popover-backdrop" (click)="showPopover.set(false)"></div>
        <app-add-notification-popover
          [time]="popoverTime()"
          [style.left.px]="popoverLeft()"
          (onAdd)="onPopoverAdd($event)"
          (onCancel)="showPopover.set(false)"
        />
      }
    </div>
  `,
  styles: [`
    .timeline-container {
      position: relative;
      margin: 8px 0;
    }
    .timeline-header {
      display: flex;
      align-items: center;
      margin-bottom: 4px;
      gap: 8px;
    }
    .timeline-heading {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .active-notification {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface);
    }
    .active-notification-text {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .active-notification-clear {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      color: var(--mat-sys-on-surface-variant);
      display: flex;
      align-items: center;
    }
    .active-notification-clear mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    .active-notification-clear:hover {
      color: var(--mat-sys-on-surface);
    }
    .popover-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 999;
    }
    .timeline-svg {
      width: 100%;
      cursor: pointer;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 4px;
    }
    .notification-dot {
      cursor: pointer;
      transition: r 0.1s ease;
    }
    .notification-dot:hover {
      filter: drop-shadow(0 0 3px var(--mat-sys-primary));
    }
  `],
})
export class NotificationTimelineComponent implements AfterViewInit, OnInit, OnDestroy {
  notifications = input.required<Notification[]>();
  compact = input(false);
  date = input.required<string>(); // YYYY-MM-DD
  settings = input<UserSettings>({ timeline_start_hour: 5, timeline_end_hour: 19, notify_on_cap: true });

  onAddNotification = output<{ time: string; title: string }>();

  container = viewChild.required<ElementRef>('container');

  private platformId = inject(PLATFORM_ID);

  // Internal SVG uses a fixed coordinate system; viewBox handles scaling
  readonly svgWidth = 600;

  svgHeight = computed(() => this.compact() ? 20 : 36);
  dotY = computed(() => this.compact() ? 12 : 14);

  hoverX = signal<number | null>(null);
  hoverTimeLabel = signal('');
  showPopover = signal(false);
  popoverTime = signal('');
  popoverLeft = signal(0);
  currentTimeX = signal<number | null>(null);
  activeMessage = signal<string | null>(null);

  private resizeObserver: ResizeObserver | null = null;
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  hourMarkers = computed(() => {
    const start = this.settings().timeline_start_hour;
    const end = this.settings().timeline_end_hour;
    const markers: number[] = [];
    for (let h = start; h <= end; h++) {
      markers.push(h);
    }
    return markers;
  });

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.updateCurrentTime();
      this.clockInterval = setInterval(() => this.updateCurrentTime(), 10_000);
      this.updateActiveMessage();
    }
  }

  ngAfterViewInit() {
    // No-op for now; SVG viewBox handles responsiveness
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  private updateCurrentTime() {
    const now = new Date();
    const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const todayStr = `${pacific.getFullYear()}-${String(pacific.getMonth() + 1).padStart(2, '0')}-${String(pacific.getDate()).padStart(2, '0')}`;

    // Only show current time line if viewing today
    if (this.date() !== todayStr) {
      this.currentTimeX.set(null);
      return;
    }

    const hourFraction = pacific.getHours() + pacific.getMinutes() / 60;
    const start = this.settings().timeline_start_hour;
    const end = this.settings().timeline_end_hour;

    if (hourFraction < start || hourFraction > end) {
      this.currentTimeX.set(null);
      return;
    }

    const range = end - start;
    const ratio = (hourFraction - start) / range;
    const padding = 10;
    const usable = this.svgWidth - 2 * padding;
    this.currentTimeX.set(padding + ratio * usable);
  }

  private updateActiveMessage() {
    // Show the most recent fired notification's title
    const fired = this.notifications().filter(n => n.status === 'fired');
    if (fired.length > 0) {
      const latest = fired.reduce((a, b) =>
        new Date(a.trigger_at).getTime() > new Date(b.trigger_at).getTime() ? a : b
      );
      this.activeMessage.set(latest.title);
    }
  }

  clearActiveMessage() {
    this.activeMessage.set(null);
  }

  hourToX(hour: number): number {
    const start = this.settings().timeline_start_hour;
    const end = this.settings().timeline_end_hour;
    const range = end - start;
    const padding = 10;
    const usable = this.svgWidth - 2 * padding;
    return padding + ((hour - start) / range) * usable;
  }

  notificationToX(triggerAt: string): number {
    const notifDate = new Date(triggerAt);
    // Extract hour in Pacific time
    const pacificTime = new Date(notifDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const hourFraction = pacificTime.getHours() + pacificTime.getMinutes() / 60;

    const start = this.settings().timeline_start_hour;
    const end = this.settings().timeline_end_hour;
    const range = end - start;
    const ratio = Math.max(0, Math.min(1, (hourFraction - start) / range));

    const padding = 10;
    const usable = this.svgWidth - 2 * padding;
    return padding + ratio * usable;
  }

  dotColor(status: string): string {
    return status === 'pending' ? '#4caf50' : '#9e9e9e';
  }

  formatHour(hour: number): string {
    if (hour === 0) return '12am';
    if (hour < 12) return hour + 'am';
    if (hour === 12) return '12pm';
    return (hour - 12) + 'pm';
  }

  tooltipText(notif: Notification): string {
    const time = new Date(notif.trigger_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
    return `${time} — ${notif.title} [${notif.status}]`;
  }

  onTimelineClick(event: MouseEvent) {
    const time = this.xToTime(event);
    if (!time) return;
    this.popoverTime.set(time);

    // Position popover near the click point
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const containerRect = this.container().nativeElement.getBoundingClientRect();
    const clickX = event.clientX - containerRect.left;
    // Center the popover on the click, but clamp so it doesn't overflow
    const popoverWidth = 280;
    const containerWidth = containerRect.width;
    const left = Math.max(0, Math.min(containerWidth - popoverWidth, clickX - popoverWidth / 2));
    this.popoverLeft.set(left);

    this.showPopover.set(true);
  }

  onTimelineHover(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const svgX = xRatio * this.svgWidth;
    this.hoverX.set(svgX);

    const time = this.xToTime(event);
    if (time) {
      this.hoverTimeLabel.set(new Date(time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Los_Angeles',
      }));
    }
  }

  onMouseLeave() {
    this.hoverX.set(null);
  }

  onPopoverAdd(event: { time: string; title: string }) {
    this.showPopover.set(false);
    this.onAddNotification.emit(event);
  }

  private xToTime(event: MouseEvent): string | null {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;

    const padding = 10;
    const usable = this.svgWidth - 2 * padding;
    const svgX = xRatio * this.svgWidth;
    const posRatio = Math.max(0, Math.min(1, (svgX - padding) / usable));

    const start = this.settings().timeline_start_hour;
    const end = this.settings().timeline_end_hour;
    const hourFraction = start + posRatio * (end - start);

    const hours = Math.floor(hourFraction);
    const minutes = Math.round((hourFraction - hours) * 60 / 15) * 15; // Round to 15-min

    // Build a date in Pacific time using the date input
    const dateStr = this.date();
    const h = hours + (minutes >= 60 ? 1 : 0);
    const m = minutes % 60;
    const localStr = `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

    // Create date assuming local machine is Pacific (matches project convention)
    const d = new Date(localStr);
    return d.toISOString();
  }
}

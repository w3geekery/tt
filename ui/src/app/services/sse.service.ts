import { Injectable, PLATFORM_ID, inject, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';

export interface TimerEvent {
  type: 'timer-created' | 'timer-updated' | 'timer-deleted';
  data: unknown;
}

@Injectable({ providedIn: 'root' })
export class SseService implements OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private eventSource: EventSource | null = null;

  /** Emits whenever the server broadcasts a timer change. */
  readonly timerEvents$ = new Subject<TimerEvent>();

  connect(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.eventSource) return;

    this.eventSource = new EventSource('/api/sse');

    this.eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as TimerEvent;
        this.timerEvents$.next(parsed);
      } catch {
        // Ignore malformed messages (e.g. heartbeat comments)
      }
    };

    this.eventSource.onerror = () => {
      // EventSource auto-reconnects; nothing to do here
    };
  }

  /** Emit a synthetic event to trigger all subscribers to reload. */
  refresh(): void {
    this.timerEvents$.next({ type: 'timer-updated', data: null });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.timerEvents$.complete();
  }
}

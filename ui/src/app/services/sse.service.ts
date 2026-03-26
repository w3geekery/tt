import { Injectable, NgZone, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface SseEvent {
  type: string;
  data: unknown;
}

@Injectable({ providedIn: 'root' })
export class SseService {
  private zone = inject(NgZone);
  private events$ = new Subject<SseEvent>();
  private source: EventSource | null = null;

  connect(): void {
    if (this.source) return;

    this.zone.runOutsideAngular(() => {
      this.source = new EventSource('/api/sse');

      const eventTypes = [
        'timer:created', 'timer:updated', 'timer:started', 'timer:stopped',
        'timer:paused', 'timer:resumed', 'timer:deleted',
        'company:created', 'company:updated', 'company:deleted',
        'project:created', 'project:updated', 'project:deleted',
        'task:created', 'task:updated', 'task:deleted',
        'notification:created', 'notification:fired', 'notification:dismissed',
        'recurring:created', 'recurring:updated', 'recurring:deleted',
      ];

      for (const type of eventTypes) {
        this.source!.addEventListener(type, (event: MessageEvent) => {
          this.zone.run(() => {
            this.events$.next({ type, data: JSON.parse(event.data) });
          });
        });
      }

      this.source!.onerror = () => {
        this.source?.close();
        this.source = null;
        // Reconnect after 3 seconds
        setTimeout(() => this.connect(), 3000);
      };
    });
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
  }

  on<T = unknown>(eventType: string): Observable<T> {
    return this.events$.pipe(
      filter(e => e.type === eventType),
      map(e => e.data as T),
    );
  }

  onTimerChange(): Observable<unknown> {
    return this.events$.pipe(
      filter(e => e.type.startsWith('timer:')),
    );
  }
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';

/**
 * SseService unit tests.
 *
 * Angular's AOT-compiled decorators can't be loaded in vitest without the JIT
 * compiler, so we test the core SSE logic (EventSource lifecycle, message
 * parsing, Subject emission) using a plain-TS reimplementation of the service
 * internals — same approach as markdown-editor.component.spec.ts.
 */

// Minimal EventSource mock
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  close() { this.closed = true; }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  static instances: MockEventSource[] = [];
  static reset() { MockEventSource.instances = []; }
}

interface TimerEvent {
  type: 'timer-created' | 'timer-updated' | 'timer-deleted';
  data: unknown;
}

/**
 * Minimal replica of SseService logic for testing without Angular decorators.
 */
class SseServiceLogic {
  private eventSource: InstanceType<typeof MockEventSource> | null = null;
  readonly timerEvents$ = new Subject<TimerEvent>();

  constructor(private isBrowser: boolean) {}

  connect(): void {
    if (!this.isBrowser) return;
    if (this.eventSource) return;

    this.eventSource = new MockEventSource('/api/sse');
    this.eventSource.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as TimerEvent;
        this.timerEvents$.next(parsed);
      } catch {
        // ignore malformed
      }
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  destroy(): void {
    this.disconnect();
    this.timerEvents$.complete();
  }
}

describe('SseService (logic)', () => {
  let service: SseServiceLogic;

  beforeEach(() => {
    MockEventSource.reset();
    service = new SseServiceLogic(true);
  });

  afterEach(() => {
    service.destroy();
  });

  it('should not connect on server platform', () => {
    const serverService = new SseServiceLogic(false);
    serverService.connect();
    expect(MockEventSource.instances.length).toBe(0);
  });

  it('should create EventSource on connect', () => {
    service.connect();
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe('/api/sse');
  });

  it('should not create duplicate connections', () => {
    service.connect();
    service.connect();
    expect(MockEventSource.instances.length).toBe(1);
  });

  it('should emit parsed TimerEvent on message', () => {
    service.connect();
    const events: TimerEvent[] = [];
    service.timerEvents$.subscribe((e) => events.push(e));

    const payload: TimerEvent = { type: 'timer-created', data: { id: '123' } };
    MockEventSource.instances[0].simulateMessage(JSON.stringify(payload));

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('timer-created');
    expect(events[0].data).toEqual({ id: '123' });
  });

  it('should handle all event types', () => {
    service.connect();
    const types: string[] = [];
    service.timerEvents$.subscribe((e) => types.push(e.type));

    const es = MockEventSource.instances[0];
    es.simulateMessage(JSON.stringify({ type: 'timer-created', data: {} }));
    es.simulateMessage(JSON.stringify({ type: 'timer-updated', data: {} }));
    es.simulateMessage(JSON.stringify({ type: 'timer-deleted', data: { id: '1' } }));

    expect(types).toEqual(['timer-created', 'timer-updated', 'timer-deleted']);
  });

  it('should ignore malformed messages', () => {
    service.connect();
    const events: TimerEvent[] = [];
    service.timerEvents$.subscribe((e) => events.push(e));

    MockEventSource.instances[0].simulateMessage('not json');
    expect(events.length).toBe(0);
  });

  it('should close EventSource on disconnect', () => {
    service.connect();
    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    service.disconnect();
    expect(es.closed).toBe(true);
  });

  it('should allow reconnect after disconnect', () => {
    service.connect();
    service.disconnect();
    service.connect();
    expect(MockEventSource.instances.length).toBe(2);
    expect(MockEventSource.instances[1].closed).toBe(false);
  });

  it('should complete subject on destroy', () => {
    service.connect();
    let completed = false;
    service.timerEvents$.subscribe({ complete: () => (completed = true) });

    service.destroy();
    expect(completed).toBe(true);
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it('should be safe to disconnect without connecting', () => {
    expect(() => service.disconnect()).not.toThrow();
  });

  it('should be safe to destroy without connecting', () => {
    expect(() => service.destroy()).not.toThrow();
  });
});

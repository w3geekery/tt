/**
 * SSE (Server-Sent Events) broadcast manager.
 *
 * Clients connect to GET /api/sse and receive real-time updates
 * when timers change, caps are hit, etc.
 *
 * The old timetracker-ui expects messages in the format:
 * data: { "type": "timer-updated", "data": {...} }
 * as a single "message" event (not named events).
 */

import type { Request, Response } from 'express';

const clients = new Set<Response>();

export function sseHandler(_req: Request, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('\n');

  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
  });

  // Keepalive every 30s to prevent connection timeout
  const keepaliveTimer = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30_000);
}

export function broadcast(event: string, data: any): void {
  // Include event type in payload for richer client-side handling
  // Backward compatible — old clients use data.type, new clients can also use event field
  const payload = `data: ${JSON.stringify({ ...data, event })}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

export function getClientCount(): number {
  return clients.size;
}

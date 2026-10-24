import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { openEventStream, type EventStream } from '../../src/utils/sse';

let server: http.Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

/** Serves `handler` on a free port and returns the URL */
async function serve(handler: (res: express.Response) => void): Promise<string> {
  const app = express();
  app.get('/events', (_req, res) => handler(res));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/events`;
}

describe('openEventStream', () => {
  it('sends the SSE headers at once, then the events', async () => {
    let headersSentAtOpen = false;
    const url = await serve((res) => {
      const events = openEventStream(res);
      headersSentAtOpen = res.headersSent;
      events.send({ type: 'chunk', content: 'Halo' });
      events.end();
    });

    const res = await fetch(url);

    expect(headersSentAtOpen).toBe(true);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(await res.text()).toBe('data: {"type":"chunk","content":"Halo"}\n\n');
  });

  it('reports closed and writes nothing more once the client goes away', async () => {
    let events: EventStream | undefined;
    let write: ReturnType<typeof vi.spyOn> | undefined;
    const url = await serve((res) => {
      events = openEventStream(res);
      write = vi.spyOn(res, 'write');
      events.send({ type: 'session' });
    });

    await new Promise<void>((resolve) => {
      const req = http.get(url, (res) => res.once('data', () => { req.destroy(); resolve(); }));
      req.on('error', () => {});
    });

    await vi.waitFor(() => expect(events?.closed).toBe(true));
    const writesBefore = write!.mock.calls.length;
    events!.send({ type: 'chunk', content: 'terlambat' });
    expect(write!.mock.calls.length).toBe(writesBefore);
  });

  it('is not closed while the client is still reading', async () => {
    let closedMidStream: boolean | undefined;
    const url = await serve((res) => {
      const events = openEventStream(res);
      events.send({ type: 'session' });
      setTimeout(() => {
        closedMidStream = events.closed;
        events.end();
      }, 50);
    });

    const res = await fetch(url);
    await res.text();

    expect(closedMidStream).toBe(false);
  });
});

import type { Response } from 'express';

export interface EventStream {
  /** True once the response has closed, which mid-stream means the client went away */
  readonly closed: boolean;
  send(data: object): void;
  end(): void;
}

/**
 * Starts a Server-Sent Events response.
 *
 * A disconnect is read from the response. The request is no use for this: it emits `close`
 * as soon as its body has been read, long before the client goes away.
 */
export function openEventStream(res: Response): EventStream {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  let closed = false;
  res.on('close', () => { closed = true; });

  return {
    get closed() {
      return closed;
    },
    send(data: object): void {
      if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    end(): void {
      res.end();
    },
  };
}

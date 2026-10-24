/**
 * safeFetch against a real local HTTP server. A test resolver stands in for DNS
 * (*.test → 127.0.0.1, internal.test → 10.0.0.5) and only 127.0.0.1 counts as allowed,
 * so the server plays the "public" host and anything else is non-public.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { createSafeFetch, safeFetch } from '../../src/utils/safe-fetch';
import { OutboundRequestError } from '../../src/utils/ssrf';

const ALLOWED = '127.0.0.1';
const DNS: Record<string, string[]> = {
  'hook.test': [ALLOWED],
  'other.test': [ALLOWED],
  'internal.test': ['10.0.0.5'],
  'mixed.test': [ALLOWED, '10.0.0.5'],
};

const resolve = vi.fn((host: string, _opts: { all: true }, cb: (err: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) => {
  const addresses = DNS[host];
  if (!addresses) cb(Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' }), []);
  else cb(null, addresses.map((address) => ({ address, family: 4 })));
});

const testFetch = createSafeFetch({ resolve, isAllowedAddress: (ip) => ip === ALLOWED });

let server: http.Server;
let port: number;
const received: { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, body });
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      const to = new URL(req.url ?? '/', 'http://x').searchParams.get('to');

      if (path === '/echo') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ method: req.method, body, contentLength: req.headers['content-length'] ?? null }));
      } else if (path === '/redirect') {
        res.writeHead(302, { location: to ?? '/echo' });
        res.end();
      } else if (path === '/chain') {
        // Redirects n more times, then answers
        const n = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('n'));
        res.writeHead(302, { location: n > 1 ? `/chain?n=${n - 1}` : '/' });
        res.end();
      } else if (path === '/loop') {
        res.writeHead(301, { location: '/loop' });
        res.end();
      } else if (path === '/status/404') {
        res.writeHead(404);
        res.end('not here');
      } else if (path === '/big') {
        res.end('x'.repeat(4096));
      } else if (path.startsWith('/encoded/')) {
        const encoding = path.slice('/encoded/'.length);
        const encode = { gzip: zlib.gzipSync, 'x-gzip': zlib.gzipSync, deflate: zlib.deflateSync, br: zlib.brotliCompressSync }[encoding]!;
        res.writeHead(200, { 'content-encoding': encoding });
        res.end(encode('hello, compressed'));
      } else if (path === '/gzip-bomb') {
        res.writeHead(200, { 'content-encoding': 'gzip' });
        res.end(zlib.gzipSync(Buffer.alloc(1024 * 1024))); // 1 MiB of zeros, about 1 KiB on the wire
      } else if (path === '/hang') {
        // Never answers
      } else if (path === '/stall-body') {
        res.writeHead(200);
        res.write('partial');
      } else {
        res.end('ok');
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, ALLOWED, done));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
});

const at = (host: string, path: string) => `http://${host}:${port}${path}`;
const OPTIONS = { timeoutMs: 2000, maxBytes: 64 * 1024 };

describe('safeFetch — connection-time address check', () => {
  it('connects through the checking resolver', async () => {
    const res = await testFetch(at('hook.test', '/'), OPTIONS);
    // hook.test only exists in the test resolver, so a 200 means the connection used it
    expect(res).toEqual({ status: 200, ok: true, text: 'ok' });
    expect(resolve).toHaveBeenCalledWith('hook.test', { all: true }, expect.any(Function));
  });

  it('refuses a host that resolves to a non-public address', async () => {
    await expect(testFetch(at('internal.test', '/'), OPTIONS)).rejects.toThrow(
      new OutboundRequestError('internal.test resolves to a non-public address'),
    );
  });

  it('refuses a host when one of its addresses is non-public', async () => {
    await expect(testFetch(at('mixed.test', '/'), OPTIONS)).rejects.toBeInstanceOf(OutboundRequestError);
  });

  it('refuses a non-public IP literal before connecting', async () => {
    const before = received.length;
    await expect(testFetch(`http://10.0.0.5:${port}/`, OPTIONS)).rejects.toBeInstanceOf(OutboundRequestError);
    expect(received.length).toBe(before);
  });

  it('connects to an allowed IP literal without resolving it', async () => {
    resolve.mockClear();
    const res = await testFetch(at(ALLOWED, '/'), OPTIONS);
    expect(res.text).toBe('ok');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses private-network names and other protocols', async () => {
    await expect(testFetch(at('localhost', '/'), OPTIONS)).rejects.toThrow('URL must use a public host name');
    await expect(testFetch('ftp://hook.test/', OPTIONS)).rejects.toBeInstanceOf(OutboundRequestError);
  });

  it('passes resolver errors through', async () => {
    await expect(testFetch(at('unknown.test', '/'), OPTIONS)).rejects.toMatchObject({ code: 'ENOTFOUND' });
  });
});

describe('safeFetch — default policy', () => {
  it('refuses loopback, by address and by name', async () => {
    await expect(safeFetch(at(ALLOWED, '/'), OPTIONS)).rejects.toBeInstanceOf(OutboundRequestError);
    await expect(safeFetch(at('localhost', '/'), OPTIONS)).rejects.toBeInstanceOf(OutboundRequestError);
  });

  it('refuses a public-looking name that resolves to loopback', async () => {
    const rebinding = createSafeFetch({
      resolve: (_host, _opts, cb) => cb(null, [{ address: ALLOWED, family: 4 }]),
      isAllowedAddress: (await import('../../src/utils/ssrf')).isPublicAddress,
    });
    await expect(rebinding(at('hook.example.com', '/'), OPTIONS)).rejects.toThrow(
      'hook.example.com resolves to a non-public address',
    );
  });
});

describe('safeFetch — requests and responses', () => {
  it('sends the method, headers and body', async () => {
    const res = await testFetch(at('hook.test', '/echo'), {
      ...OPTIONS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': 'abc' },
      body: '{"a":1}',
    });
    expect(JSON.parse(res.text)).toEqual({ method: 'POST', body: '{"a":1}', contentLength: '7' });
    expect(received.at(-1)?.headers['x-token']).toBe('abc');
  });

  it('reports non-2xx statuses without throwing', async () => {
    expect(await testFetch(at('hook.test', '/status/404'), OPTIONS)).toEqual({
      status: 404,
      ok: false,
      text: 'not here',
    });
  });

  it.each(['gzip', 'x-gzip', 'deflate', 'br'])('decompresses %s responses', async (encoding) => {
    expect((await testFetch(at('hook.test', `/encoded/${encoding}`), OPTIONS)).text).toBe('hello, compressed');
  });

  it('refuses responses larger than maxBytes', async () => {
    await expect(testFetch(at('hook.test', '/big'), { ...OPTIONS, maxBytes: 1024 })).rejects.toThrow(
      new OutboundRequestError('Response is larger than 1024 bytes'),
    );
  });

  it('applies maxBytes after decompression', async () => {
    await expect(testFetch(at('hook.test', '/gzip-bomb'), OPTIONS)).rejects.toBeInstanceOf(OutboundRequestError);
  });

  it('times out with a TimeoutError when there is no response', async () => {
    await expect(testFetch(at('hook.test', '/hang'), { ...OPTIONS, timeoutMs: 200 })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('times out with a TimeoutError when the body stalls', async () => {
    await expect(testFetch(at('hook.test', '/stall-body'), { ...OPTIONS, timeoutMs: 200 })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });
});

describe('safeFetch — redirects', () => {
  it('returns a 3xx response as is by default', async () => {
    const res = await testFetch(at('hook.test', '/redirect'), OPTIONS);
    expect(res.status).toBe(302);
    expect(res.ok).toBe(false);
  });

  it('follows redirects when allowed, as GET without the body', async () => {
    const res = await testFetch(at('hook.test', '/redirect'), {
      ...OPTIONS,
      method: 'POST',
      body: 'secret',
      maxRedirects: 3,
    });
    expect(JSON.parse(res.text)).toEqual({ method: 'GET', body: '', contentLength: null });
  });

  it('keeps credentials on a same-origin redirect and drops the body headers', async () => {
    await testFetch(at('hook.test', '/redirect'), {
      ...OPTIONS,
      method: 'POST',
      headers: { Authorization: 'Bearer t0k3n', 'Content-Type': 'application/json', 'X-Trace': '1' },
      body: '{}',
      maxRedirects: 3,
    });
    const followed = received.at(-1)!.headers;
    expect(followed).toMatchObject({ authorization: 'Bearer t0k3n', 'x-trace': '1' });
    expect(followed).not.toHaveProperty('content-type');
  });

  it('drops credentials on a redirect to another origin', async () => {
    const to = encodeURIComponent(at('other.test', '/echo'));
    await testFetch(at('hook.test', `/redirect?to=${to}`), {
      ...OPTIONS,
      headers: { Authorization: 'Bearer t0k3n', Cookie: 'sid=1', 'X-Trace': '1' },
      maxRedirects: 3,
    });
    const followed = received.at(-1)!;
    expect(followed.headers.host).toBe(`other.test:${port}`);
    expect(followed.headers).not.toHaveProperty('authorization');
    expect(followed.headers).not.toHaveProperty('cookie');
    expect(followed.headers['x-trace']).toBe('1');
  });

  it('follows a redirect to another allowed host', async () => {
    const to = encodeURIComponent(at('other.test', '/echo'));
    const res = await testFetch(at('hook.test', `/redirect?to=${to}`), { ...OPTIONS, maxRedirects: 3 });
    expect(res.status).toBe(200);
  });

  it.each([
    ['a host that resolves to a non-public address', () => at('internal.test', '/')],
    ['a non-public IP literal', () => `http://10.0.0.5:${port}/`],
    ['a private-network name', () => at('localhost', '/')],
    ['another protocol', () => 'file:///etc/passwd'],
  ])('refuses a redirect to %s', async (_label, target) => {
    const res = testFetch(at('hook.test', `/redirect?to=${encodeURIComponent(target())}`), {
      ...OPTIONS,
      maxRedirects: 3,
    });
    await expect(res).rejects.toBeInstanceOf(OutboundRequestError);
  });

  it('follows exactly maxRedirects redirects', async () => {
    expect((await testFetch(at('hook.test', '/chain?n=2'), { ...OPTIONS, maxRedirects: 2 })).text).toBe('ok');
    await expect(testFetch(at('hook.test', '/chain?n=3'), { ...OPTIONS, maxRedirects: 2 })).rejects.toThrow(
      new OutboundRequestError('More than 2 redirects'),
    );
  });

  it('stops after maxRedirects', async () => {
    await expect(testFetch(at('hook.test', '/loop'), { ...OPTIONS, maxRedirects: 2 })).rejects.toThrow(
      new OutboundRequestError('More than 2 redirects'),
    );
  });
});

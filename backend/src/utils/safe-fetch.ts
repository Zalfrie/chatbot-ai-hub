import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';
import type { Readable } from 'node:stream';
import { lookup as dnsLookup } from 'node:dns';
import {
  OutboundRequestError,
  createPublicOnlyLookup,
  isPublicAddress,
  validateOutboundUrl,
} from './ssrf.js';

/**
 * HTTP client for tenant-supplied URLs. Unlike fetch, it connects only to addresses that pass
 * the SSRF check (checked on the resolved address, at connection time), re-checks every
 * redirect hop, and caps the response size.
 */

export interface SafeFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** For the whole request, redirects included */
  timeoutMs: number;
  /** Largest response body, after decompression */
  maxBytes: number;
  /** Redirects to follow, each re-issued as GET without a body. With 0 a 3xx response is returned as is */
  maxRedirects?: number;
}

export interface SafeResponse {
  status: number;
  ok: boolean;
  text: string;
}

interface Policy {
  resolve: Parameters<typeof createPublicOnlyLookup>[0];
  isAllowedAddress: (address: string) => boolean;
}

const DECODERS: Record<string, () => NodeJS.ReadWriteStream> = {
  gzip: () => zlib.createGunzip(),
  'x-gzip': () => zlib.createGunzip(),
  deflate: () => zlib.createInflate(),
  br: () => zlib.createBrotliDecompress(),
};

const BODY_HEADERS = ['content-type', 'content-length'];
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

/** As fetch does: a redirect drops the body, and credentials go only to the origin they were for */
function redirectHeaders(headers: Record<string, string>, sameOrigin: boolean): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const lower = name.toLowerCase();
      return !BODY_HEADERS.includes(lower) && (sameOrigin || !CREDENTIAL_HEADERS.includes(lower));
    }),
  );
}

function send(
  url: URL,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; lookup: unknown },
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: init.method,
      headers: init.headers,
      signal: init.signal,
      // Every connection resolves the host through the SSRF check; IP literals were checked before
      lookup: init.lookup as http.RequestOptions['lookup'],
      agent: false,
    }, resolve);
    req.on('error', reject);
    req.end(init.body); // with the whole body here, Node sets Content-Length
  });
}

async function readBody(res: http.IncomingMessage, maxBytes: number): Promise<string> {
  const decoder = DECODERS[String(res.headers['content-encoding'] ?? '').trim().toLowerCase()];
  const stream: Readable = decoder ? (pipeline(res, decoder(), () => {}) as unknown as Readable) : res;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      res.destroy();
      throw new OutboundRequestError(`Response is larger than ${maxBytes} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createSafeFetch(policy: Policy = { resolve: dnsLookup, isAllowedAddress: isPublicAddress }) {
  const lookup = createPublicOnlyLookup(policy.resolve, policy.isAllowedAddress);

  /** Rejects with a TimeoutError (the signal's reason) when timeoutMs runs out, wherever the request is */
  return async function safeFetch(url: string, options: SafeFetchOptions): Promise<SafeResponse> {
    const signal = AbortSignal.timeout(options.timeoutMs);
    try {
      return await request(url, options, signal);
    } catch (err) {
      // A timeout while reading the body surfaces as a reset socket; report it as the timeout it is
      if (signal.aborted) throw signal.reason;
      throw err;
    }
  };

  async function request(url: string, options: SafeFetchOptions, signal: AbortSignal): Promise<SafeResponse> {
    const maxRedirects = options.maxRedirects ?? 0;
    let target = url;
    let method: string = options.method ?? 'GET';
    let headers = options.headers ?? {};
    let body = options.body;

    for (let redirects = 0; ; redirects += 1) {
      const check = validateOutboundUrl(target, policy.isAllowedAddress);
      if (!check.valid) throw new OutboundRequestError(check.error ?? 'URL not allowed');

      const current = new URL(target);
      const res = await send(current, { method, headers, body, signal, lookup });
      const status = res.statusCode ?? 0;
      const location = res.headers.location;

      if (maxRedirects > 0 && status >= 300 && status < 400 && location) {
        res.resume();
        if (redirects >= maxRedirects) throw new OutboundRequestError(`More than ${maxRedirects} redirects`);
        const next = new URL(location, current);
        target = next.toString();
        headers = redirectHeaders(headers, next.origin === current.origin);
        method = 'GET';
        body = undefined;
        continue;
      }

      const text = await readBody(res, options.maxBytes);
      return { status, ok: status >= 200 && status < 300, text };
    }
  }
}

export const safeFetch = createSafeFetch();

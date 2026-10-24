import { describe, it, expect, vi } from 'vitest';
import type { LookupAddress } from 'node:dns';
import {
  OutboundRequestError,
  createPublicOnlyLookup,
  isPublicAddress,
  validateOutboundUrl,
} from '../../src/utils/ssrf';

describe('validateOutboundUrl', () => {
  // ── Valid URLs ─────────────────────────────────────────────────────────────
  it.each([
    'https://webhook.site/abc123',
    'http://api.example.com/hook',
    'https://8.8.8.8/hook',
    'http://172.15.0.1/hook', // just outside 172.16/12
    'http://172.32.0.1/hook', // just outside 172.16/12
    'https://[2606:4700:4700::1111]/hook',
    'https://example.com./hook', // trailing dot, still a public name
  ])('allows %s', (url) => {
    expect(validateOutboundUrl(url)).toEqual({ valid: true });
  });

  // ── Protocol blocks ────────────────────────────────────────────────────────
  it.each(['file:///etc/passwd', 'ftp://example.com/data', 'gopher://example.com/'])('blocks %s', (url) => {
    expect(validateOutboundUrl(url)).toMatchObject({ valid: false });
  });

  // ── Non-public IP literals, in every spelling the URL parser accepts ───────
  it.each([
    'http://127.0.0.1/hook',
    'http://127.99.0.1/hook',
    'http://0.0.0.0/hook',
    'http://10.0.0.1/hook',
    'http://10.255.255.255/hook',
    'http://172.16.0.1/hook',
    'http://172.31.255.255/hook',
    'http://192.168.1.1/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://100.100.100.200/latest/meta-data', // carrier-grade NAT range, used for metadata services
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://255.255.255.255/',
    'http://2130706433/', // decimal 127.0.0.1
    'http://0x7f.1/', // hex and short form of 127.0.0.1
    'http://0177.0.0.1/', // octal 127.0.0.1
    'http://[::1]/hook',
    'http://[::]/hook',
    'http://[::ffff:127.0.0.1]/', // IPv4-mapped
    'http://[::ffff:a9fe:a9fe]/', // IPv4-mapped 169.254.169.254
    'http://[64:ff9b::a9fe:a9fe]/', // NAT64 of 169.254.169.254
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
  ])('blocks %s', (url) => {
    expect(validateOutboundUrl(url)).toEqual({
      valid: false,
      error: 'URL cannot target a private, loopback or other non-public address',
    });
  });

  // ── Private-network names ──────────────────────────────────────────────────
  it.each([
    'http://localhost/hook',
    'http://LOCALHOST/hook',
    'http://localhost./hook',
    'http://api.localhost/hook',
    'http://metadata.google.internal/computeMetadata/v1',
    'http://db.internal/',
    'http://printer.local/',
    'http://router.home.arpa/',
    'http://intranet/', // no dot: resolved through the local search domain
  ])('blocks %s', (url) => {
    expect(validateOutboundUrl(url)).toEqual({ valid: false, error: 'URL must use a public host name' });
  });

  // ── Malformed URLs ─────────────────────────────────────────────────────────
  it.each(['not-a-url', ''])('rejects %j', (url) => {
    expect(validateOutboundUrl(url)).toEqual({ valid: false, error: 'Invalid URL format' });
  });

  it('checks IP literals with the given address policy', () => {
    const onlyLoopback = (ip: string) => ip === '127.0.0.1';
    expect(validateOutboundUrl('http://127.0.0.1:8080/', onlyLoopback)).toEqual({ valid: true });
    expect(validateOutboundUrl('http://8.8.8.8/', onlyLoopback)).toMatchObject({ valid: false });
  });
});

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.15.255.255',
    '100.63.255.255', // just below 100.64/10
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808', // NAT64 of 8.8.8.8
  ])('treats %s as public', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '192.0.0.1',
    '0.0.0.0',
    '::1',
    '::',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1', // NAT64 of 127.0.0.1
    '64:ff9b::10.0.0.1',
    '64:ff9b:1::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    '2001:db8::1',
    '2002:7f00:1::', // 6to4 of 127.0.0.1
    'ff02::1',
    'not-an-ip',
    '',
  ])('treats %j as non-public', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('createPublicOnlyLookup', () => {
  type Answer = LookupAddress[] | NodeJS.ErrnoException;

  function resolverFor(answer: Answer) {
    return vi.fn((_host: string, _opts: { all: true }, cb: (err: NodeJS.ErrnoException | null, a: LookupAddress[]) => void) => {
      if (answer instanceof Error) cb(answer, []);
      else cb(null, answer);
    });
  }

  function run(answer: Answer, options: { all?: boolean; family?: number | string }) {
    const resolve = resolverFor(answer);
    const lookup = createPublicOnlyLookup(resolve);
    return new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((done) => {
      lookup('hook.example.com', options, (err, address, family) => done({ err, address, family }));
    }).then((result) => ({ ...result, resolve }));
  }

  const v4 = { address: '93.184.216.34', family: 4 };
  const v6 = { address: '2606:2800:220:1::248', family: 6 };

  it('returns every address when asked for all of them', async () => {
    const { err, address, resolve } = await run([v4, v6], { all: true });
    expect(err).toBeNull();
    expect(address).toEqual([v4, v6]);
    expect(resolve).toHaveBeenCalledWith('hook.example.com', { all: true }, expect.any(Function));
  });

  it('returns the first address in the single-address shape', async () => {
    const { err, address, family } = await run([v4, v6], {});
    expect(err).toBeNull();
    expect(address).toBe(v4.address);
    expect(family).toBe(4);
  });

  it.each([
    [6, v6],
    ['IPv6', v6],
    [4, v4],
    ['IPv4', v4],
  ])('honors family %j', async (familyOption, expected) => {
    const { address } = await run([v4, v6], { family: familyOption });
    expect(address).toBe(expected.address);
  });

  it('refuses a host that resolves to a non-public address', async () => {
    const { err } = await run([{ address: '127.0.0.1', family: 4 }], { all: true });
    expect(err).toBeInstanceOf(OutboundRequestError);
    expect(err?.message).toBe('hook.example.com resolves to a non-public address');
  });

  it('refuses a host when any one of its addresses is non-public', async () => {
    const { err } = await run([v4, { address: '10.0.0.5', family: 4 }], { all: true });
    expect(err).toBeInstanceOf(OutboundRequestError);
  });

  it('refuses a host with no addresses', async () => {
    const { err } = await run([], { all: true });
    expect(err).toBeInstanceOf(OutboundRequestError);
    expect(err?.message).toBe('hook.example.com did not resolve to any address');
  });

  it('refuses when no address matches the requested family', async () => {
    const { err } = await run([v4], { family: 6 });
    expect(err).toBeInstanceOf(OutboundRequestError);
    expect(err?.message).toBe('hook.example.com has no IPv6 address');
  });

  it('passes resolver errors through', async () => {
    const notFound = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const { err } = await run(notFound, { all: true });
    expect(err).toBe(notFound);
  });
});

import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';

/**
 * SSRF protection for requests to tenant-supplied URLs (tool webhooks, knowledge import).
 *
 * validateOutboundUrl checks the URL text, so a bad URL is rejected when it is saved.
 * The check that counts happens when connecting: safeFetch (utils/safe-fetch.ts) resolves
 * the host through createPublicOnlyLookup and connects only to an address it has checked,
 * so DNS answers cannot change between the check and the connection.
 */

export class OutboundRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundRequestError';
  }
}

// IANA special-purpose address registries (RFC 6890 and updates). BlockList matches IPv4-mapped
// IPv6 addresses (::ffff:a.b.c.d) against the IPv4 rules, and ignores IPv6 zone indexes (%eth0).
const NON_PUBLIC = new BlockList();
const NON_PUBLIC_IPV4: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT, also used by cloud metadata services
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata services
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, limited broadcast
];
const NON_PUBLIC_IPV6: [string, number][] = [
  ['::', 96], // unspecified, loopback and IPv4-compatible
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments (Teredo, ORCHID, ...)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local
  ['ff00::', 8], // multicast
];
for (const [network, prefix] of NON_PUBLIC_IPV4) NON_PUBLIC.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of NON_PUBLIC_IPV6) NON_PUBLIC.addSubnet(network, prefix, 'ipv6');

// Host names that only exist on private networks
const NON_PUBLIC_HOSTNAMES = ['localhost', 'metadata.google.internal', 'metadata.gcp.internal', 'metadata.aws.internal'];
const NON_PUBLIC_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** The eight 16-bit groups of an IPv6 address, which may end in a dotted IPv4 address */
function ipv6Groups(ip: string): number[] {
  const dotted = ip.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const hex = dotted
    ? ip.slice(0, -dotted[0].length)
      + ((Number(dotted[1]) << 8) | Number(dotted[2])).toString(16) + ':'
      + ((Number(dotted[3]) << 8) | Number(dotted[4])).toString(16)
    : ip;
  const [head = '', tail] = hex.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const zeros = tail === undefined ? [] : Array<string>(8 - headGroups.length - tailGroups.length).fill('0');
  return [...headGroups, ...zeros, ...tailGroups].map((group) => parseInt(group, 16));
}

/** True for an IP address that is reachable on the public internet */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !NON_PUBLIC.check(ip, 'ipv4');
  if (family !== 6 || NON_PUBLIC.check(ip, 'ipv6')) return false;

  // NAT64 (64:ff9b::/96) reaches the IPv4 address in its last 32 bits
  const groups = ipv6Groups(ip);
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    const [high, low] = [groups[6]!, groups[7]!];
    return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return true;
}

/**
 * Checks the text of a URL that the backend will request: http(s) only, and no host that is
 * a non-public IP address or a private-network name. Host names are resolved and checked again
 * when connecting (see createPublicOnlyLookup).
 */
export function validateOutboundUrl(
  urlString: string,
  isAllowedAddress: (address: string) => boolean = isPublicAddress,
): { valid: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, error: 'Only http and https protocols are allowed' };
  }

  // "[::1]" → "::1", and "localhost." is the same host as "localhost" (URL has lowercased it)
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1').replace(/\.+$/, '');

  if (isIP(host)) {
    return isAllowedAddress(host)
      ? { valid: true }
      : { valid: false, error: 'URL cannot target a private, loopback or other non-public address' };
  }

  if (
    !host.includes('.')
    || NON_PUBLIC_HOSTNAMES.includes(host)
    || NON_PUBLIC_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return { valid: false, error: 'URL must use a public host name' };
  }

  return { valid: true };
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type Resolver = (
  hostname: string,
  options: { all: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/**
 * A `lookup` for http.request / net.connect that resolves the host and fails unless every
 * address it resolves to is allowed. Supports both callback shapes Node uses ({ all: true }
 * for happy eyeballs, a single address otherwise).
 */
export function createPublicOnlyLookup(
  resolve: Resolver = dnsLookup,
  isAllowedAddress: (address: string) => boolean = isPublicAddress,
) {
  return (hostname: string, options: { all?: boolean; family?: number | string }, callback: LookupCallback): void => {
    resolve(hostname, { all: true }, (err, resolved) => {
      if (err) {
        callback(err, '');
        return;
      }
      if (resolved.length === 0) {
        callback(new OutboundRequestError(`${hostname} did not resolve to any address`), '');
        return;
      }
      // One non-public answer is enough to refuse: the client might connect to any of them
      if (resolved.some((entry) => !isAllowedAddress(entry.address))) {
        callback(new OutboundRequestError(`${hostname} resolves to a non-public address`), '');
        return;
      }
      const family = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : Number(options.family ?? 0);
      const addresses = family ? resolved.filter((entry) => entry.family === family) : resolved;
      if (addresses.length === 0) {
        callback(new OutboundRequestError(`${hostname} has no IPv${family} address`), '');
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

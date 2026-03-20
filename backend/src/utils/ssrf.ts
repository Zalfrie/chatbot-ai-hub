/**
 * SSRF protection: validates that a webhook URL does not target
 * internal/private network addresses.
 *
 * Note: this performs syntactic IP checks only. It does NOT resolve
 * DNS names, so DNS-rebinding attacks are not fully prevented here.
 * For production hardening, add async DNS resolution before executing
 * the request.
 */
export function validateWebhookUrl(urlString: string): { valid: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow http / https
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Only http and https protocols are allowed' };
  }

  const host = url.hostname.toLowerCase();

  // Block bare localhost / unspecified
  if (host === 'localhost' || host === '0.0.0.0') {
    return { valid: false, error: 'Webhook URL cannot target localhost or unspecified addresses' };
  }

  // Block IPv6 loopback
  if (host === '::1' || host === '[::1]') {
    return { valid: false, error: 'Webhook URL cannot target loopback addresses' };
  }

  // Block cloud-internal metadata endpoints
  const blockedHostnames = [
    'metadata.google.internal',
    'metadata.gcp.internal',
    'metadata.aws.internal',
  ];
  if (blockedHostnames.includes(host)) {
    return { valid: false, error: 'Webhook URL cannot target cloud metadata endpoints' };
  }

  // Check IPv4 private / reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];

    if (a === 127) {
      return { valid: false, error: 'Webhook URL cannot target loopback addresses' };
    }
    if (a === 0) {
      return { valid: false, error: 'Webhook URL cannot target reserved addresses' };
    }
    if (a === 10) {
      return { valid: false, error: 'Webhook URL cannot target private network addresses' };
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return { valid: false, error: 'Webhook URL cannot target private network addresses' };
    }
    if (a === 192 && b === 168) {
      return { valid: false, error: 'Webhook URL cannot target private network addresses' };
    }
    if (a === 169 && b === 254) {
      return { valid: false, error: 'Webhook URL cannot target link-local / metadata addresses' };
    }
  }

  return { valid: true };
}

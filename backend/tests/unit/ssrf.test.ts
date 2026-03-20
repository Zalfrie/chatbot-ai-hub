import { describe, it, expect } from 'vitest';
import { validateWebhookUrl } from '../../src/utils/ssrf';

describe('validateWebhookUrl', () => {
  // ── Valid URLs ─────────────────────────────────────────────────────────────
  it('allows a public HTTPS URL', () => {
    expect(validateWebhookUrl('https://webhook.site/abc123')).toMatchObject({ valid: true });
  });

  it('allows a public HTTP URL', () => {
    expect(validateWebhookUrl('http://api.example.com/hook')).toMatchObject({ valid: true });
  });

  it('allows a public IP URL', () => {
    // 8.8.8.8 is a public IP
    expect(validateWebhookUrl('https://8.8.8.8/hook')).toMatchObject({ valid: true });
  });

  // ── Protocol blocks ────────────────────────────────────────────────────────
  it('blocks file:// protocol', () => {
    expect(validateWebhookUrl('file:///etc/passwd')).toMatchObject({ valid: false });
  });

  it('blocks ftp:// protocol', () => {
    expect(validateWebhookUrl('ftp://example.com/data')).toMatchObject({ valid: false });
  });

  // ── Localhost blocks ───────────────────────────────────────────────────────
  it('blocks localhost', () => {
    expect(validateWebhookUrl('http://localhost/hook')).toMatchObject({ valid: false });
  });

  it('blocks 127.0.0.1 (IPv4 loopback)', () => {
    expect(validateWebhookUrl('http://127.0.0.1/hook')).toMatchObject({ valid: false });
  });

  it('blocks 127.x.x.x range', () => {
    expect(validateWebhookUrl('http://127.99.0.1/hook')).toMatchObject({ valid: false });
  });

  it('blocks ::1 (IPv6 loopback)', () => {
    expect(validateWebhookUrl('http://[::1]/hook')).toMatchObject({ valid: false });
  });

  it('blocks 0.0.0.0', () => {
    expect(validateWebhookUrl('http://0.0.0.0/hook')).toMatchObject({ valid: false });
  });

  // ── Private range blocks ───────────────────────────────────────────────────
  it('blocks 10.0.0.1 (10/8 private)', () => {
    expect(validateWebhookUrl('http://10.0.0.1/hook')).toMatchObject({ valid: false });
  });

  it('blocks 10.255.255.255 (10/8 private)', () => {
    expect(validateWebhookUrl('http://10.255.255.255/hook')).toMatchObject({ valid: false });
  });

  it('blocks 192.168.1.1 (192.168/16 private)', () => {
    expect(validateWebhookUrl('http://192.168.1.1/hook')).toMatchObject({ valid: false });
  });

  it('blocks 172.16.0.1 (172.16/12 private)', () => {
    expect(validateWebhookUrl('http://172.16.0.1/hook')).toMatchObject({ valid: false });
  });

  it('blocks 172.31.255.255 (172.16/12 boundary)', () => {
    expect(validateWebhookUrl('http://172.31.255.255/hook')).toMatchObject({ valid: false });
  });

  it('allows 172.15.0.1 (just outside 172.16/12)', () => {
    expect(validateWebhookUrl('http://172.15.0.1/hook')).toMatchObject({ valid: true });
  });

  it('allows 172.32.0.1 (just outside 172.16/12)', () => {
    expect(validateWebhookUrl('http://172.32.0.1/hook')).toMatchObject({ valid: true });
  });

  // ── Link-local / metadata blocks ───────────────────────────────────────────
  it('blocks 169.254.169.254 (AWS instance metadata)', () => {
    expect(validateWebhookUrl('http://169.254.169.254/latest/meta-data')).toMatchObject({ valid: false });
  });

  it('blocks metadata.google.internal', () => {
    expect(validateWebhookUrl('http://metadata.google.internal/computeMetadata/v1')).toMatchObject({ valid: false });
  });

  // ── Malformed URLs ─────────────────────────────────────────────────────────
  it('rejects malformed URL', () => {
    expect(validateWebhookUrl('not-a-url')).toMatchObject({ valid: false });
  });

  it('rejects empty string', () => {
    expect(validateWebhookUrl('')).toMatchObject({ valid: false });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor } from '../../../src/modules/tools/tool.executor';
import type { TenantTool } from '../../../src/modules/tools/tool.types';
import { OutboundRequestError } from '../../../src/utils/ssrf';

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock('../../../src/utils/safe-fetch', () => ({ safeFetch }));

const baseTool: TenantTool = {
  id: 1,
  clientId: 1,
  name: 'cek_stok_kue',
  description: 'Cek stok kue',
  parametersSchema: { type: 'object', properties: { nama_produk: { type: 'string' } }, required: ['nama_produk'] },
  webhookUrl: 'https://webhook.example.com/tool',
  httpMethod: 'POST',
  headersTemplate: null,
  timeoutMs: 5000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function respond(status: number, text: string) {
  safeFetch.mockResolvedValue({ status, ok: status >= 200 && status < 300, text });
}

function namedError(name: string) {
  return Object.assign(new Error('The operation was aborted'), { name });
}

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    safeFetch.mockReset();
    executor = new ToolExecutor();
  });

  it('returns result from successful JSON response (result field)', async () => {
    respond(200, JSON.stringify({ result: 'Stok tersedia: 3 loyang' }));

    const result = await executor.execute(baseTool, { nama_produk: 'Red Velvet' }, 1);
    expect(result).toBe('Stok tersedia: 3 loyang');
  });

  it('returns raw text if response is not JSON with result field', async () => {
    respond(200, 'Stok: 5 loyang');

    const result = await executor.execute(baseTool, { nama_produk: 'Coklat' }, 1);
    expect(result).toBe('Stok: 5 loyang');
  });

  it('returns error message on HTTP 500', async () => {
    respond(500, 'Internal Server Error');

    const result = await executor.execute(baseTool, { nama_produk: 'Vanilla' }, 1);
    expect(result).toContain('gagal dengan status 500');
  });

  it.each(['TimeoutError', 'AbortError'])('returns timeout error message on %s', async (name) => {
    safeFetch.mockRejectedValue(namedError(name));

    const fastTool = { ...baseTool, timeoutMs: 100 };
    const result = await executor.execute(fastTool, { nama_produk: 'Taro' }, 1);
    expect(result).toContain('timeout 100ms');
    expect(result).toContain('cek_stok_kue');
  });

  it('returns error message on network error', async () => {
    safeFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await executor.execute(baseTool, { nama_produk: 'Matcha' }, 1);
    expect(result).toBe('Tool cek_stok_kue error: ECONNREFUSED');
  });

  it('returns error message when the webhook leads to a non-public address', async () => {
    safeFetch.mockRejectedValue(new OutboundRequestError('webhook.example.com resolves to a non-public address'));

    const result = await executor.execute(baseTool, { nama_produk: 'Matcha' }, 1);
    expect(result).toBe('Tool cek_stok_kue error: webhook.example.com resolves to a non-public address');
  });

  it('POSTs the payload with the header template, without following redirects', async () => {
    respond(200, 'OK');
    const tool = { ...baseTool, headersTemplate: { Authorization: 'Bearer t0k3n' } };

    await executor.execute(tool, { nama_produk: 'Keju' }, 7);

    const [url, options] = safeFetch.mock.calls[0]!;
    expect(url).toBe('https://webhook.example.com/tool');
    expect(options).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t0k3n' },
      timeoutMs: 5000,
      maxBytes: 256 * 1024,
    });
    expect(options.maxRedirects ?? 0).toBe(0);
    expect(JSON.parse(options.body)).toMatchObject({ tool_name: 'cek_stok_kue', args: { nama_produk: 'Keju' }, client_id: 7 });
  });

  it('caps the timeout at 10 seconds', async () => {
    respond(200, 'OK');

    await executor.execute({ ...baseTool, timeoutMs: 60_000 }, {}, 1);
    expect(safeFetch.mock.calls[0]![1].timeoutMs).toBe(10_000);
  });

  it('handles GET method — appends args as query params', async () => {
    respond(200, JSON.stringify({ result: 'OK' }));

    const getTool = { ...baseTool, httpMethod: 'GET' as const };
    await executor.execute(getTool, { nama_produk: 'Pandan' }, 1);

    const [url, options] = safeFetch.mock.calls[0]!;
    expect(url).toBe('https://webhook.example.com/tool?nama_produk=Pandan');
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
    expect(options.headers).not.toHaveProperty('Content-Type');
  });

  it('keeps the query string the webhook URL already has', async () => {
    respond(200, 'OK');

    const getTool = { ...baseTool, httpMethod: 'GET' as const, webhookUrl: 'https://webhook.example.com/tool?key=abc' };
    await executor.execute(getTool, { nama_produk: 'Kue Lapis', jumlah: 2 }, 1);

    expect(safeFetch.mock.calls[0]![0]).toBe('https://webhook.example.com/tool?key=abc&nama_produk=Kue+Lapis&jumlah=2');
  });
});

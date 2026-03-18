import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolExecutor } from '../../../src/modules/tools/tool.executor';
import type { TenantTool } from '../../../src/modules/tools/tool.types';

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

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor();
  });

  it('returns result from successful JSON response (result field)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result: 'Stok tersedia: 3 loyang' }),
    } as Response);

    const result = await executor.execute(baseTool, { nama_produk: 'Red Velvet' }, 1);
    expect(result).toBe('Stok tersedia: 3 loyang');
  });

  it('returns raw text if response is not JSON with result field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'Stok: 5 loyang',
    } as Response);

    const result = await executor.execute(baseTool, { nama_produk: 'Coklat' }, 1);
    expect(result).toBe('Stok: 5 loyang');
  });

  it('returns error message on HTTP 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    const result = await executor.execute(baseTool, { nama_produk: 'Vanilla' }, 1);
    expect(result).toContain('gagal dengan status 500');
  });

  it('returns timeout error message when fetch is aborted', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        const err = new Error('The operation was aborted');
        (err as NodeJS.ErrnoException & { name: string }).name = 'AbortError';
        reject(err);
      });
    });

    const fastTool = { ...baseTool, timeoutMs: 100 };
    const result = await executor.execute(fastTool, { nama_produk: 'Taro' }, 1);
    expect(result).toContain('timeout');
    expect(result).toContain('cek_stok_kue');
  });

  it('returns error message on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await executor.execute(baseTool, { nama_produk: 'Matcha' }, 1);
    expect(result).toContain('error');
  });

  it('handles GET method — appends args as query params', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: 'OK' }),
      });
    });

    const getTool = { ...baseTool, httpMethod: 'GET' as const };
    await executor.execute(getTool, { nama_produk: 'Pandan' }, 1);
    expect(capturedUrl).toContain('nama_produk=Pandan');
  });
});

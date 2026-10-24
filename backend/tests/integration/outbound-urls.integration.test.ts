/**
 * The routes that store or fetch tenant-supplied URLs (tool webhooks, knowledge import)
 * refuse non-public targets. The connection-time check itself is covered in safe-fetch.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-jwt-secret-for-vitest-at-least-32-chars';

const { mockDb, crawlUrl, toolRepository } = vi.hoisted(() => {
  const chain: Record<string, unknown> = {};
  for (const m of ['values', 'returning']) chain[m] = () => chain;
  chain['then'] = (ok: (v: unknown) => unknown) => Promise.resolve([{ id: 11, clientId: 1, title: 'Menu' }]).then(ok);
  return {
    mockDb: { insert: vi.fn(() => chain) },
    crawlUrl: vi.fn(),
    toolRepository: { create: vi.fn(), update: vi.fn(), findByClientId: vi.fn() },
  };
});

vi.mock('../../src/config/env', () => ({
  env: { NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-for-vitest-at-least-32-chars' },
  isProduction: false,
  isTest: true,
  isDevelopment: false,
}));
vi.mock('../../src/config/database', () => ({ db: mockDb }));
vi.mock('../../src/modules/knowledge/crawler.service', () => ({ crawlerService: { crawlUrl } }));
vi.mock('../../src/modules/knowledge/importer.service', () => ({ importerService: {} }));
vi.mock('../../src/modules/knowledge/knowledge.repository', () => ({ knowledgeRepository: {} }));
vi.mock('../../src/providers/ai/pinecone.service', () => ({
  getPineconeService: () => ({ upsertChunks: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('../../src/modules/tools/tool.repository', () => ({ toolRepository }));
vi.mock('../../src/modules/tools/tool.service', () => ({ toolService: { testTool: vi.fn() } }));

import knowledgeRoutes from '../../src/modules/knowledge/knowledge.routes';
import toolRoutes from '../../src/modules/tools/tool.routes';
import { OutboundRequestError } from '../../src/utils/ssrf';

const app = express();
app.use(express.json());
app.use('/api/clients/:clientId/knowledge', knowledgeRoutes);
app.use('/api/clients/:clientId/tools', toolRoutes);

const auth = { Authorization: `Bearer ${jwt.sign({ adminId: 1, role: 'superadmin' }, TEST_SECRET)}` };

const tool = {
  name: 'cek_stok',
  description: 'Cek stok kue di toko',
  parameters_schema: { type: 'object' },
};

const NON_PUBLIC_URLS = [
  'http://127.0.0.1:8080/hook',
  'http://localhost/hook',
  'http://169.254.169.254/latest/meta-data',
  'http://[::ffff:10.0.0.1]/',
  'http://2130706433/',
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tool webhook URLs', () => {
  it.each(NON_PUBLIC_URLS)('POST refuses %s', async (url) => {
    const res = await request(app).post('/api/clients/1/tools').set(auth).send({ ...tool, webhook_url: url });

    expect(res.status).toBe(400);
    expect(res.body.message.webhook_url).toHaveLength(1);
    expect(toolRepository.create).not.toHaveBeenCalled();
  });

  it('PUT refuses a non-public webhook URL', async () => {
    const res = await request(app).put('/api/clients/1/tools/5').set(auth).send({ webhook_url: 'http://10.1.2.3/' });

    expect(res.status).toBe(400);
    expect(toolRepository.update).not.toHaveBeenCalled();
  });

  it('POST accepts a public webhook URL', async () => {
    toolRepository.create.mockResolvedValue({ id: 5 });

    const res = await request(app)
      .post('/api/clients/1/tools')
      .set(auth)
      .send({ ...tool, webhook_url: 'https://hooks.example.com/stok' });

    expect(res.status).toBe(201);
    expect(toolRepository.create).toHaveBeenCalledWith(expect.objectContaining({ webhookUrl: 'https://hooks.example.com/stok' }));
  });
});

describe('POST /knowledge/import/url', () => {
  const importUrl = (url: string) =>
    request(app).post('/api/clients/1/knowledge/import/url').set(auth).send({ url, title: 'Menu' });

  it.each(NON_PUBLIC_URLS)('refuses %s without fetching it', async (url) => {
    const res = await importUrl(url);

    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.url).toHaveLength(1);
    expect(crawlUrl).not.toHaveBeenCalled();
  });

  it('returns 422 when the URL leads to a non-public address', async () => {
    crawlUrl.mockRejectedValue(new OutboundRequestError('toko.example.com resolves to a non-public address'));

    const res = await importUrl('https://toko.example.com/menu');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'URL cannot be imported',
      detail: 'toko.example.com resolves to a non-public address',
    });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('still returns 500 for other crawl failures', async () => {
    crawlUrl.mockRejectedValue(new Error('Failed to fetch URL: 503'));

    const res = await importUrl('https://toko.example.com/menu');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to crawl URL');
  });

  it('imports the page of a public URL', async () => {
    crawlUrl.mockResolvedValue('Kue lapis tersedia setiap hari di Toko Kue Laris Manis, buka jam 8 pagi.');

    const res = await importUrl('https://toko.example.com/menu');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 11, sourceUrl: 'https://toko.example.com/menu' });
    expect(crawlUrl).toHaveBeenCalledWith('https://toko.example.com/menu');
  });
});

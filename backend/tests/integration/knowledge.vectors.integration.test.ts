/**
 * Knowledge changes must keep the Pinecone vectors in line with the database:
 * only active entries have vectors, and failures are logged instead of swallowed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-jwt-secret-for-vitest-at-least-32-chars';

vi.mock('../../src/config/env', () => ({
  env: { NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-for-vitest-at-least-32-chars' },
  isProduction: false,
  isTest: true,
  isDevelopment: false,
}));

// Every db call resolves to the next queued result; chain methods return the same thenable
const { mockDb, dbResults } = vi.hoisted(() => {
  const dbResults: unknown[] = [];
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve(dbResults.shift() ?? []).then(ok, fail),
    };
    for (const m of ['from', 'where', 'orderBy', 'limit', 'set', 'values', 'returning']) c[m] = () => c;
    return c;
  };
  return { mockDb: { select: chain, insert: chain, update: chain, delete: chain }, dbResults };
});
vi.mock('../../src/config/database', () => ({ db: mockDb }));

const { mockRepo, mockPinecone, pinecone } = vi.hoisted(() => ({
  mockRepo: {
    findById: vi.fn(),
    findAllByClient: vi.fn(),
    findActiveByClient: vi.fn(),
    updateEmbedStatus: vi.fn(),
    resetEmbedStatus: vi.fn(),
  },
  mockPinecone: {
    upsertChunks: vi.fn(),
    deleteByKnowledge: vi.fn(),
    deleteByClient: vi.fn(),
    search: vi.fn(),
  },
  pinecone: { configured: true },
}));
vi.mock('../../src/modules/knowledge/knowledge.repository', () => ({ knowledgeRepository: mockRepo }));
vi.mock('../../src/providers/ai/pinecone.service', () => ({
  getPineconeService: () => mockPinecone,
  isPineconeConfigured: () => pinecone.configured,
}));

import knowledgeRoutes from '../../src/modules/knowledge/knowledge.routes';
import clientRoutes from '../../src/modules/client/client.routes';
import { logger } from '../../src/utils/logger';

const app = express();
app.use(express.json());
app.use('/api/clients/:clientId/knowledge', knowledgeRoutes);
app.use('/api/clients', clientRoutes);

const auth = (role = 'admin') => ({ Authorization: `Bearer ${jwt.sign({ adminId: 1, role }, TEST_SECRET)}` });

// The chunker keeps chunks of at least 50 characters
const text = (s: string) => `${s}, tersedia setiap hari, pesan sebelum jam dua belas siang.`;
const ENTRY = { id: 10, clientId: 1, title: 'Harga', content: text('Kue lapis Rp25.000'), isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  dbResults.length = 0;
  pinecone.configured = true;
  vi.spyOn(logger, 'error').mockImplementation(() => logger);
  mockPinecone.upsertChunks.mockResolvedValue(undefined);
  mockPinecone.deleteByKnowledge.mockResolvedValue(undefined);
  mockPinecone.deleteByClient.mockResolvedValue(undefined);
  mockRepo.findById.mockResolvedValue(ENTRY);
  mockRepo.updateEmbedStatus.mockResolvedValue(undefined);
  mockRepo.resetEmbedStatus.mockResolvedValue(undefined);
});

// ────────────────────────────────────────────────────────────────────────────

describe('PUT /api/clients/:clientId/knowledge/:kid', () => {
  it('replaces the vectors with ones for the new content, deleting first', async () => {
    dbResults.push([{ ...ENTRY, content: text('Kue lapis Rp30.000') }]);
    mockRepo.findById.mockResolvedValue({ ...ENTRY, content: text('Kue lapis Rp30.000') });

    const res = await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ content: text('Kue lapis Rp30.000') });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mockPinecone.upsertChunks).toHaveBeenCalled());
    expect(mockPinecone.deleteByKnowledge).toHaveBeenCalledWith(1, 10);
    expect(mockPinecone.deleteByKnowledge.mock.invocationCallOrder[0])
      .toBeLessThan(mockPinecone.upsertChunks.mock.invocationCallOrder[0]!);
    expect(mockPinecone.upsertChunks.mock.calls[0]![0]).toMatchObject({
      clientId: 1, knowledgeId: 10, chunks: [{ content: text('Kue lapis Rp30.000'), chunkIndex: 0 }],
    });
  });

  it('removes the vectors of an entry that is disabled', async () => {
    dbResults.push([{ ...ENTRY, isActive: false }]);
    mockRepo.findById.mockResolvedValue({ ...ENTRY, isActive: false });

    const res = await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ isActive: false });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mockRepo.resetEmbedStatus).toHaveBeenCalledWith(10));
    expect(mockPinecone.deleteByKnowledge).toHaveBeenCalledWith(1, 10);
    expect(mockPinecone.upsertChunks).not.toHaveBeenCalled();
  });

  it('embeds an entry again when it is re-enabled', async () => {
    dbResults.push([ENTRY]);

    await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ isActive: true });

    await vi.waitFor(() => expect(mockPinecone.upsertChunks).toHaveBeenCalled());
  });

  it('leaves the vectors alone when neither content nor active state changes', async () => {
    dbResults.push([{ ...ENTRY, title: 'Daftar harga' }]);

    await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ title: 'Daftar harga' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockPinecone.deleteByKnowledge).not.toHaveBeenCalled();
    expect(mockPinecone.upsertChunks).not.toHaveBeenCalled();
  });

  it('runs two quick edits of one entry one after the other', async () => {
    let releaseFirstDelete!: () => void;
    mockPinecone.deleteByKnowledge
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirstDelete = resolve; }))
      .mockResolvedValue(undefined);
    dbResults.push([ENTRY], [ENTRY]);

    await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ content: text('versi 1') });
    await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ content: text('versi 2') });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The second sync has not started while the first is still deleting
    expect(mockPinecone.deleteByKnowledge).toHaveBeenCalledTimes(1);
    releaseFirstDelete();
    await vi.waitFor(() => expect(mockPinecone.upsertChunks).toHaveBeenCalledTimes(2));
    expect(mockPinecone.deleteByKnowledge).toHaveBeenCalledTimes(2);
  });

  it('logs a failed sync instead of swallowing it', async () => {
    dbResults.push([ENTRY]);
    mockPinecone.deleteByKnowledge.mockRejectedValue(new Error('Pinecone down'));

    const res = await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ content: text('baru') });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      'Knowledge vector sync failed',
      expect.objectContaining({ clientId: 1, knowledgeId: 10, error: 'Pinecone down' }),
    ));
  });

  it('skips vector work when Pinecone is not configured', async () => {
    pinecone.configured = false;
    dbResults.push([ENTRY]);

    const res = await request(app).put('/api/clients/1/knowledge/10').set(auth()).send({ content: text('baru') });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(res.status).toBe(200);
    expect(mockPinecone.deleteByKnowledge).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/clients/:clientId/knowledge/:kid', () => {
  it('deletes the entry\'s vectors', async () => {
    dbResults.push([ENTRY]);
    mockRepo.findById.mockResolvedValue(undefined);

    const res = await request(app).delete('/api/clients/1/knowledge/10').set(auth());

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mockPinecone.deleteByKnowledge).toHaveBeenCalledWith(1, 10));
    expect(mockPinecone.upsertChunks).not.toHaveBeenCalled();
  });
});

describe('POST /api/clients/:clientId/knowledge', () => {
  it('does not embed an entry created as inactive', async () => {
    dbResults.push([{ ...ENTRY, isActive: false }], []);

    const res = await request(app).post('/api/clients/1/knowledge').set(auth())
      .send({ title: 'Harga', content: ENTRY.content, isActive: false });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(res.status).toBe(201);
    expect(mockPinecone.upsertChunks).not.toHaveBeenCalled();
  });

  it('logs a failed embedding instead of swallowing it', async () => {
    dbResults.push([ENTRY], []);
    mockPinecone.upsertChunks.mockRejectedValue(new Error('quota exceeded'));

    await request(app).post('/api/clients/1/knowledge').set(auth()).send({ title: 'Harga', content: ENTRY.content });

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      'Knowledge vector sync failed',
      expect.objectContaining({ knowledgeId: 10, error: 'quota exceeded' }),
    ));
  });
});

describe('POST /api/clients/:clientId/knowledge/reindex', () => {
  it('clears the client\'s vectors, then embeds only the active entries', async () => {
    mockRepo.findAllByClient.mockResolvedValue([
      ENTRY,
      { id: 11, clientId: 1, title: 'Lama', content: 'Promo lama', isActive: false },
    ]);

    const res = await request(app).post('/api/clients/1/knowledge/reindex').set(auth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reindexed: 1, totalChunks: 1 });
    expect(mockPinecone.deleteByClient).toHaveBeenCalledWith(1);
    expect(mockPinecone.upsertChunks).toHaveBeenCalledTimes(1);
    expect(mockPinecone.upsertChunks.mock.calls[0]![0]).toMatchObject({ knowledgeId: 10 });
    expect(mockRepo.resetEmbedStatus).toHaveBeenCalledWith(11);
  });

  it('fails instead of re-embedding on top of vectors it could not clear', async () => {
    mockRepo.findAllByClient.mockResolvedValue([ENTRY]);
    mockPinecone.deleteByClient.mockRejectedValue(new Error('Pinecone down'));

    const res = await request(app).post('/api/clients/1/knowledge/reindex').set(auth());

    expect(res.status).toBe(500);
    expect(mockPinecone.upsertChunks).not.toHaveBeenCalled();
  });
});

describe('GET /api/clients/:clientId/knowledge/search', () => {
  it('searches only the client\'s active entries', async () => {
    mockRepo.findActiveByClient.mockResolvedValue([ENTRY]);
    mockPinecone.search.mockResolvedValue([]);

    await request(app).get('/api/clients/1/knowledge/search?q=harga').set(auth());

    expect(mockPinecone.search).toHaveBeenCalledWith(expect.objectContaining({ clientId: 1, knowledgeIds: [10] }));
  });
});

describe('DELETE /api/clients/:id', () => {
  it('deletes the client\'s vectors', async () => {
    dbResults.push([{ id: 1 }]);

    const res = await request(app).delete('/api/clients/1').set(auth('superadmin'));

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mockPinecone.deleteByClient).toHaveBeenCalledWith(1));
  });

  it('logs a failed vector delete without failing the request', async () => {
    dbResults.push([{ id: 1 }]);
    mockPinecone.deleteByClient.mockRejectedValue(new Error('Pinecone down'));

    const res = await request(app).delete('/api/clients/1').set(auth('superadmin'));

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ clientId: 1, error: 'Pinecone down' }),
    ));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock variables so they are available before vi.mock() factory runs
// ---------------------------------------------------------------------------
const { mockUpsertRecords, mockSearchRecords, mockDeleteMany } = vi.hoisted(() => ({
  mockUpsertRecords: vi.fn().mockResolvedValue(undefined),
  mockSearchRecords: vi.fn(),
  mockDeleteMany: vi.fn().mockResolvedValue(undefined),
}));

// Pinecone is constructed with `new`, so the mock uses `function`, not an arrow
vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn().mockImplementation(function () {
    return {
      index: vi.fn().mockReturnValue({
        upsertRecords: mockUpsertRecords,
        searchRecords: mockSearchRecords,
        deleteMany: mockDeleteMany,
      }),
    };
  }),
}));

// Import AFTER mock is registered
import { PineconeService } from '../../src/providers/ai/pinecone.service';

// ---------------------------------------------------------------------------

describe('PineconeService', () => {
  let svc: PineconeService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply defaults after clearAllMocks
    mockUpsertRecords.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue(undefined);
    process.env['PINECONE_API_KEY'] = 'test-key';
    process.env['PINECONE_INDEX'] = 'chatbot-hub';
    svc = new PineconeService();
  });

  // -------------------------------------------------------------------------
  describe('upsertChunks', () => {
    it('calls upsertRecords with the correct record shape', async () => {
      await svc.upsertChunks({
        clientId: 1,
        knowledgeId: 10,
        chunks: [
          { content: 'Kue lapis harga 25000', chunkIndex: 0 },
          { content: 'Tersedia setiap hari Senin sampai Sabtu', chunkIndex: 1 },
        ],
      });

      expect(mockUpsertRecords).toHaveBeenCalledOnce();
      // upsertRecords is called with UpsertRecordsOptions: { records: [...] }
      const opts = mockUpsertRecords.mock.calls[0][0] as { records: unknown[] };

      expect(opts.records).toHaveLength(2);
      expect(opts.records[0]).toMatchObject({
        id: 'client_1_kb_10_chunk_0',
        text: 'Kue lapis harga 25000',
        clientId: 1,
        knowledgeId: 10,
        chunkIndex: 0,
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('search', () => {
    it('returns hits above the 0.6 score threshold', async () => {
      mockSearchRecords.mockResolvedValue({
        result: {
          hits: [
            { _id: 'hit-1', _score: 0.92, fields: { text: 'Harga kue lapis 25000', knowledgeId: 10 } },
            { _id: 'hit-2', _score: 0.55, fields: { text: 'Kami buka jam 8', knowledgeId: 11 } }, // below threshold
          ],
        },
      });

      const results = await svc.search({ clientId: 1, knowledgeIds: [10, 11], query: 'harga kue', topK: 3 });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ content: 'Harga kue lapis 25000', score: 0.92, knowledgeId: 10 });
    });

    it('filters on the tenant and on its active entries (inside query)', async () => {
      mockSearchRecords.mockResolvedValue({ result: { hits: [] } });

      await svc.search({ clientId: 42, knowledgeIds: [7, 8], query: 'test', topK: 3 });

      const callArg = mockSearchRecords.mock.calls[0][0] as Record<string, unknown>;
      // filter is nested inside query per SearchRecordsOptions type
      const query = callArg['query'] as Record<string, unknown>;
      expect(query['filter']).toEqual({ clientId: { $eq: 42 }, knowledgeId: { $in: [7, 8] } });
    });

    it('returns empty array when no hits', async () => {
      mockSearchRecords.mockResolvedValue({ result: { hits: [] } });

      const results = await svc.search({ clientId: 1, knowledgeIds: [10], query: 'xyz', topK: 3 });
      expect(results).toHaveLength(0);
    });

    it('defaults topK to 3', async () => {
      mockSearchRecords.mockResolvedValue({ result: { hits: [] } });

      await svc.search({ clientId: 1, knowledgeIds: [10], query: 'test' });

      const callArg = mockSearchRecords.mock.calls[0][0] as { query: { topK: number } };
      expect(callArg.query.topK).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  describe('deleteByKnowledge', () => {
    // The SDK takes { ids } or { filter }; a bare filter object is rejected before any request
    it('calls deleteMany with the filter under `filter`', async () => {
      await svc.deleteByKnowledge(1, 10);

      expect(mockDeleteMany).toHaveBeenCalledOnce();
      expect(mockDeleteMany.mock.calls[0][0]).toEqual({
        filter: { clientId: { $eq: 1 }, knowledgeId: { $eq: 10 } },
      });
    });

    it('lets a failed delete reach the caller', async () => {
      mockDeleteMany.mockRejectedValueOnce(new Error('Pinecone down'));
      await expect(svc.deleteByKnowledge(1, 10)).rejects.toThrow('Pinecone down');
    });
  });

  // -------------------------------------------------------------------------
  describe('deleteByClient', () => {
    it('calls deleteMany with clientId filter', async () => {
      await svc.deleteByClient(5);

      expect(mockDeleteMany).toHaveBeenCalledOnce();
      expect(mockDeleteMany.mock.calls[0][0]).toEqual({ filter: { clientId: { $eq: 5 } } });
    });

    // Reindex must not re-embed on top of vectors it could not clear
    it('lets a failed delete reach the caller', async () => {
      mockDeleteMany.mockRejectedValueOnce(new Error('Pinecone down'));
      await expect(svc.deleteByClient(5)).rejects.toThrow('Pinecone down');
    });
  });
});

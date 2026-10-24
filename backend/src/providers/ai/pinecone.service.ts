import { Pinecone } from '@pinecone-database/pinecone';

export interface RagChunk {
  content: string;
  score: number;
  knowledgeId: number;
}

export class PineconeService {
  private client: Pinecone;
  private indexName: string;

  constructor() {
    this.client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    this.indexName = process.env.PINECONE_INDEX!;
  }

  private get index() {
    return this.client.index(this.indexName);
  }

  /**
   * Upsert text chunks into Pinecone.
   * The index uses multilingual-e5-large integrated embedding —
   * we send text directly; Pinecone handles the vectorization.
   */
  async upsertChunks(params: {
    clientId: number;
    knowledgeId: number;
    chunks: { content: string; chunkIndex: number }[];
  }): Promise<void> {
    await this.index.upsertRecords({
      records: params.chunks.map((chunk) => ({
        id: `client_${params.clientId}_kb_${params.knowledgeId}_chunk_${chunk.chunkIndex}`,
        text: chunk.content,
        clientId: params.clientId,
        knowledgeId: params.knowledgeId,
        chunkIndex: chunk.chunkIndex,
      })),
    });
  }

  /**
   * Search for the top-K most relevant chunks for a query.
   * Filter is applied inside the query to isolate per clientId (multi-tenant), and to the
   * given knowledge entries so chunks of deleted or disabled entries are never returned.
   */
  async search(params: {
    clientId: number;
    knowledgeIds: number[];
    query: string;
    topK?: number;
  }): Promise<RagChunk[]> {
    const response = await this.index.searchRecords({
      query: {
        topK: params.topK ?? 3,
        filter: {
          clientId: { $eq: params.clientId },
          knowledgeId: { $in: params.knowledgeIds },
        },
        inputs: { text: params.query },
      },
      fields: ['text', 'clientId', 'knowledgeId', 'chunkIndex'],
    });

    const SCORE_THRESHOLD = 0.6;

    return response.result.hits
      .filter((hit) => (hit._score ?? 0) >= SCORE_THRESHOLD)
      .map((hit) => {
        const fields = hit.fields as Record<string, unknown>;
        return {
          content: (fields['text'] as string) ?? '',
          score: hit._score ?? 0,
          knowledgeId: Number(fields['knowledgeId']),
        };
      });
  }

  /**
   * Delete all chunks belonging to a specific knowledge entry.
   * Call this before re-embedding on update. Throws if Pinecone rejects the delete.
   */
  async deleteByKnowledge(clientId: number, knowledgeId: number): Promise<void> {
    await this.index.deleteMany({
      filter: {
        clientId: { $eq: clientId },
        knowledgeId: { $eq: knowledgeId },
      },
    });
  }

  /**
   * Delete all chunks for a client (used during reindex or client deletion).
   * Throws if Pinecone rejects the delete.
   */
  async deleteByClient(clientId: number): Promise<void> {
    await this.index.deleteMany({
      filter: { clientId: { $eq: clientId } },
    });
  }
}

/** RAG is optional: without Pinecone the chat service uses the knowledge entries directly */
export function isPineconeConfigured(): boolean {
  return Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX);
}

// Lazy singleton — deferred until first use so tests without PINECONE_API_KEY don't fail at import time
let _pineconeService: PineconeService | null = null;
export function getPineconeService(): PineconeService {
  if (!_pineconeService) _pineconeService = new PineconeService();
  return _pineconeService;
}

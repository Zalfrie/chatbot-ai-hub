import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database';
import { knowledgeBases, KnowledgeBase } from '../../db/schema';

export class KnowledgeRepository {
  async findActiveByClient(clientId: number): Promise<KnowledgeBase[]> {
    return db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.clientId, clientId), eq(knowledgeBases.isActive, true)))
      .orderBy(desc(knowledgeBases.priority));
  }

  async findAllByClient(clientId: number): Promise<KnowledgeBase[]> {
    return db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.clientId, clientId));
  }

  async findById(id: number, clientId: number): Promise<KnowledgeBase | undefined> {
    const [row] = await db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.clientId, clientId)));
    return row;
  }

  async updateEmbedStatus(knowledgeId: number, chunkCount: number): Promise<void> {
    await db
      .update(knowledgeBases)
      .set({
        isEmbedded: true,
        embeddedAt: new Date(),
        chunkCount: chunkCount as unknown as number,
      })
      .where(eq(knowledgeBases.id, knowledgeId));
  }

  async resetEmbedStatus(knowledgeId: number): Promise<void> {
    await db
      .update(knowledgeBases)
      .set({ isEmbedded: false, chunkCount: 0 })
      .where(eq(knowledgeBases.id, knowledgeId));
  }
}

export const knowledgeRepository = new KnowledgeRepository();

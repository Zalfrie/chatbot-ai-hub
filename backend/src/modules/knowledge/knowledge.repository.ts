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
}

export const knowledgeRepository = new KnowledgeRepository();

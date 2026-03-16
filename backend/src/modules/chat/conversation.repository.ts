import { eq, asc, and, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { conversations, messages, usageLogs, Conversation, Message } from '../../db/schema';

export interface CreateConversationParams {
  clientId: number;
  chatbotId: number;
  sessionId: string;
  channel: 'web' | 'whatsapp';
  userIdentifier: string;
  userName?: string;
}

export class ConversationRepository {
  async findBySessionId(sessionId: string): Promise<Conversation | null> {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))
      .limit(1);
    return conv ?? null;
  }

  async create(params: CreateConversationParams): Promise<Conversation> {
    const [conv] = await db
      .insert(conversations)
      .values({
        clientId: params.clientId,
        chatbotId: params.chatbotId,
        sessionId: params.sessionId,
        channel: params.channel,
        userIdentifier: params.userIdentifier,
        userName: params.userName,
      })
      .returning();
    return conv!;
  }

  async updateLastMessageAt(conversationId: number): Promise<void> {
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  async getHistory(conversationId: number, limit = 20): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
  }

  async saveMessage(params: {
    conversationId: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokensUsed?: number;
    waMessageId?: string;
  }): Promise<Message> {
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        tokensUsed: params.tokensUsed,
        waMessageId: params.waMessageId,
      })
      .returning();
    return msg!;
  }
}

export class UsageRepository {
  async increment(clientId: number, channel: 'web' | 'whatsapp', tokensUsed = 0): Promise<void> {
    const today = new Date().toISOString().split('T')[0]!;
    await db
      .insert(usageLogs)
      .values({
        clientId,
        logDate: today,
        channel,
        messageCount: 1,
        tokenCount: tokensUsed,
      })
      .onConflictDoUpdate({
        target: [usageLogs.clientId, usageLogs.logDate, usageLogs.channel],
        set: {
          messageCount: sql`${usageLogs.messageCount} + 1`,
          tokenCount: sql`${usageLogs.tokenCount} + ${tokensUsed}`,
        },
      });
  }
}

export const conversationRepository = new ConversationRepository();
export const usageRepository = new UsageRepository();

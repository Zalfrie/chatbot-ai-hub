import { eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { chatbots, Chatbot } from '../../db/schema';

export class ChatbotRepository {
  async findByClientId(clientId: number): Promise<Chatbot | null> {
    const [chatbot] = await db
      .select()
      .from(chatbots)
      .where(eq(chatbots.clientId, clientId))
      .limit(1);
    return chatbot ?? null;
  }
}

export const chatbotRepository = new ChatbotRepository();

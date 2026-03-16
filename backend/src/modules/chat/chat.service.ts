import { redis } from '../../config/redis';
import { AIProvider, ChatMessage } from '../../providers/ai/ai.interface';
import { createAIProvider } from '../../providers/ai/ai.factory';
import { buildSystemPrompt } from '../../utils/prompt-builder';
import { ChatbotRepository } from '../chatbot/chatbot.repository';
import { KnowledgeRepository } from '../knowledge/knowledge.repository';
import { ConversationRepository, UsageRepository } from './conversation.repository';

export interface ProcessMessageParams {
  clientId: number;
  sessionId: string;
  channel: 'web' | 'whatsapp';
  userMessage: string;
  userIdentifier: string;
  userName?: string;
}

export interface ProcessMessageResult {
  reply: string;
  sessionId: string;
  conversationId: number;
}

const HISTORY_CACHE_TTL = 60 * 30; // 30 minutes
const MAX_HISTORY_MESSAGES = 20;

export class ChatService {
  constructor(
    private readonly chatbotRepo: ChatbotRepository,
    private readonly knowledgeRepo: KnowledgeRepository,
    private readonly convRepo: ConversationRepository,
    private readonly usageRepo: UsageRepository,
    private readonly aiProvider?: AIProvider, // injectable for testing
  ) {}

  async processMessage(params: ProcessMessageParams): Promise<ProcessMessageResult> {
    // 1. Load chatbot config
    const chatbot = await this.chatbotRepo.findByClientId(params.clientId);
    if (!chatbot) {
      throw new Error(`Chatbot not found for client ${params.clientId}`);
    }

    // 2. Load knowledge base
    const knowledge = await this.knowledgeRepo.findActiveByClient(params.clientId);

    // 3. Get or create conversation
    const conversation = await this.getOrCreateConversation(params, chatbot.id);

    // 4. Load conversation history (Redis → DB fallback)
    const history = await this.loadHistory(conversation.id);

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(chatbot.systemPrompt, knowledge);

    // 6. Call AI provider
    const provider = this.aiProvider ?? await createAIProvider(
      (chatbot.aiProvider as 'groq' | 'claude') ?? 'groq',
    );

    const aiResponse = await provider.chat({
      model: chatbot.aiModel ?? 'llama-3.3-70b-versatile',
      temperature: parseFloat(String(chatbot.temperature ?? 0.85)),
      maxTokens: chatbot.maxTokens ?? 1000,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: params.userMessage }],
    });

    // 7. Save messages to DB
    await this.convRepo.saveMessage({
      conversationId: conversation.id,
      role: 'user',
      content: params.userMessage,
    });

    await this.convRepo.saveMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: aiResponse.content,
      tokensUsed: aiResponse.tokensUsed,
    });

    // Update conversation timestamp
    await this.convRepo.updateLastMessageAt(conversation.id);

    // Invalidate Redis cache so next load fetches fresh from DB
    await redis.del(this.historyKey(conversation.id));

    // 8. Update usage log
    await this.usageRepo.increment(params.clientId, params.channel, aiResponse.tokensUsed);

    return {
      reply: aiResponse.content,
      sessionId: conversation.sessionId,
      conversationId: conversation.id,
    };
  }

  private async getOrCreateConversation(
    params: ProcessMessageParams,
    chatbotId: number,
  ) {
    const existing = await this.convRepo.findBySessionId(params.sessionId);
    if (existing) return existing;

    return this.convRepo.create({
      clientId: params.clientId,
      chatbotId,
      sessionId: params.sessionId,
      channel: params.channel,
      userIdentifier: params.userIdentifier,
      userName: params.userName,
    });
  }

  private async loadHistory(conversationId: number): Promise<ChatMessage[]> {
    const cacheKey = this.historyKey(conversationId);
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as ChatMessage[];
    }

    // Fallback: load from DB
    const dbMessages = await this.convRepo.getHistory(conversationId, MAX_HISTORY_MESSAGES);

    const history: ChatMessage[] = dbMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Cache for next request
    if (history.length > 0) {
      await redis.set(cacheKey, JSON.stringify(history), 'EX', HISTORY_CACHE_TTL);
    }

    return history;
  }

  private historyKey(conversationId: number): string {
    return `chat:history:${conversationId}`;
  }
}

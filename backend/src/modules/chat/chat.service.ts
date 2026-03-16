import { redis } from '../../config/redis';
import { AIProvider, ChatMessage } from '../../providers/ai/ai.interface';
import { createAIProvider } from '../../providers/ai/ai.factory';
import { buildSystemPrompt } from '../../utils/prompt-builder';
import { ChatbotRepository } from '../chatbot/chatbot.repository';
import { KnowledgeRepository } from '../knowledge/knowledge.repository';
import { ConversationRepository, UsageRepository } from './conversation.repository';
import { PineconeService, getPineconeService } from '../../providers/ai/pinecone.service';

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
    private readonly pinecone?: PineconeService, // injectable for testing
  ) {}

  async processMessage(params: ProcessMessageParams): Promise<ProcessMessageResult> {
    // 1. Load chatbot config
    const chatbot = await this.chatbotRepo.findByClientId(params.clientId);
    if (!chatbot) {
      throw new Error(`Chatbot not found for client ${params.clientId}`);
    }

    // 2. Load relevant knowledge via RAG (Pinecone) with fallback to full knowledge base
    let knowledge: { title: string; content: string; priority?: number | null; id: number; isActive: boolean | null }[] = [];
    try {
      const pc = this.pinecone ?? getPineconeService();
      const ragChunks = await pc.search({
        clientId: params.clientId,
        query: params.userMessage,
        topK: 3,
      });

      if (ragChunks.length > 0) {
        // Map RAG chunks into a shape compatible with buildSystemPrompt
        knowledge = ragChunks.map((chunk, i) => ({
          id: i,
          title: `Relevant Info ${i + 1}`,
          content: chunk.content,
          priority: null,
          isActive: true,
        }));
      } else {
        // Fallback: load full knowledge base if no RAG results
        knowledge = await this.knowledgeRepo.findActiveByClient(params.clientId);
      }
    } catch {
      // If Pinecone is unavailable, fall back gracefully
      knowledge = await this.knowledgeRepo.findActiveByClient(params.clientId);
    }

    // 3. Get or create conversation
    const conversation = await this.getOrCreateConversation(params, chatbot.id);

    // 4. Load conversation history (Redis → DB fallback)
    const history = await this.loadHistory(conversation.id);

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(chatbot.systemPrompt, knowledge);

    // 6. Call AI provider (with fallback chain on rate-limit errors)
    const chatRequest = {
      model: chatbot.aiModel ?? 'llama-3.1-8b-instant',
      temperature: parseFloat(String(chatbot.temperature ?? 0.85)),
      maxTokens: chatbot.maxTokens ?? 1000,
      system: systemPrompt,
      messages: [...history, { role: 'user' as const, content: params.userMessage }],
    };

    // Fallback order: configured provider → llama-3.1-8b-instant (groq) → gemini-2.0-flash
    const FALLBACK_CHAIN: Array<{ provider: 'groq' | 'claude' | 'gemini'; model: string }> = [
      { provider: (chatbot.aiProvider as 'groq' | 'claude' | 'gemini') ?? 'groq', model: chatRequest.model },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
      { provider: 'gemini', model: 'gemini-2.0-flash' },
    ];

    let aiResponse = null;
    let lastError: unknown;

    for (const fallback of FALLBACK_CHAIN) {
      // Skip if same as already-tried combo
      if (aiResponse) break;
      try {
        const provider = this.aiProvider ?? await createAIProvider(fallback.provider);
        aiResponse = await provider.chat({ ...chatRequest, model: fallback.model });
      } catch (err) {
        const msg = String(err);
        const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('limit');
        lastError = err;
        if (!isRateLimit) throw err; // Non-rate-limit errors propagate immediately
      }
    }

    if (!aiResponse) throw lastError;

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

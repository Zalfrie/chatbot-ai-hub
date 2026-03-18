import { redis } from '../../config/redis';
import { AIProvider, ChatMessage, MessageContentPart } from '../../providers/ai/ai.interface';
import { createAIProvider } from '../../providers/ai/ai.factory';
import { buildSystemPrompt } from '../../utils/prompt-builder';
import { ChatbotRepository } from '../chatbot/chatbot.repository';
import { KnowledgeRepository } from '../knowledge/knowledge.repository';
import { ConversationRepository, UsageRepository } from './conversation.repository';
import { PineconeService, getPineconeService } from '../../providers/ai/pinecone.service';
import { toolRepository } from '../tools/tool.repository';
import { toolService } from '../tools/tool.service';
import { ToolExecutionResult } from '../tools/tool.types';
import { logger } from '../../utils/logger';

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

export type SSEEvent =
  | { type: 'session'; session_id: string }
  | { type: 'chunk'; content: string }
  | { type: 'tool_call'; tool_name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool_name: string; result: string }
  | { type: 'done'; tokens_used: number }
  | { type: 'error'; message: string };

const HISTORY_CACHE_TTL = 60 * 30; // 30 minutes
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_ITERATIONS = 5;

export class ChatService {
  constructor(
    private readonly chatbotRepo: ChatbotRepository,
    private readonly knowledgeRepo: KnowledgeRepository,
    private readonly convRepo: ConversationRepository,
    private readonly usageRepo: UsageRepository,
    private readonly aiProvider?: AIProvider,
    private readonly pinecone?: PineconeService,
  ) {}

  async processMessage(params: ProcessMessageParams): Promise<ProcessMessageResult> {
    // 1. Load chatbot config
    const chatbot = await this.chatbotRepo.findByClientId(params.clientId);
    if (!chatbot) {
      throw new Error(`Chatbot not found for client ${params.clientId}`);
    }

    // 2. Load relevant knowledge via RAG (Pinecone) with fallback
    const knowledge = await this.loadKnowledge(params.clientId, params.userMessage);

    // 3. Get or create conversation
    const conversation = await this.getOrCreateConversation(params, chatbot.id);

    // 4. Load conversation history (Redis → DB fallback)
    const history = await this.loadHistory(conversation.id);

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(chatbot.systemPrompt, knowledge);

    const chatRequest = {
      model: chatbot.aiModel ?? 'llama-3.1-8b-instant',
      temperature: parseFloat(String(chatbot.temperature ?? 0.85)),
      maxTokens: chatbot.maxTokens ?? 1000,
      system: systemPrompt,
      messages: [...history, { role: 'user' as const, content: params.userMessage }],
    };

    const FALLBACK_CHAIN: Array<{ provider: 'groq' | 'claude' | 'gemini'; model: string }> = [
      { provider: (chatbot.aiProvider as 'groq' | 'claude' | 'gemini') ?? 'groq', model: chatRequest.model },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
      { provider: 'gemini', model: 'gemini-2.0-flash' },
    ];

    let finalReply: string;
    let tokensUsed: number;

    // 6a. If tools_enabled, use agentic loop
    if (chatbot.toolsEnabled) {
      const provider = this.aiProvider ?? await createAIProvider(
        (chatbot.aiProvider as 'groq' | 'claude' | 'gemini') ?? 'groq',
      );
      finalReply = await this.agenticLoop(
        provider,
        { ...chatRequest },
        params.clientId,
      );
      tokensUsed = Math.ceil((systemPrompt.length + params.userMessage.length + finalReply.length) / 4);
    } else {
      // 6b. Regular call with fallback chain
      let aiResponse = null;
      let lastError: unknown;

      for (const fallback of FALLBACK_CHAIN) {
        if (aiResponse) break;
        try {
          const provider = this.aiProvider ?? await createAIProvider(fallback.provider);
          aiResponse = await provider.chat({ ...chatRequest, model: fallback.model });
        } catch (err) {
          const msg = String(err);
          const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('limit');
          lastError = err;
          if (!isRateLimit) throw err;
        }
      }

      if (!aiResponse) throw lastError;
      finalReply = aiResponse.content;
      tokensUsed = aiResponse.tokensUsed;
    }

    // 7. Save messages to DB
    await this.convRepo.saveMessage({
      conversationId: conversation.id,
      role: 'user',
      content: params.userMessage,
    });

    await this.convRepo.saveMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: finalReply,
      tokensUsed,
    });

    await this.convRepo.updateLastMessageAt(conversation.id);
    await redis.del(this.historyKey(conversation.id));

    // 8. Update usage log
    await this.usageRepo.increment(params.clientId, params.channel, tokensUsed);

    return {
      reply: finalReply,
      sessionId: conversation.sessionId,
      conversationId: conversation.id,
    };
  }

  /**
   * Agentic loop: calls the AI provider repeatedly until no more tool calls or max iterations.
   */
  private async agenticLoop(
    provider: AIProvider,
    baseRequest: Omit<ReturnType<typeof Object.assign>, never> & {
      model: string;
      temperature: number;
      maxTokens: number;
      system: string;
      messages: ChatMessage[];
    },
    clientId: number,
  ): Promise<string> {
    const toolDefs = await toolService.getToolDefinitions(clientId);
    let messages: ChatMessage[] = [...baseRequest.messages];
    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      const response = await provider.chat({
        ...baseRequest,
        messages,
        tools: toolDefs.length ? toolDefs : undefined,
      });

      // No tool calls → we have the final answer
      if (!response.toolCalls?.length) {
        return response.content || 'Maaf, tidak bisa memproses permintaan saat ini.';
      }

      // Execute all requested tools
      const toolResults = await toolService.executeAll(response.toolCalls, clientId);

      // Append the assistant's tool_use response
      messages.push({
        role: 'assistant',
        content: response.toolCalls.map((tc) => ({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.name,
          input: tc.args,
        })),
      });

      // Append tool results as a user message
      messages.push({
        role: 'user',
        content: toolResults.map((tr) => ({
          type: 'tool_result' as const,
          tool_use_id: tr.toolCallId,
          content: tr.result,
        })),
      });

      iteration++;
    }

    logger.warn(`Agentic loop reached max iterations (${MAX_TOOL_ITERATIONS}) for client ${clientId}`);
    return 'Maaf, tidak bisa memproses permintaan saat ini.';
  }

  async *processMessageStream(params: ProcessMessageParams): AsyncGenerator<SSEEvent> {
    // 1. Load chatbot config
    const chatbot = await this.chatbotRepo.findByClientId(params.clientId);
    if (!chatbot) {
      yield { type: 'error', message: `Chatbot not found for client ${params.clientId}` };
      return;
    }

    // 2. Load knowledge
    const knowledge = await this.loadKnowledge(params.clientId, params.userMessage);

    // 3. Get or create conversation
    const conversation = await this.getOrCreateConversation(params, chatbot.id);

    // 4. Load history
    const history = await this.loadHistory(conversation.id);

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(chatbot.systemPrompt, knowledge);

    yield { type: 'session', session_id: conversation.sessionId };

    const chatRequest = {
      model: chatbot.aiModel ?? 'llama-3.1-8b-instant',
      temperature: parseFloat(String(chatbot.temperature ?? 0.85)),
      maxTokens: chatbot.maxTokens ?? 1000,
      system: systemPrompt,
      messages: [...history, { role: 'user' as const, content: params.userMessage }],
    };

    let fullContent = '';

    if (chatbot.toolsEnabled) {
      // Agentic streaming loop — non-streaming tool calls, then stream final answer
      try {
        const provider = this.aiProvider ?? await createAIProvider(
          (chatbot.aiProvider as 'groq' | 'claude' | 'gemini') ?? 'groq',
        );

        const toolDefs = await toolService.getToolDefinitions(params.clientId);
        let messages: ChatMessage[] = [...chatRequest.messages];
        let iteration = 0;

        while (iteration < MAX_TOOL_ITERATIONS) {
          const response = await provider.chat({
            ...chatRequest,
            messages,
            tools: toolDefs.length ? toolDefs : undefined,
          });

          if (!response.toolCalls?.length) {
            // Stream the final text answer
            for (const char of response.content) {
              fullContent += char;
              yield { type: 'chunk', content: char };
            }
            break;
          }

          // Emit tool_call events to the client
          for (const tc of response.toolCalls) {
            yield { type: 'tool_call', tool_name: tc.name, args: tc.args };
          }

          // Execute tools
          const toolResults = await toolService.executeAll(response.toolCalls, params.clientId);

          // Emit tool_result events
          for (const tr of toolResults) {
            yield { type: 'tool_result', tool_name: tr.toolName, result: tr.result };
          }

          // Append to messages for next iteration
          messages.push({
            role: 'assistant',
            content: response.toolCalls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.args,
            })),
          });

          messages.push({
            role: 'user',
            content: toolResults.map((tr) => ({
              type: 'tool_result' as const,
              tool_use_id: tr.toolCallId,
              content: tr.result,
            })),
          });

          iteration++;
        }

        if (iteration >= MAX_TOOL_ITERATIONS && !fullContent) {
          const fallback = 'Maaf, tidak bisa memproses permintaan saat ini.';
          fullContent = fallback;
          yield { type: 'chunk', content: fallback };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI provider error';
        yield { type: 'error', message: msg };
        return;
      }
    } else {
      // Regular streaming
      try {
        const provider = this.aiProvider ?? await createAIProvider(
          (chatbot.aiProvider as 'groq' | 'claude' | 'gemini') ?? 'groq',
        );

        for await (const chunk of provider.chatStream(chatRequest)) {
          fullContent += chunk;
          yield { type: 'chunk', content: chunk };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI provider error';
        yield { type: 'error', message: msg };
        return;
      }
    }

    // Save messages
    await this.convRepo.saveMessage({ conversationId: conversation.id, role: 'user', content: params.userMessage });

    const tokensUsed = Math.ceil(
      (systemPrompt.length + params.userMessage.length + fullContent.length) / 4,
    );

    await this.convRepo.saveMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: fullContent,
      tokensUsed,
    });

    await this.convRepo.updateLastMessageAt(conversation.id);
    await redis.del(this.historyKey(conversation.id));
    await this.usageRepo.increment(params.clientId, params.channel, tokensUsed);

    yield { type: 'done', tokens_used: tokensUsed };
  }

  private async loadKnowledge(clientId: number, query: string) {
    let knowledge: { title: string; content: string; priority?: number | null; id: number; isActive: boolean | null }[] = [];
    try {
      const pc = this.pinecone ?? getPineconeService();
      const ragChunks = await pc.search({ clientId, query, topK: 3 });

      if (ragChunks.length > 0) {
        knowledge = ragChunks.map((chunk, i) => ({
          id: i,
          title: `Relevant Info ${i + 1}`,
          content: chunk.content,
          priority: null,
          isActive: true,
        }));
      } else {
        knowledge = await this.knowledgeRepo.findActiveByClient(clientId);
      }
    } catch {
      knowledge = await this.knowledgeRepo.findActiveByClient(clientId);
    }
    return knowledge;
  }

  private async getOrCreateConversation(params: ProcessMessageParams, chatbotId: number) {
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

    const dbMessages = await this.convRepo.getHistory(conversationId, MAX_HISTORY_MESSAGES);

    const history: ChatMessage[] = dbMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    if (history.length > 0) {
      await redis.set(cacheKey, JSON.stringify(history), 'EX', HISTORY_CACHE_TTL);
    }

    return history;
  }

  private historyKey(conversationId: number): string {
    return `chat:history:${conversationId}`;
  }
}

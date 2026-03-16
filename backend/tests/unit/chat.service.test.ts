import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../../src/modules/chat/chat.service';
import type { ChatbotRepository } from '../../src/modules/chatbot/chatbot.repository';
import type { KnowledgeRepository } from '../../src/modules/knowledge/knowledge.repository';
import type {
  ConversationRepository,
  UsageRepository,
} from '../../src/modules/chat/conversation.repository';
import type { AIProvider } from '../../src/providers/ai/ai.interface';

// --- Module mocks (hoisted before imports) ---

vi.mock('../../src/config/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../src/providers/ai/ai.factory', () => ({
  createAIProvider: vi.fn(),
}));

vi.mock('../../src/providers/ai/pinecone.service', () => ({
  PineconeService: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue([]),
    upsertChunks: vi.fn().mockResolvedValue(undefined),
    deleteByKnowledge: vi.fn().mockResolvedValue(undefined),
    deleteByClient: vi.fn().mockResolvedValue(undefined),
  })),
  pineconeService: {
    search: vi.fn().mockResolvedValue([]),
  },
}));

// --- Fixtures ---

const mockChatbot = {
  id: 10,
  clientId: 1,
  name: 'Bot Kue',
  systemPrompt: 'Kamu asisten toko kue.',
  aiProvider: 'groq',
  aiModel: 'llama-3.3-70b-versatile',
  temperature: '0.85',
  maxTokens: 1000,
  isActive: true,
};

const mockConversation = {
  id: 50,
  clientId: 1,
  chatbotId: 10,
  sessionId: 'sess-test-abc',
  channel: 'web',
  userIdentifier: 'sess-test-abc',
};

const mockAIProvider: AIProvider = {
  chat: vi.fn().mockResolvedValue({
    content: 'Halo! Ada yang bisa saya bantu?',
    tokensUsed: 70,
    model: 'llama-3.3-70b-versatile',
  }),
};

const baseParams = {
  clientId: 1,
  sessionId: 'sess-test-abc',
  channel: 'web' as const,
  userMessage: 'Apa saja produk yang tersedia?',
  userIdentifier: 'sess-test-abc',
};

// --- Helper to build dependency mocks ---

function makeDeps(
  overrides: {
    chatbotRepo?: Partial<ChatbotRepository>;
    knowledgeRepo?: Partial<KnowledgeRepository>;
    convRepo?: Partial<ConversationRepository>;
    usageRepo?: Partial<UsageRepository>;
  } = {},
) {
  return {
    chatbotRepo: {
      findByClientId: vi.fn().mockResolvedValue(mockChatbot),
      ...overrides.chatbotRepo,
    } as unknown as ChatbotRepository,

    knowledgeRepo: {
      findActiveByClient: vi.fn().mockResolvedValue([]),
      ...overrides.knowledgeRepo,
    } as unknown as KnowledgeRepository,

    convRepo: {
      findBySessionId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(mockConversation),
      getHistory: vi.fn().mockResolvedValue([]),
      saveMessage: vi.fn().mockResolvedValue({ id: 99 }),
      updateLastMessageAt: vi.fn().mockResolvedValue(undefined),
      ...overrides.convRepo,
    } as unknown as ConversationRepository,

    usageRepo: {
      increment: vi.fn().mockResolvedValue(undefined),
      ...overrides.usageRepo,
    } as unknown as UsageRepository,
  };
}

describe('ChatService.processMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply defaults after clearAllMocks
    vi.mocked(mockAIProvider.chat).mockResolvedValue({
      content: 'Halo! Ada yang bisa saya bantu?',
      tokensUsed: 70,
      model: 'llama-3.3-70b-versatile',
    });
  });

  // ── Chatbot config ────────────────────────────────────────────────────────

  it('throws when chatbot is not found for the client', async () => {
    const deps = makeDeps({
      chatbotRepo: { findByClientId: vi.fn().mockResolvedValue(null) },
    });
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await expect(service.processMessage(baseParams)).rejects.toThrow(
      'Chatbot not found for client 1',
    );
  });

  // ── Conversation lifecycle ────────────────────────────────────────────────

  it('creates a new conversation when session does not exist', async () => {
    const deps = makeDeps();
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(deps.convRepo.findBySessionId).toHaveBeenCalledWith('sess-test-abc');
    expect(deps.convRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 1,
        chatbotId: 10,
        sessionId: 'sess-test-abc',
        channel: 'web',
      }),
    );
  });

  it('reuses existing conversation when session already exists', async () => {
    const deps = makeDeps({
      convRepo: { findBySessionId: vi.fn().mockResolvedValue(mockConversation) },
    });
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(deps.convRepo.create).not.toHaveBeenCalled();
  });

  // ── History loading ───────────────────────────────────────────────────────

  it('loads history from Redis cache when available (skips DB)', async () => {
    const { redis } = await import('../../src/config/redis');
    const cachedHistory = [{ role: 'user', content: 'halo' }];
    vi.mocked(redis.get).mockResolvedValueOnce(JSON.stringify(cachedHistory));

    const deps = makeDeps({
      convRepo: { findBySessionId: vi.fn().mockResolvedValue(mockConversation) },
    });
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(redis.get).toHaveBeenCalledWith('chat:history:50');
    expect(deps.convRepo.getHistory).not.toHaveBeenCalled();
  });

  it('falls back to DB history when Redis cache is empty', async () => {
    const { redis } = await import('../../src/config/redis');
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const dbMessages = [
      { id: 1, role: 'user', content: 'prev question', conversationId: 50, createdAt: new Date() },
    ];
    const deps = makeDeps({
      convRepo: {
        findBySessionId: vi.fn().mockResolvedValue(mockConversation),
        getHistory: vi.fn().mockResolvedValue(dbMessages),
      },
    });
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(deps.convRepo.getHistory).toHaveBeenCalledWith(50, 20);
  });

  it('caches DB history to Redis after loading from DB', async () => {
    const { redis } = await import('../../src/config/redis');
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const dbMessages = [
      { id: 1, role: 'user', content: 'hello', conversationId: 50, createdAt: new Date() },
    ];
    const deps = makeDeps({
      convRepo: {
        findBySessionId: vi.fn().mockResolvedValue(mockConversation),
        getHistory: vi.fn().mockResolvedValue(dbMessages),
      },
    });
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(redis.set).toHaveBeenCalledWith(
      'chat:history:50',
      expect.any(String),
      'EX',
      1800,
    );
  });

  // ── AI provider call ──────────────────────────────────────────────────────

  it('calls AI provider with the correct system prompt and user message', async () => {
    const deps = makeDeps();
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(mockAIProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Kamu asisten toko kue.'),
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Apa saja produk yang tersedia?' }),
        ]),
        model: 'llama-3.3-70b-versatile',
      }),
    );
  });

  // ── Message persistence ───────────────────────────────────────────────────

  it('saves user message then assistant message to DB', async () => {
    const deps = makeDeps();
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(deps.convRepo.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'Apa saja produk yang tersedia?' }),
    );
    expect(deps.convRepo.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', content: 'Halo! Ada yang bisa saya bantu?' }),
    );
    expect(deps.convRepo.saveMessage).toHaveBeenCalledTimes(2);
  });

  it('updates the conversation lastMessageAt timestamp', async () => {
    const deps = makeDeps();
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(deps.convRepo.updateLastMessageAt).toHaveBeenCalledWith(50);
  });

  it('invalidates the Redis history cache after saving messages', async () => {
    const { redis } = await import('../../src/config/redis');
    const deps = makeDeps();
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(redis.del).toHaveBeenCalledWith('chat:history:50');
  });

  // ── Usage logging ─────────────────────────────────────────────────────────

  it('increments usage log with correct clientId, channel, and token count', async () => {
    const deps = makeDeps();
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    await service.processMessage(baseParams);

    expect(deps.usageRepo.increment).toHaveBeenCalledWith(1, 'web', 70);
  });

  // ── Return value ──────────────────────────────────────────────────────────

  it('returns reply, sessionId, and conversationId', async () => {
    const deps = makeDeps();
    const service = new ChatService(
      deps.chatbotRepo, deps.knowledgeRepo, deps.convRepo, deps.usageRepo, mockAIProvider,
    );
    const result = await service.processMessage(baseParams);

    expect(result.reply).toBe('Halo! Ada yang bisa saya bantu?');
    expect(result.sessionId).toBe('sess-test-abc');
    expect(result.conversationId).toBe(50);
  });
});

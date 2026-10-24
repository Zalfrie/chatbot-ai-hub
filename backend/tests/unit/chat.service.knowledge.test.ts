import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../../src/modules/chat/chat.service';
import type { ChatbotRepository } from '../../src/modules/chatbot/chatbot.repository';
import type { KnowledgeRepository } from '../../src/modules/knowledge/knowledge.repository';
import type { ConversationRepository, UsageRepository } from '../../src/modules/chat/conversation.repository';
import type { AIProvider } from '../../src/providers/ai/ai.interface';
import type { PineconeService } from '../../src/providers/ai/pinecone.service';

vi.mock('../../src/config/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../src/providers/ai/ai.factory', () => ({ createAIProvider: vi.fn() }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHATBOT = { id: 10, clientId: 1, name: 'Bot Kue', systemPrompt: 'Kamu asisten toko kue.', aiProvider: 'groq', isActive: true };
const ACTIVE_ENTRIES = [
  { id: 1, clientId: 1, title: 'Harga', content: 'Kue lapis Rp25.000', priority: 5, isActive: true },
  { id: 2, clientId: 1, title: 'Jam buka', content: 'Buka jam 08.00-20.00', priority: 1, isActive: true },
];
const PARAMS = { clientId: 1, sessionId: 'sess-1', channel: 'web' as const, userMessage: 'Berapa harga kue lapis?', userIdentifier: 'sess-1' };

function makeService(options: { active?: unknown[]; search?: PineconeService['search'] }) {
  const knowledgeRepo = {
    findActiveByClient: vi.fn().mockResolvedValue(options.active ?? ACTIVE_ENTRIES),
  } as unknown as KnowledgeRepository;
  const pinecone = { search: vi.fn(options.search ?? (async () => [])) } as unknown as PineconeService;
  const ai = {
    chat: vi.fn().mockResolvedValue({ content: 'Rp25.000', tokensUsed: 10, model: 'test' }),
  } as unknown as AIProvider;
  const service = new ChatService(
    { findByClientId: vi.fn().mockResolvedValue(CHATBOT) } as unknown as ChatbotRepository,
    knowledgeRepo,
    {
      findBySessionId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 50, clientId: 1, channel: 'web' }),
      getHistory: vi.fn().mockResolvedValue([]),
      saveMessage: vi.fn().mockResolvedValue({ id: 99 }),
      updateLastMessageAt: vi.fn().mockResolvedValue(undefined),
    } as unknown as ConversationRepository,
    { increment: vi.fn().mockResolvedValue(undefined) } as unknown as UsageRepository,
    ai,
    pinecone,
  );
  const systemPrompt = () => vi.mocked(ai.chat).mock.calls[0]![0].system ?? '';
  return { service, pinecone, systemPrompt };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────

describe('ChatService knowledge retrieval', () => {
  it('searches only the tenant\'s active entries', async () => {
    const { service, pinecone } = makeService({});

    await service.processMessage(PARAMS);

    expect(pinecone.search).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 1, knowledgeIds: [1, 2], query: PARAMS.userMessage }),
    );
  });

  // Vectors of a deleted or disabled entry can outlive it if deleting them from Pinecone failed
  it('drops chunks whose entry is no longer active', async () => {
    const { service, systemPrompt } = makeService({
      search: async () => [
        { content: 'Kue lapis Rp25.000', score: 0.9, knowledgeId: 1 },
        { content: 'Promo lama: kue lapis Rp5.000', score: 0.95, knowledgeId: 99 },
      ],
    });

    await service.processMessage(PARAMS);

    expect(systemPrompt()).toContain('Kue lapis Rp25.000');
    expect(systemPrompt()).not.toContain('Promo lama');
  });

  it('uses the active entries themselves when no chunk survives', async () => {
    const { service, systemPrompt } = makeService({
      search: async () => [{ content: 'Promo lama: kue lapis Rp5.000', score: 0.95, knowledgeId: 99 }],
    });

    await service.processMessage(PARAMS);

    expect(systemPrompt()).toContain('Buka jam 08.00-20.00');
    expect(systemPrompt()).not.toContain('Promo lama');
  });

  it('uses the active entries themselves when vector search fails', async () => {
    const { service, systemPrompt } = makeService({
      search: async () => { throw new Error('Pinecone down'); },
    });

    await service.processMessage(PARAMS);

    expect(systemPrompt()).toContain('Kue lapis Rp25.000');
    expect(systemPrompt()).toContain('Buka jam 08.00-20.00');
  });

  it('does not search when the tenant has no active entries', async () => {
    const { service, pinecone, systemPrompt } = makeService({ active: [] });

    await service.processMessage(PARAMS);

    expect(pinecone.search).not.toHaveBeenCalled();
    expect(systemPrompt()).toContain('Kamu asisten toko kue.');
  });
});

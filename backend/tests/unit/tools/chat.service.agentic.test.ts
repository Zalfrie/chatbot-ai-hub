import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService, ProcessMessageParams } from '../../../src/modules/chat/chat.service';
import type { AIProvider, ChatRequest, ChatResponse } from '../../../src/providers/ai/ai.interface';

// ── Minimal mocks ─────────────────────────────────────────────────────────

const mockChatbot = {
  id: 1,
  clientId: 1,
  name: 'Kiki',
  systemPrompt: 'You are Kiki',
  welcomeMessage: 'Halo!',
  language: 'id',
  aiProvider: 'groq',
  aiModel: 'llama-3.1-8b-instant',
  temperature: '0.85',
  maxTokens: 1000,
  channel: 'both' as const,
  isActive: true,
  toolsEnabled: true, // <-- tools enabled
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockConversation = {
  id: 1,
  clientId: 1,
  chatbotId: 1,
  sessionId: 'test-session',
  channel: 'web' as const,
  userIdentifier: 'test-user',
  userName: null,
  waNumber: null,
  messageCount: 0,
  lastMessageAt: new Date().toISOString(),
  createdAt: new Date(),
};

const mockChatbotRepo = {
  findByClientId: vi.fn().mockResolvedValue(mockChatbot),
};

const mockKnowledgeRepo = {
  findActiveByClient: vi.fn().mockResolvedValue([]),
};

const mockConvRepo = {
  findBySessionId: vi.fn().mockResolvedValue(mockConversation),
  create: vi.fn().mockResolvedValue(mockConversation),
  saveMessage: vi.fn().mockResolvedValue(undefined),
  updateLastMessageAt: vi.fn().mockResolvedValue(undefined),
  getHistory: vi.fn().mockResolvedValue([]),
};

const mockUsageRepo = {
  increment: vi.fn().mockResolvedValue(undefined),
};

const mockPinecone = {
  search: vi.fn().mockResolvedValue([]),
};

// Mock redis
vi.mock('../../../src/config/redis', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() },
}));

// Mock tool service
vi.mock('../../../src/modules/tools/tool.service', () => ({
  toolService: {
    getToolDefinitions: vi.fn().mockResolvedValue([
      {
        name: 'cek_stok_kue',
        description: 'Cek stok kue',
        input_schema: { type: 'object', properties: { nama_produk: { type: 'string' } }, required: ['nama_produk'] },
      },
    ]),
    executeAll: vi.fn().mockResolvedValue([
      { toolName: 'cek_stok_kue', toolCallId: 'call_1', args: { nama_produk: 'Red Velvet' }, result: 'Stok: 3 loyang', durationMs: 120 },
    ]),
  },
}));

const params: ProcessMessageParams = {
  clientId: 1,
  sessionId: 'test-session',
  channel: 'web',
  userMessage: 'Ada stok Red Velvet?',
  userIdentifier: 'user-1',
};

describe('ChatService — agentic loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvRepo.findBySessionId.mockResolvedValue(mockConversation);
    mockChatbotRepo.findByClientId.mockResolvedValue(mockChatbot);
  });

  it('returns content directly when AI needs no tool calls (tools_enabled=true)', async () => {
    const mockProvider: AIProvider = {
      chat: vi.fn().mockResolvedValue({
        content: 'Halo! Bagaimana saya bisa membantu?',
        tokensUsed: 20,
        model: 'test-model',
        toolCalls: undefined,
      } as ChatResponse),
      chatStream: async function* () { yield ''; },
    };

    const service = new ChatService(
      mockChatbotRepo as any,
      mockKnowledgeRepo as any,
      mockConvRepo as any,
      mockUsageRepo as any,
      mockProvider,
      mockPinecone as any,
    );

    const result = await service.processMessage(params);
    expect(result.reply).toBe('Halo! Bagaimana saya bisa membantu?');
    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
  });

  it('executes one tool call and returns final answer', async () => {
    const chatMock = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        tokensUsed: 15,
        model: 'test',
        toolCalls: [{ id: 'call_1', name: 'cek_stok_kue', args: { nama_produk: 'Red Velvet' } }],
        stopReason: 'tool_use',
      } as ChatResponse)
      .mockResolvedValueOnce({
        content: 'Stok Red Velvet tersedia 3 loyang ya kak!',
        tokensUsed: 30,
        model: 'test',
        toolCalls: undefined,
      } as ChatResponse);

    const mockProvider: AIProvider = {
      chat: chatMock,
      chatStream: async function* () { yield ''; },
    };

    const service = new ChatService(
      mockChatbotRepo as any,
      mockKnowledgeRepo as any,
      mockConvRepo as any,
      mockUsageRepo as any,
      mockProvider,
      mockPinecone as any,
    );

    const result = await service.processMessage(params);
    expect(result.reply).toBe('Stok Red Velvet tersedia 3 loyang ya kak!');
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('returns fallback message when max iterations reached', async () => {
    // AI always returns tool calls — infinite loop scenario
    const chatMock = vi.fn().mockResolvedValue({
      content: '',
      tokensUsed: 10,
      model: 'test',
      toolCalls: [{ id: 'call_x', name: 'cek_stok_kue', args: { nama_produk: 'test' } }],
      stopReason: 'tool_use',
    } as ChatResponse);

    const mockProvider: AIProvider = {
      chat: chatMock,
      chatStream: async function* () { yield ''; },
    };

    const service = new ChatService(
      mockChatbotRepo as any,
      mockKnowledgeRepo as any,
      mockConvRepo as any,
      mockUsageRepo as any,
      mockProvider,
      mockPinecone as any,
    );

    const result = await service.processMessage(params);
    expect(result.reply).toBe('Maaf, tidak bisa memproses permintaan saat ini.');
    // Should have been called MAX_ITERATIONS (5) times
    expect(chatMock).toHaveBeenCalledTimes(5);
  });

  it('skips agentic loop when tools_enabled = false', async () => {
    const chatbotWithToolsOff = { ...mockChatbot, toolsEnabled: false };
    const chatbotRepo = { findByClientId: vi.fn().mockResolvedValue(chatbotWithToolsOff) };

    const chatMock = vi.fn().mockResolvedValue({
      content: 'Jawaban biasa tanpa tool',
      tokensUsed: 20,
      model: 'test',
    } as ChatResponse);

    const mockProvider: AIProvider = {
      chat: chatMock,
      chatStream: async function* () { yield ''; },
    };

    const service = new ChatService(
      chatbotRepo as any,
      mockKnowledgeRepo as any,
      mockConvRepo as any,
      mockUsageRepo as any,
      mockProvider,
      mockPinecone as any,
    );

    const result = await service.processMessage(params);
    expect(result.reply).toBe('Jawaban biasa tanpa tool');
    // getToolDefinitions should NOT be called when tools_enabled = false
    const { toolService } = await import('../../../src/modules/tools/tool.service');
    expect(toolService.getToolDefinitions).not.toHaveBeenCalled();
  });
});

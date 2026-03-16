import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Module mocks (hoisted before app import) ──────────────────────────────────

vi.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-vitest-at-least-32-chars',
    CORS_ORIGINS: 'http://localhost:3000',
  },
  isProduction: false,
  isTest: true,
  isDevelopment: false,
}));

vi.mock('../../src/config/database', () => ({ db: {} }));

vi.mock('../../src/config/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn(),
  },
}));

vi.mock('../../src/socket/socket.gateway', () => ({
  socketGateway: { emitToClient: vi.fn(), init: vi.fn() },
}));

// ── Repository mocks ──────────────────────────────────────────────────────────

const mockClientRepo = vi.hoisted(() => ({
  findByApiKey: vi.fn(),
  findById: vi.fn(),
}));

const mockChatbotRepo = vi.hoisted(() => ({
  findByClientId: vi.fn(),
}));

const mockKnowledgeRepo = vi.hoisted(() => ({
  findActiveByClient: vi.fn(),
}));

const mockConvRepo = vi.hoisted(() => ({
  findBySessionId: vi.fn(),
  create: vi.fn(),
  getHistory: vi.fn(),
  saveMessage: vi.fn(),
  updateLastMessageAt: vi.fn(),
}));

const mockUsageRepo = vi.hoisted(() => ({
  increment: vi.fn(),
}));

vi.mock('../../src/modules/client/client.repository', () => ({
  clientRepository: mockClientRepo,
  ClientRepository: vi.fn(),
}));

vi.mock('../../src/modules/chatbot/chatbot.repository', () => ({
  chatbotRepository: mockChatbotRepo,
  ChatbotRepository: vi.fn(),
}));

vi.mock('../../src/modules/knowledge/knowledge.repository', () => ({
  knowledgeRepository: mockKnowledgeRepo,
  KnowledgeRepository: vi.fn(),
}));

vi.mock('../../src/modules/chat/conversation.repository', () => ({
  conversationRepository: mockConvRepo,
  usageRepository: mockUsageRepo,
  ConversationRepository: vi.fn(),
  UsageRepository: vi.fn(),
}));

vi.mock('../../src/modules/whatsapp/wa.service', () => ({
  waService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatus: vi.fn(),
    getSocket: vi.fn(),
    restoreActiveSessions: vi.fn(),
    setMessageHandler: vi.fn(),
  },
}));

// Mock AI factory to return a controlled provider
vi.mock('../../src/providers/ai/ai.factory', () => ({
  createAIProvider: vi.fn().mockResolvedValue({
    chat: vi.fn().mockResolvedValue({
      content: 'Halo! Ada yang bisa saya bantu?',
      tokensUsed: 70,
      model: 'llama-3.3-70b-versatile',
    }),
  }),
}));

import app from '../../src/app';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTIVE_CLIENT = { id: 1, slug: 'toko-kue', isActive: true };
const INACTIVE_CLIENT = { id: 2, slug: 'toko-tutup', isActive: false };

const CHATBOT = {
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

const NEW_CONVERSATION = {
  id: 50,
  clientId: 1,
  chatbotId: 10,
  sessionId: 'test-session-id',
  channel: 'web',
  userIdentifier: 'test-session-id',
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path setup
  mockClientRepo.findByApiKey.mockResolvedValue(ACTIVE_CLIENT);
  mockChatbotRepo.findByClientId.mockResolvedValue(CHATBOT);
  mockKnowledgeRepo.findActiveByClient.mockResolvedValue([]);
  mockConvRepo.findBySessionId.mockResolvedValue(null);
  mockConvRepo.create.mockResolvedValue(NEW_CONVERSATION);
  mockConvRepo.getHistory.mockResolvedValue([]);
  mockConvRepo.saveMessage.mockResolvedValue({ id: 99 });
  mockConvRepo.updateLastMessageAt.mockResolvedValue(undefined);
  mockUsageRepo.increment.mockResolvedValue(undefined);
});

// ────────────────────────────────────────────────────────────────────────────

describe('POST /v1/chat/message — integration', () => {
  // ── API Key middleware ────────────────────────────────────────────────────

  describe('API key authentication', () => {
    it('returns 401 when X-Api-Key header is absent', async () => {
      const res = await request(app)
        .post('/v1/chat/message')
        .send({ message: 'halo' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('X-Api-Key header is required');
    });

    it('returns 401 for an unrecognised API key', async () => {
      mockClientRepo.findByApiKey.mockResolvedValue(null);

      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_unknown')
        .send({ message: 'halo' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid API key');
    });

    it('returns 403 when the client account is inactive', async () => {
      mockClientRepo.findByApiKey.mockResolvedValue(INACTIVE_CLIENT);

      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_inactive')
        .send({ message: 'halo' });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Client account is inactive');
    });
  });

  // ── Request body validation ───────────────────────────────────────────────

  describe('request body validation', () => {
    it('returns 400 when message field is missing', async () => {
      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Bad Request');
    });

    it('returns 400 when message is an empty string', async () => {
      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when channel is not "web" or "whatsapp"', async () => {
      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: 'halo', channel: 'telegram' });

      expect(res.status).toBe(400);
    });
  });

  // ── Successful message processing ─────────────────────────────────────────

  describe('successful message processing', () => {
    it('returns 200 with session_id and reply', async () => {
      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: 'Apa saja produk yang ada?' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('session_id');
      expect(res.body).toHaveProperty('reply', 'Halo! Ada yang bisa saya bantu?');
    });

    it('accepts an explicit session_id in the request body', async () => {
      mockConvRepo.findBySessionId.mockResolvedValue(NEW_CONVERSATION);

      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: 'Lanjutkan percakapan', session_id: 'test-session-id' });

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe('test-session-id');
    });

    it('auto-generates session_id when not provided', async () => {
      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: 'Permintaan baru' });

      expect(res.status).toBe(200);
      expect(typeof res.body.session_id).toBe('string');
      expect(res.body.session_id.length).toBeGreaterThan(0);
    });

    it('defaults channel to "web" when not specified', async () => {
      await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: 'halo' });

      expect(mockUsageRepo.increment).toHaveBeenCalledWith(1, 'web', expect.any(Number));
    });

    it('accepts "whatsapp" as a valid channel value', async () => {
      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: 'halo dari WA', channel: 'whatsapp' });

      expect(res.status).toBe(200);
    });
  });

  // ── Error propagation ─────────────────────────────────────────────────────

  describe('error propagation', () => {
    it('returns 500 when chatbot is not configured for the client', async () => {
      mockChatbotRepo.findByClientId.mockResolvedValue(null);

      const res = await request(app)
        .post('/v1/chat/message')
        .set('X-Api-Key', 'ck_valid')
        .send({ message: 'halo' });

      // ChatService throws → global error handler returns 500
      expect(res.status).toBe(500);
    });
  });
});

// ── GET /v1/chat/history/:session_id ─────────────────────────────────────────

describe('GET /v1/chat/history/:session_id — integration', () => {
  it('returns 401 without API key', async () => {
    const res = await request(app).get('/v1/chat/history/some-session');
    expect(res.status).toBe(401);
  });

  it('returns empty messages array when session does not exist', async () => {
    mockConvRepo.findBySessionId.mockResolvedValue(null);

    const res = await request(app)
      .get('/v1/chat/history/unknown-session')
      .set('X-Api-Key', 'ck_valid');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: [] });
  });

  it('returns messages for an existing session belonging to the authenticated client', async () => {
    mockConvRepo.findBySessionId.mockResolvedValue(NEW_CONVERSATION);
    mockConvRepo.getHistory.mockResolvedValue([
      { id: 1, role: 'user', content: 'halo', conversationId: 50, createdAt: new Date() },
      { id: 2, role: 'assistant', content: 'Halo!', conversationId: 50, createdAt: new Date() },
    ]);

    const res = await request(app)
      .get('/v1/chat/history/test-session-id')
      .set('X-Api-Key', 'ck_valid');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0]).toHaveProperty('role', 'user');
  });

  it('returns 403 when session belongs to a different client', async () => {
    const otherClientConversation = { ...NEW_CONVERSATION, clientId: 999 };
    mockConvRepo.findBySessionId.mockResolvedValue(otherClientConversation);

    const res = await request(app)
      .get('/v1/chat/history/other-client-session')
      .set('X-Api-Key', 'ck_valid');

    expect(res.status).toBe(403);
  });
});

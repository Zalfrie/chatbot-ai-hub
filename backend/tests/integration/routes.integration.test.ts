/**
 * Integration tests for dashboard, analytics, chatbot, conversation, and knowledge routes.
 * Uses a "thenable chain" mock so `await db.select().from(X)` resolves cleanly without
 * a real database connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-jwt-secret-for-vitest-at-least-32-chars';

// ── Thenable chain factory ────────────────────────────────────────────────────
// Returns an object that is both awaitable (has .then) AND chainable (.from, .where, etc.)

function makeThenableChain<T = unknown>(result: T) {
  const chain: Record<string, unknown> = {};

  // Thenable interface — allows `await chain` to resolve to `result`
  chain['then'] = (
    onFulfilled: (v: T) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);

  // Chain methods — each returns the same thenable chain so the full chain is awaitable
  const methods = [
    'from', 'where', 'groupBy', 'orderBy', 'limit',
    'set', 'values', 'returning', 'onConflictDoUpdate',
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });

  return chain;
}

// ── Hoisted db mock ───────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { mockDb };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

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

vi.mock('../../src/config/database', () => ({ db: mockDb }));
vi.mock('../../src/config/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), quit: vi.fn() },
}));
vi.mock('../../src/socket/socket.gateway', () => ({
  socketGateway: { emitToClient: vi.fn(), init: vi.fn() },
}));

vi.mock('../../src/modules/client/client.repository', () => ({
  clientRepository: { findByApiKey: vi.fn(), findById: vi.fn() },
  ClientRepository: vi.fn(),
}));
vi.mock('../../src/modules/chatbot/chatbot.repository', () => ({
  chatbotRepository: { findByClientId: vi.fn() },
  ChatbotRepository: vi.fn(),
}));
vi.mock('../../src/modules/knowledge/knowledge.repository', () => ({
  knowledgeRepository: { findActiveByClient: vi.fn() },
  KnowledgeRepository: vi.fn(),
}));
vi.mock('../../src/modules/chat/conversation.repository', () => ({
  conversationRepository: {
    findBySessionId: vi.fn(),
    create: vi.fn(),
    getHistory: vi.fn(),
    saveMessage: vi.fn(),
    updateLastMessageAt: vi.fn(),
  },
  usageRepository: { increment: vi.fn() },
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
vi.mock('../../src/providers/ai/ai.factory', () => ({
  createAIProvider: vi.fn(),
}));

import app from '../../src/app';

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(role = 'superadmin'): Record<string, string> {
  const token = jwt.sign({ adminId: 1, role }, TEST_SECRET, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}` };
}

// ────────────────────────────────────────────────────────────────────────────

describe('GET /api/dashboard/stats — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Each db.select() call returns a new thenable chain resolving to [{total: 0}]
    mockDb.select.mockImplementation(() => makeThenableChain([{ total: 0 }]));
  });

  it('returns 401 without a JWT', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('returns 200 with aggregated stats on success', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalClients: expect.any(Number),
      totalConversations: expect.any(Number),
      totalMessages: expect.any(Number),
      activeWaSessions: expect.any(Number),
    });
  });

  it('returns 500 when the database query throws', async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    const res = await request(app)
      .get('/api/dashboard/stats')
      .set(authHeader());

    expect(res.status).toBe(500);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('/api/clients/:clientId/chatbot — integration', () => {
  const CHATBOT_BASE = '/api/clients/1/chatbot';

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => makeThenableChain([{ id: 10, clientId: 1, name: 'Bot', systemPrompt: 'Hi', isActive: true }]));
    mockDb.insert.mockImplementation(() => makeThenableChain([{ id: 10 }]));
    mockDb.update.mockImplementation(() => makeThenableChain([{ id: 10 }]));
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(CHATBOT_BASE);
    expect(res.status).toBe(401);
  });

  it('GET returns 200 with chatbot data', async () => {
    const res = await request(app)
      .get(CHATBOT_BASE)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 10);
  });

  it('GET returns 404 when chatbot does not exist', async () => {
    mockDb.select.mockImplementation(() => makeThenableChain([]));

    const res = await request(app)
      .get(CHATBOT_BASE)
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  it('POST returns 201 with created chatbot', async () => {
    const res = await request(app)
      .post(CHATBOT_BASE)
      .set(authHeader())
      .send({ name: 'Bot Baru', systemPrompt: 'Kamu asisten toko.' });

    expect(res.status).toBe(201);
  });

  it('POST returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post(CHATBOT_BASE)
      .set(authHeader())
      .send({ name: 'Bot Saja' }); // missing systemPrompt

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation error');
  });

  it('PUT returns 200 on successful update', async () => {
    const res = await request(app)
      .put(CHATBOT_BASE)
      .set(authHeader())
      .send({ name: 'Bot Updated' });

    expect(res.status).toBe(200);
  });

  it('PUT returns 404 when chatbot does not exist', async () => {
    mockDb.update.mockImplementation(() => makeThenableChain([]));

    const res = await request(app)
      .put(CHATBOT_BASE)
      .set(authHeader())
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('/api/clients/:clientId/conversations — integration', () => {
  const CONV_BASE = '/api/clients/1/conversations';

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => makeThenableChain([]));
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(CONV_BASE);
    expect(res.status).toBe(401);
  });

  it('GET returns 200 with array of conversations', async () => {
    const conv = { id: 1, clientId: 1, sessionId: 'sess-1', channel: 'web' };
    mockDb.select.mockImplementation(() => makeThenableChain([conv]));

    const res = await request(app)
      .get(CONV_BASE)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /:cid/messages returns 404 when conversation not found', async () => {
    // First select (for conv lookup) returns empty
    mockDb.select.mockImplementationOnce(() => makeThenableChain([]));

    const res = await request(app)
      .get(`${CONV_BASE}/99/messages`)
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  it('GET /:cid/messages returns 200 with messages when conversation exists', async () => {
    const conv = { id: 1, clientId: 1, sessionId: 'sess-1' };
    const msgs = [{ id: 1, role: 'user', content: 'halo', conversationId: 1 }];
    // First call: conversation lookup; second call: messages
    mockDb.select
      .mockImplementationOnce(() => makeThenableChain([conv]))
      .mockImplementationOnce(() => makeThenableChain(msgs));

    const res = await request(app)
      .get(`${CONV_BASE}/1/messages`)
      .set(authHeader());

    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('/api/clients/:clientId/analytics — integration', () => {
  const ANALYTICS_BASE = '/api/clients/1/analytics';

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => makeThenableChain([]));
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(ANALYTICS_BASE);
    expect(res.status).toBe(401);
  });

  it('GET returns 200 with analytics shape', async () => {
    // First query: daily stats (groupBy/orderBy chain) → []
    // Second query: conversation count → [{ total: 5 }]
    mockDb.select
      .mockImplementationOnce(() => makeThenableChain([]))
      .mockImplementationOnce(() => makeThenableChain([{ total: 5 }]));

    const res = await request(app)
      .get(ANALYTICS_BASE)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalMessages: 0,
      totalTokens: 0,
      totalConversations: 5,
      dailyStats: [],
    });
  });

  it('returns 500 when the database query throws', async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error('DB error');
    });

    const res = await request(app)
      .get(ANALYTICS_BASE)
      .set(authHeader());

    expect(res.status).toBe(500);
  });
});

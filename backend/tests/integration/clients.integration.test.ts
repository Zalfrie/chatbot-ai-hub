import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Literal — vi.mock factories are hoisted before const declarations
const TEST_SECRET = 'test-jwt-secret-for-vitest-at-least-32-chars';

// ── Hoisted chain mocks (created before vi.mock is evaluated) ────────────────

const { mockChain, mockDb } = vi.hoisted(() => {
  const mockChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    returning: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  };
  // Default: every method returns the chain itself (chainable)
  (Object.keys(mockChain) as (keyof typeof mockChain)[]).forEach((m) => {
    mockChain[m].mockReturnValue(mockChain);
  });

  const mockDb = {
    select: vi.fn().mockReturnValue(mockChain),
    insert: vi.fn().mockReturnValue(mockChain),
    update: vi.fn().mockReturnValue(mockChain),
    delete: vi.fn().mockReturnValue(mockChain),
  };

  return { mockChain, mockDb };
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

import app from '../../src/app';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminToken(role = 'superadmin'): string {
  return jwt.sign({ adminId: 1, role }, TEST_SECRET, { expiresIn: '15m' });
}

const mockClient = {
  id: 1,
  name: 'Toko Kue Laris Manis',
  slug: 'toko-kue-laris',
  email: 'toko@example.com',
  apiKey: 'ck_hashed',
  plan: 'free',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ────────────────────────────────────────────────────────────────────────────

describe('/api/clients — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default chain behaviour after clearAllMocks wipes mockReturnValue
    (Object.keys(mockChain) as (keyof typeof mockChain)[]).forEach((m) => {
      mockChain[m].mockReturnValue(mockChain);
    });
    mockDb.select.mockReturnValue(mockChain);
    mockDb.insert.mockReturnValue(mockChain);
    mockDb.update.mockReturnValue(mockChain);
    mockDb.delete.mockReturnValue(mockChain);
  });

  // ── Auth guard ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app).get('/api/clients');
      expect(res.status).toBe(401);
    });

    it('returns 401 for an invalid JWT', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/clients ────────────────────────────────────────────────────

  describe('GET /api/clients', () => {
    it('returns 200 with data array on success', async () => {
      mockChain.orderBy.mockResolvedValue([mockClient]);

      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toMatchObject({ slug: 'toko-kue-laris' });
    });

    it('returns 200 with empty data array when no clients exist', async () => {
      mockChain.orderBy.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ── POST /api/clients ───────────────────────────────────────────────────

  describe('POST /api/clients', () => {
    const validBody = {
      name: 'Toko Baru',
      slug: 'toko-baru',
      email: 'baru@example.com',
    };

    it('returns 201 with the created client', async () => {
      mockChain.returning.mockResolvedValue([{ ...mockClient, ...validBody, id: 2 }]);

      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ slug: 'toko-baru' });
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ name: 'No Slug or Email' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation error');
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ name: 'Test', slug: 'test', email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when slug contains uppercase letters', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ name: 'Test', slug: 'UPPERCASE', email: 'test@test.com' });

      expect(res.status).toBe(400);
    });

    it('returns 409 when slug or email already exists', async () => {
      mockChain.returning.mockRejectedValue(new Error('duplicate key violates unique constraint'));

      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send(validBody);

      expect(res.status).toBe(409);
    });
  });

  // ── GET /api/clients/:id ────────────────────────────────────────────────

  describe('GET /api/clients/:id', () => {
    it('returns 200 with the client when found', async () => {
      mockChain.limit.mockResolvedValue([mockClient]);

      const res = await request(app)
        .get('/api/clients/1')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 1 });
    });

    it('returns 404 when client does not exist', async () => {
      mockChain.limit.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/clients/9999')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Client not found');
    });

    it('returns 400 for a non-numeric id', async () => {
      const res = await request(app)
        .get('/api/clients/notanumber')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/clients/:id ─────────────────────────────────────────────

  describe('DELETE /api/clients/:id', () => {
    it('returns 200 with success message when deleted', async () => {
      mockChain.returning.mockResolvedValue([mockClient]);

      const res = await request(app)
        .delete('/api/clients/1')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Client deleted');
    });

    it('returns 404 when client does not exist', async () => {
      mockChain.returning.mockResolvedValue([]);

      const res = await request(app)
        .delete('/api/clients/9999')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(404);
    });
  });
});

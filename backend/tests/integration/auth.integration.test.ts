import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mock heavy infrastructure before app import ──────────────────────────────

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
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), quit: vi.fn() },
}));
vi.mock('../../src/socket/socket.gateway', () => ({
  socketGateway: { emitToClient: vi.fn(), init: vi.fn() },
}));

// Mock auth service so we control login behaviour without a real DB
vi.mock('../../src/modules/auth/auth.service', () => ({
  authService: { login: vi.fn() },
}));

// Stub out repository singletons used by other routes mounted in app.ts
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
import { authService } from '../../src/modules/auth/auth.service';

// ────────────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('request validation', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'secret123' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation error');
    });

    it('returns 400 when email is not a valid address', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bukan-email', password: 'secret123' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when password is empty string', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is completely empty', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('authentication failures', () => {
    it('returns 401 with message for wrong password', async () => {
      vi.mocked(authService.login).mockRejectedValueOnce(new Error('Invalid credentials'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    });

    it('returns 401 when account is inactive', async () => {
      vi.mocked(authService.login).mockRejectedValueOnce(new Error('Account is inactive'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inactive@test.com', password: 'pass123' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Account is inactive');
    });

    it('returns 401 when user does not exist', async () => {
      vi.mocked(authService.login).mockRejectedValueOnce(new Error('Invalid credentials'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'pass123' });

      expect(res.status).toBe(401);
    });
  });

  describe('successful login', () => {
    it('returns 200 with accessToken, refreshToken, and user on valid credentials', async () => {
      vi.mocked(authService.login).mockResolvedValueOnce({
        accessToken: 'mock.access.token',
        refreshToken: 'mock.refresh.token',
        user: { id: 1, name: 'Admin Utama', email: 'admin@test.com', role: 'superadmin' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'correctpassword' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken', 'mock.access.token');
      expect(res.body).toHaveProperty('refreshToken', 'mock.refresh.token');
      expect(res.body.user).toMatchObject({
        id: 1,
        email: 'admin@test.com',
        role: 'superadmin',
      });
    });

    it('calls authService.login with the provided credentials', async () => {
      vi.mocked(authService.login).mockResolvedValueOnce({
        accessToken: 'tok',
        refreshToken: 'ref',
        user: { id: 1, name: 'A', email: 'a@a.com', role: 'admin' },
      });

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@a.com', password: 'mypassword' });

      expect(authService.login).toHaveBeenCalledWith('a@a.com', 'mypassword');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Module mocks (hoisted before app import) ──────────────────────────────────

vi.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-vitest-at-least-32-chars',
    // The space after the comma is deliberate: entries are trimmed
    CORS_ORIGINS: 'http://localhost:3000, https://dashboard.example.com',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX_REQUESTS: '30',
  },
  isProduction: false,
  isTest: true,
  isDevelopment: false,
}));

vi.mock('../../src/config/database', () => ({ db: {} }));

const mockRedis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  quit: vi.fn(),
}));

vi.mock('../../src/config/redis', () => ({ redis: mockRedis }));

vi.mock('../../src/socket/socket.gateway', () => ({
  socketGateway: { emitToClient: vi.fn(), init: vi.fn() },
}));

const mockClientRepo = vi.hoisted(() => ({
  findByApiKey: vi.fn(),
  findById: vi.fn(),
}));

const mockConvRepo = vi.hoisted(() => ({
  findBySessionId: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock('../../src/modules/client/client.repository', () => ({
  clientRepository: mockClientRepo,
  ClientRepository: vi.fn(),
}));

vi.mock('../../src/modules/chat/conversation.repository', () => ({
  conversationRepository: mockConvRepo,
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
import { logger } from '../../src/utils/logger';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_WEBSITE = 'https://toko-kue.example.id';
const DASHBOARD_ORIGINS = ['http://localhost:3000', 'https://dashboard.example.com'];
const SESSION_ID = '0b6f2c1e-8d4a-4c3b-9f1e-2a7d5e6c8b90';
const ACTIVE_CLIENT = { id: 1, slug: 'toko-kue', isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(logger, 'error').mockImplementation(() => logger);
  vi.spyOn(logger, 'warn').mockImplementation(() => logger);

  mockClientRepo.findByApiKey.mockResolvedValue(ACTIVE_CLIENT);
  mockConvRepo.findBySessionId.mockResolvedValue(null);
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.ttl.mockResolvedValue(60);
});

// ────────────────────────────────────────────────────────────────────────────

describe('CORS on the widget API (/v1/chat)', () => {
  it.each([
    ['POST', '/v1/chat/stream', 'content-type,x-api-key'],
    ['POST', '/v1/chat/message', 'content-type,x-api-key'],
    ['GET', `/v1/chat/history/${SESSION_ID}`, 'x-api-key'],
  ])('answers a %s preflight for %s from a tenant website', async (method, path, headers) => {
    const res = await request(app)
      .options(path)
      .set('Origin', TENANT_WEBSITE)
      .set('Access-Control-Request-Method', method)
      .set('Access-Control-Request-Headers', headers);

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain(method);
    const allowedHeaders = res.headers['access-control-allow-headers']!.toLowerCase().split(',');
    expect(allowedHeaders).toEqual(expect.arrayContaining(headers.split(',')));
    // The widget authenticates with X-Api-Key, never with cookies
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('lets a tenant website read the history response', async () => {
    const res = await request(app)
      .get(`/v1/chat/history/${SESSION_ID}`)
      .set('Origin', TENANT_WEBSITE)
      .set('X-Api-Key', 'ck_test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: [] });
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  // The widget shows a different message for 429 and 5xx, which it can only do if it can read the status
  it.each([
    ['a missing API key', 401, undefined, () => {}],
    ['the rate limit', 429, 'ck_test', () => mockRedis.incr.mockResolvedValue(31)],
    ['a server error', 500, 'ck_test', () => mockClientRepo.findByApiKey.mockRejectedValue(new Error('db down'))],
  ])('lets a tenant website read the status of an error response (%s)', async (_case, status, apiKey, arrange) => {
    arrange();

    const req = request(app).post('/v1/chat/stream').set('Origin', TENANT_WEBSITE);
    if (apiKey) req.set('X-Api-Key', apiKey);
    const res = await req.send({ message: 'halo' });

    expect(res.status).toBe(status);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('CORS on the dashboard API (/api)', () => {
  it.each(DASHBOARD_ORIGINS)('answers a preflight from the dashboard origin %s', async (origin) => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['vary']).toContain('Origin');
  });

  it('refuses a preflight from any other origin with 403 and no CORS headers', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', TENANT_WEBSITE)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    // A warning that names the origin, not an "Unhandled error"
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ origin: TENANT_WEBSITE }));
  });

  it('refuses a request from any other origin before it reaches the route', async () => {
    const res = await request(app).get('/api/clients').set('Origin', TENANT_WEBSITE);

    // 403 from CORS, not the 401 that the route's auth middleware would return
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('leaves requests without an Origin header (curl, server-to-server) to the route', async () => {
    const res = await request(app).get('/api/clients');

    expect(res.status).toBe(401);
  });
});

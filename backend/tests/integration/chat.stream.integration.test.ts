/**
 * The SSE endpoints deliver their events. Every repository answers after a timer, as a real
 * database does, so the first event comes after the request body has been read and its
 * `close` event has fired.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import jwt from 'jsonwebtoken';

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

const { later, mockClientRepo, mockChatbotRepo, mockKnowledgeRepo, mockConvRepo, mockUsageRepo, provider } = vi.hoisted(() => {
  // Resolves after a timer, like a query that goes to the database
  const later = <T>(value: T) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), 5));
  return {
    later,
    mockClientRepo: { findByApiKey: vi.fn(), findById: vi.fn() },
    mockChatbotRepo: { findByClientId: vi.fn() },
    mockKnowledgeRepo: { findActiveByClient: vi.fn() },
    mockConvRepo: {
      findBySessionId: vi.fn(),
      create: vi.fn(),
      getHistory: vi.fn(),
      saveMessage: vi.fn(),
      updateLastMessageAt: vi.fn(),
    },
    mockUsageRepo: { increment: vi.fn() },
    provider: { chat: vi.fn(), chatStream: vi.fn() },
  };
});

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
vi.mock('../../src/providers/ai/ai.factory', () => ({
  createAIProvider: vi.fn().mockResolvedValue(provider),
}));

import app from '../../src/app';

const SESSION_ID = '0b6f2c1e-8d4a-4c3b-9f1e-2a7d5e6c8b90';
const CLIENT = { id: 1, slug: 'toko-kue', isActive: true };
const CHATBOT = {
  id: 10,
  clientId: 1,
  systemPrompt: 'Kamu asisten toko kue.',
  aiProvider: 'groq',
  aiModel: 'llama-3.3-70b-versatile',
  temperature: '0.85',
  maxTokens: 1000,
  toolsEnabled: false,
};
const conversation = (clientId: number, sessionId: string) => ({
  id: 50,
  clientId,
  chatbotId: 10,
  sessionId,
  channel: 'web',
  userIdentifier: sessionId,
});

const PREVIEW_AUTH = {
  Authorization: `Bearer ${jwt.sign({ adminId: 1, role: 'superadmin' }, 'test-jwt-secret-for-vitest-at-least-32-chars')}`,
};

/** The events of an SSE body, in order */
function events(body: string): { type: string; [key: string]: unknown }[] {
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice(6)));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClientRepo.findByApiKey.mockImplementation(later(CLIENT));
  mockChatbotRepo.findByClientId.mockImplementation(later(CHATBOT));
  mockKnowledgeRepo.findActiveByClient.mockImplementation(later([]));
  mockConvRepo.findBySessionId.mockImplementation(later(null));
  mockConvRepo.create.mockImplementation((data: { clientId: number; sessionId: string }) =>
    later(conversation(data.clientId, data.sessionId))());
  mockConvRepo.getHistory.mockImplementation(later([]));
  mockConvRepo.saveMessage.mockImplementation(later(undefined));
  mockConvRepo.updateLastMessageAt.mockImplementation(later(undefined));
  mockUsageRepo.increment.mockImplementation(later(undefined));
  provider.chatStream.mockImplementation(async function* () {
    yield 'Halo! ';
    yield 'Ada yang bisa dibantu?';
  });
});

describe('POST /v1/chat/stream', () => {
  it('streams the session, the reply and done', async () => {
    const res = await request(app)
      .post('/v1/chat/stream')
      .set('X-Api-Key', 'ck_valid')
      .send({ message: 'halo', session_id: SESSION_ID });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(events(res.text)).toEqual([
      { type: 'session', session_id: SESSION_ID },
      { type: 'chunk', content: 'Halo! ' },
      { type: 'chunk', content: 'Ada yang bisa dibantu?' },
      { type: 'done', tokens_used: expect.any(Number) },
    ]);
    expect(mockConvRepo.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', content: 'Halo! Ada yang bisa dibantu?' }),
    );
  });

  it('streams an error event when the provider fails', async () => {
    provider.chatStream.mockImplementation(async function* () {
      yield* [];
      throw new Error('provider down');
    });

    const res = await request(app)
      .post('/v1/chat/stream')
      .set('X-Api-Key', 'ck_valid')
      .send({ message: 'halo', session_id: SESSION_ID });

    expect(events(res.text).map((e) => e.type)).toEqual(['session', 'error']);
  });
});

describe('POST /api/clients/:clientId/conversations/stream/preview', () => {
  it('streams the session, the reply and done', async () => {
    const res = await request(app)
      .post('/api/clients/2/conversations/stream/preview')
      .set(PREVIEW_AUTH)
      .send({ message: 'tes' });

    expect(res.status).toBe(200);
    expect(events(res.text)).toEqual([
      { type: 'session', session_id: 'preview_2' },
      { type: 'chunk', content: 'Halo! ' },
      { type: 'chunk', content: 'Ada yang bisa dibantu?' },
      { type: 'done', tokens_used: expect.any(Number) },
    ]);
  });
});

describe.each([
  ['/v1/chat/stream', { 'X-Api-Key': 'ck_valid' }],
  ['/api/clients/1/conversations/stream/preview', PREVIEW_AUTH],
])('%s when the client disconnects mid-answer', (path, headers) => {
  let server: http.Server;
  let providerClosed: boolean;
  let chunksPulled: number;

  beforeEach(async () => {
    providerClosed = false;
    chunksPulled = 0;
    provider.chatStream.mockImplementation(async function* () {
      try {
        for (let i = 0; i < 50; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          chunksPulled += 1;
          yield `kata${i} `;
        }
      } finally {
        providerClosed = true;
      }
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('stops the stream and saves nothing', async () => {
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
            // Leave as soon as the first words of the answer arrive
            if (body.includes('"type":"chunk"')) {
              req.destroy();
              resolve();
            }
          });
          res.on('end', () => reject(new Error(`stream ended before any chunk: ${JSON.stringify(body)}`)));
        },
      );
      req.on('error', (err) => { if (!req.destroyed) reject(err); });
      req.end(JSON.stringify({ message: 'halo', session_id: SESSION_ID }));
    });

    await vi.waitFor(() => expect(providerClosed).toBe(true), { timeout: 2000 });
    expect(chunksPulled).toBeLessThan(50);
    expect(mockConvRepo.saveMessage).not.toHaveBeenCalled();
  });
});

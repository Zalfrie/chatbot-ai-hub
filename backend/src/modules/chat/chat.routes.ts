import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { apiKeyMiddleware } from '../../middleware/apikey.middleware.js';
import { rateLimitMiddleware } from '../../middleware/ratelimit.middleware.js';
import { clientRepository } from '../client/client.repository.js';
import { chatbotRepository } from '../chatbot/chatbot.repository.js';
import { knowledgeRepository } from '../knowledge/knowledge.repository.js';
import { conversationRepository, usageRepository } from './conversation.repository.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

const router = Router();

// Instantiate dependencies
const chatService = new ChatService(
  chatbotRepository,
  knowledgeRepository,
  conversationRepository,
  usageRepository,
);

const chatController = new ChatController(chatService);

const rateLimit = rateLimitMiddleware();

// POST /v1/chat/message  (standard JSON response, non-streaming)
router.post(
  '/message',
  apiKeyMiddleware(clientRepository),
  rateLimit,
  chatController.sendMessage,
);

// POST /v1/chat/stream  (Server-Sent Events — web widget streaming)
router.post(
  '/stream',
  apiKeyMiddleware(clientRepository),
  rateLimit,
  chatController.streamMessage,
);

// GET /v1/chat/history/:session_id
// Returns recent messages for a session so the widget can restore history on reload.
router.get(
  '/history/:session_id',
  apiKeyMiddleware(clientRepository),
  async (req: Request, res: Response): Promise<void> => {
    // Same rule as the message endpoints: only widget-style UUID sessions are reachable here
    const parsed = z.uuid().safeParse(req.params['session_id']);
    if (!parsed.success) {
      res.status(400).json({ error: 'Bad Request', message: 'session_id must be a UUID' });
      return;
    }

    const clientId = req.clientId!;
    const conversation = await conversationRepository.findBySessionId(clientId, parsed.data);

    // Only the caller's own web conversations are returned. Anything else gets the same
    // empty response as "no history yet", so it never reveals that a session exists.
    if (!conversation || conversation.clientId !== clientId || conversation.channel !== 'web') {
      res.json({ messages: [] });
      return;
    }

    const messages = await conversationRepository.getHistory(conversation.id, 50);

    res.json({
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
          created_at: m.createdAt,
        })),
    });
  },
);

export default router;

import { Router, Request, Response } from 'express';
import { apiKeyMiddleware } from '../../middleware/apikey.middleware';
import { rateLimitMiddleware } from '../../middleware/ratelimit.middleware';
import { clientRepository } from '../client/client.repository';
import { chatbotRepository } from '../chatbot/chatbot.repository';
import { knowledgeRepository } from '../knowledge/knowledge.repository';
import { conversationRepository, usageRepository } from './conversation.repository';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

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

// POST /v1/chat/message
router.post(
  '/message',
  apiKeyMiddleware(clientRepository),
  rateLimit,
  chatController.sendMessage,
);

// GET /v1/chat/history/:session_id
// Returns recent messages for a session so the widget can restore history on reload.
router.get(
  '/history/:session_id',
  apiKeyMiddleware(clientRepository),
  async (req: Request, res: Response): Promise<void> => {
    const { session_id } = req.params as { session_id: string };

    const conversation = await conversationRepository.findBySessionId(session_id);

    if (!conversation) {
      // No history yet — return empty list (not an error)
      res.json({ messages: [] });
      return;
    }

    // Ensure the session belongs to the authenticated client (tenant isolation)
    if (conversation.clientId !== req.clientId) {
      res.status(403).json({ error: 'Forbidden' });
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

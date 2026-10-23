import { Router, Request, Response } from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { conversations, messages } from '../../db/schema/index.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { chatbotRepository } from '../chatbot/chatbot.repository.js';
import { knowledgeRepository } from '../knowledge/knowledge.repository.js';
import { conversationRepository, usageRepository } from './conversation.repository.js';
import { ChatService } from './chat.service.js';
import { z } from 'zod';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// Lazy singleton — shared with preview endpoint
let _previewChatService: ChatService | null = null;
function getPreviewChatService(): ChatService {
  if (!_previewChatService) {
    _previewChatService = new ChatService(
      chatbotRepository,
      knowledgeRepository,
      conversationRepository,
      usageRepository,
    );
  }
  return _previewChatService;
}

// The preview always uses the tenant's own preview session; callers cannot pick another conversation
const previewMessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

// GET /api/clients/:clientId/conversations
router.get('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.clientId, clientId))
      .orderBy(desc(conversations.lastMessageAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/clients/:clientId/conversations/:cid/messages
router.get('/:cid/messages', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  const cid = parseInt(req.params['cid'] as string, 10);
  if (isNaN(clientId) || isNaN(cid)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  try {
    // Verify conversation belongs to this client
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, cid), eq(conversations.clientId, clientId)))
      .limit(1);
    if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, cid))
      .orderBy(asc(messages.createdAt));
    res.json(msgs);
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/clients/:clientId/conversations/stream/preview
// JWT-authenticated streaming endpoint for dashboard "Test Bot" feature.
// Uses a fixed "preview" session per client so test messages don't pollute real data.
router.post('/stream/preview', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) {
    res.status(400).json({ error: 'Invalid client ID' });
    return;
  }

  const parsed = previewMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Bad Request', message: parsed.error.flatten().fieldErrors });
    return;
  }

  const { message } = parsed.data;
  const sessionId = `preview_${clientId}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => { aborted = true; });

  const writeEvent = (data: object): void => {
    if (!aborted) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const chatService = getPreviewChatService();
    const stream = chatService.processMessageStream({
      clientId,
      sessionId,
      channel: 'web',
      userMessage: message,
      userIdentifier: `dashboard_preview_${clientId}`,
    });

    for await (const event of stream) {
      if (aborted) break;
      writeEvent(event);
    }
  } catch {
    writeEvent({ type: 'error', message: 'Preview failed' });
  } finally {
    res.end();
  }
});

export default router;

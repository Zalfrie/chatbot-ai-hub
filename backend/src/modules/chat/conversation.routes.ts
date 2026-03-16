import { Router, Request, Response } from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../../config/database';
import { conversations, messages } from '../../db/schema';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

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

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { chatbots } from '../../db/schema';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

const chatbotSchema = z.object({
  name: z.string().min(1).max(255),
  systemPrompt: z.string().min(1),
  welcomeMessage: z.string().optional(),
  language: z.string().max(10).optional(),
  aiProvider: z.enum(['claude', 'openai', 'gemini', 'groq']).optional(),
  aiModel: z.string().max(100).optional(),
  // temperature stored as Postgres numeric (string in Drizzle) — coerce to string on output
  temperature: z.number().min(0).max(2).transform((v) => String(v)).optional(),
  maxTokens: z.number().int().min(100).max(8000).optional(),
  channel: z.enum(['web', 'whatsapp', 'both']).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/clients/:clientId/chatbot
router.get('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  try {
    const [chatbot] = await db.select().from(chatbots).where(eq(chatbots.clientId, clientId)).limit(1);
    if (!chatbot) { res.status(404).json({ error: 'Chatbot not found' }); return; }
    res.json(chatbot);
  } catch {
    res.status(500).json({ error: 'Failed to fetch chatbot' });
  }
});

// POST /api/clients/:clientId/chatbot
router.post('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const parsed = chatbotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [chatbot] = await db
      .insert(chatbots)
      .values({ ...parsed.data, clientId })
      .returning();
    res.status(201).json(chatbot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique')) {
      res.status(409).json({ error: 'Chatbot already exists for this client' });
    } else {
      res.status(500).json({ error: 'Failed to create chatbot' });
    }
  }
});

// PUT /api/clients/:clientId/chatbot
router.put('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const parsed = chatbotSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [updated] = await db
      .update(chatbots)
      .set(parsed.data)
      .where(eq(chatbots.clientId, clientId))
      .returning();
    if (!updated) { res.status(404).json({ error: 'Chatbot not found' }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update chatbot' });
  }
});

export default router;

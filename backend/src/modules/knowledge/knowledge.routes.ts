import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database';
import { knowledgeBases } from '../../db/schema';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

const knowledgeSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: z.string().max(100).optional().nullable(),
  priority: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/clients/:clientId/knowledge
router.get('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  try {
    const rows = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.clientId, clientId))
      .orderBy(desc(knowledgeBases.priority), desc(knowledgeBases.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch knowledge base' });
  }
});

// POST /api/clients/:clientId/knowledge
router.post('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const parsed = knowledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [entry] = await db
      .insert(knowledgeBases)
      .values({ ...parsed.data, clientId })
      .returning();
    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: 'Failed to create knowledge entry' });
  }
});

// PUT /api/clients/:clientId/knowledge/:kid
router.put('/:kid', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  const kid = parseInt(req.params['kid'] as string, 10);
  if (isNaN(clientId) || isNaN(kid)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  const parsed = knowledgeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [updated] = await db
      .update(knowledgeBases)
      .set(parsed.data)
      .where(and(eq(knowledgeBases.id, kid), eq(knowledgeBases.clientId, clientId)))
      .returning();
    if (!updated) { res.status(404).json({ error: 'Knowledge entry not found' }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update knowledge entry' });
  }
});

// DELETE /api/clients/:clientId/knowledge/:kid
router.delete('/:kid', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  const kid = parseInt(req.params['kid'] as string, 10);
  if (isNaN(clientId) || isNaN(kid)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  try {
    const [deleted] = await db
      .delete(knowledgeBases)
      .where(and(eq(knowledgeBases.id, kid), eq(knowledgeBases.clientId, clientId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: 'Knowledge entry not found' }); return; }
    res.json({ message: 'Knowledge entry deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete knowledge entry' });
  }
});

export default router;

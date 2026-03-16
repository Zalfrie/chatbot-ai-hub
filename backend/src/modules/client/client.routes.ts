import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, desc, ilike, count } from 'drizzle-orm';
import { db } from '../../config/database';
import { clients } from '../../db/schema';
import { authMiddleware } from '../../middleware/auth.middleware';
import crypto from 'crypto';

const router = Router();
router.use(authMiddleware);

const clientSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  plan: z.enum(['free', 'basic', 'pro']).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/clients
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(clients)
      .orderBy(desc(clients.createdAt));
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// POST /api/clients
router.post('/', async (req: Request, res: Response) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const apiKey = `ck_${crypto.randomBytes(24).toString('hex')}`;
    const [client] = await db
      .insert(clients)
      .values({ ...parsed.data, apiKey })
      .returning();
    res.status(201).json(client);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      res.status(409).json({ error: 'Email or slug already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create client' });
    }
  }
});

// GET /api/clients/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  try {
    const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json(client);
  } catch {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [updated] = await db
      .update(clients)
      .set(parsed.data)
      .where(eq(clients.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  try {
    const [deleted] = await db.delete(clients).where(eq(clients.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: 'Client not found' }); return; }
    res.json({ message: 'Client deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { eq, count, sum } from 'drizzle-orm';
import { db } from '../../config/database';
import { clients, conversations, usageLogs, waSessions } from '../../db/schema';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [[clientCount], [convCount], [msgSum], [waCount]] = await Promise.all([
      db.select({ total: count() }).from(clients),
      db.select({ total: count() }).from(conversations),
      db.select({ total: sum(usageLogs.messageCount) }).from(usageLogs),
      db.select({ total: count() }).from(waSessions).where(eq(waSessions.status, 'connected')),
    ]);

    res.json({
      totalClients: Number(clientCount?.total ?? 0),
      totalConversations: Number(convCount?.total ?? 0),
      totalMessages: Number(msgSum?.total ?? 0),
      activeWaSessions: Number(waCount?.total ?? 0),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;

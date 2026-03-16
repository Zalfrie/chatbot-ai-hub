import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, sum, count } from 'drizzle-orm';
import { db } from '../../config/database';
import { usageLogs, conversations } from '../../db/schema';
import { authMiddleware } from '../../middleware/auth.middleware';

const analyticsQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
    .optional(),
});

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// GET /api/clients/:clientId/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const queryParsed = analyticsQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: 'Validation error', details: queryParsed.error.flatten() });
    return;
  }

  const to = queryParsed.data.to ?? new Date().toISOString().split('T')[0]!;
  const from = queryParsed.data.from ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0]!;
  })();

  try {
    // Daily usage stats
    const dailyRows = await db
      .select({
        date: usageLogs.logDate,
        messages: sum(usageLogs.messageCount),
        tokens: sum(usageLogs.tokenCount),
      })
      .from(usageLogs)
      .where(
        and(
          eq(usageLogs.clientId, clientId),
          gte(usageLogs.logDate, from),
          lte(usageLogs.logDate, to),
        )
      )
      .groupBy(usageLogs.logDate)
      .orderBy(usageLogs.logDate);

    // Total messages in range
    const totalMessages = dailyRows.reduce((acc, r) => acc + Number(r.messages ?? 0), 0);
    const totalTokens = dailyRows.reduce((acc, r) => acc + Number(r.tokens ?? 0), 0);

    // Total conversations
    const [convCount] = await db
      .select({ total: count() })
      .from(conversations)
      .where(eq(conversations.clientId, clientId));

    res.json({
      totalMessages,
      totalTokens,
      totalConversations: Number(convCount?.total ?? 0),
      avgResponseTime: 0, // placeholder — requires response timing instrumentation
      dailyStats: dailyRows.map((r) => ({
        date: r.date,
        messages: Number(r.messages ?? 0),
        tokens: Number(r.tokens ?? 0),
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;

import http from 'http';
import { env } from './config/env';
import { logger } from './utils/logger';

async function startServer() {
  const app = (await import('./app')).default;
  const { db } = await import('./config/database');
  const { redis } = await import('./config/redis');
  const { sql } = await import('drizzle-orm');
  const { initSocketGateway } = await import('./socket/socket.gateway');
  const { whatsAppService } = await import('./modules/whatsapp/wa.service');
  const { createWaMessageHandler, waMessageHandlerChatService } = await import('./modules/whatsapp/wa.handler');

  const PORT = parseInt(env.PORT);

  try {
    // ── Database ────────────────────────────────────────────────────────
    logger.info('Connecting to database...');
    await db.execute(sql`SELECT 1`);
    logger.info('Database connected');

    // ── Redis ───────────────────────────────────────────────────────────
    logger.info('Connecting to Redis...');
    await redis.ping();
    logger.info('Redis connected');

    // ── HTTP + Socket.io ────────────────────────────────────────────────
    const server = http.createServer(app);
    initSocketGateway(server);
    logger.info('Socket.io initialized');

    // ── Wire WA message handler ─────────────────────────────────────────
    const waHandler = createWaMessageHandler(waMessageHandlerChatService);
    whatsAppService.setMessageHandler(waHandler);

    // ── Start listening ─────────────────────────────────────────────────
    server.listen(PORT, async () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info('Socket.io ready for WA dashboard connections');

      // ── Restore WA sessions from DB ───────────────────────────────────
      try {
        await whatsAppService.restoreActiveSessions();
      } catch (err) {
        logger.warn('WA session restore failed', { error: err });
      }
    });

    // ── Graceful shutdown ───────────────────────────────────────────────
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      server.close();
      await redis.quit();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();

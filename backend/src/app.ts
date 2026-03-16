import express, { Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requestLogger, errorHandler } from './middleware/error.middleware';
import chatRoutes from './modules/chat/chat.routes';
import waRoutes from './modules/whatsapp/wa.routes';
import authRoutes from './modules/auth/auth.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import clientRoutes from './modules/client/client.routes';
import chatbotRoutes from './modules/chatbot/chatbot.routes';
import knowledgeRoutes from './modules/knowledge/knowledge.routes';
import conversationRoutes from './modules/chat/conversation.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Public endpoints ──────────────────────────────────────────────────────
// Web widget chat (auth: X-Api-Key header)
app.use('/v1/chat', chatRoutes);

// ── Dashboard endpoints (auth: Bearer JWT) ────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/clients/:clientId/chatbot', chatbotRoutes);
app.use('/api/clients/:clientId/knowledge', knowledgeRoutes);
app.use('/api/clients/:clientId/conversations', conversationRoutes);
app.use('/api/clients/:clientId/analytics', analyticsRoutes);
// WA management: POST/GET /api/clients/:id/wa/connect|status|disconnect
app.use('/api/clients/:id/wa', waRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use('/{*path}', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// ── Global error handler ──────────────────────────────────────────────────
app.use(errorHandler);

export default app;

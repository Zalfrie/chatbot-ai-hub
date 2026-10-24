import { Request, Response } from 'express';
import { z } from 'zod';
import { ChatService } from './chat.service.js';
import { openEventStream } from '../../utils/sse.js';

const sendMessageSchema = z.object({
  // UUIDs only: server-generated WhatsApp (`wa_…`) and dashboard preview (`preview_…`)
  // session ids must not be reachable through the public, API-key endpoints
  session_id: z.uuid().optional(),
  message: z.string().min(1, 'message is required').max(2000, 'message too long (max 2000 chars)'),
  user_name: z.string().optional(),
  // The whatsapp channel is reserved for the Baileys handler
  channel: z.literal('web').default('web'),
});

export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  sendMessage = async (req: Request, res: Response): Promise<void> => {
    const parsed = sendMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { message, channel, user_name } = parsed.data;

    // Generate a session_id if not provided
    const sessionId = parsed.data.session_id ?? crypto.randomUUID();

    // clientId is set by apiKeyMiddleware
    const clientId = req.clientId!;

    // For web: use session_id as identifier; for WA: will be set by WA handler
    const userIdentifier = sessionId;

    const result = await this.chatService.processMessage({
      clientId,
      sessionId,
      channel,
      userMessage: message,
      userIdentifier,
      userName: user_name,
    });

    res.status(200).json({
      session_id: result.sessionId,
      reply: result.reply,
    });
  };

  streamMessage = async (req: Request, res: Response): Promise<void> => {
    const parsed = sendMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { message, channel, user_name } = parsed.data;
    const sessionId = parsed.data.session_id ?? crypto.randomUUID();
    const clientId = req.clientId!;

    const events = openEventStream(res);

    try {
      const stream = this.chatService.processMessageStream({
        clientId,
        sessionId,
        channel,
        userMessage: message,
        userIdentifier: sessionId,
        userName: user_name,
      });

      for await (const event of stream) {
        if (events.closed) break;
        events.send(event);
      }
    } catch {
      events.send({ type: 'error', message: 'Internal server error' });
    } finally {
      events.end();
    }
  };
}

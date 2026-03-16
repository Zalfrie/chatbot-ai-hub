import type { WASocket } from '@whiskeysockets/baileys';
import type { proto } from '@whiskeysockets/baileys';
import { ChatService } from '../chat/chat.service';
import { ChatbotRepository } from '../chatbot/chatbot.repository';
import { KnowledgeRepository } from '../knowledge/knowledge.repository';
import { ConversationRepository, UsageRepository } from '../chat/conversation.repository';

/**
 * Factory that creates the incoming-WhatsApp-message handler.
 * Injected into WhatsAppService via waService.setMessageHandler().
 */
export function createWaMessageHandler(chatService: ChatService) {
  return async (
    clientId: number,
    messages: unknown[],
    socket: WASocket,
  ): Promise<void> => {
    for (const raw of messages) {
      const message = raw as proto.IWebMessageInfo;

      // Skip: no key, outbound, broadcast, or group messages
      if (!message.key || message.key.fromMe) continue;
      const jid = message.key.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

      const body = extractText(message);
      if (!body) continue;

      const senderNumber = jid.split('@')[0]!;
      const sessionId = `wa_${clientId}_${senderNumber}`;

      try {
        console.log(`[WA:${clientId}] ← ${senderNumber}: ${body.slice(0, 80)}`);

        // Typing indicator
        await socket.sendPresenceUpdate('composing', jid);

        const result = await chatService.processMessage({
          clientId,
          sessionId,
          channel: 'whatsapp',
          userMessage: body,
          userIdentifier: senderNumber,
          userName: message.pushName ?? undefined,
        });

        // Send reply
        await socket.sendMessage(jid, { text: result.reply });

        // Clear typing
        await socket.sendPresenceUpdate('paused', jid);

        console.log(`[WA:${clientId}] → ${senderNumber}: ${result.reply.slice(0, 80)}`);
      } catch (err) {
        console.error(`[WA:${clientId}] Error handling message from ${senderNumber}:`, err);

        // Attempt to send a generic error reply so the user isn't left hanging
        try {
          await socket.sendMessage(jid, {
            text: 'Maaf, ada gangguan teknis saat ini. Silakan coba lagi sebentar ya 🙏',
          });
        } catch {
          // If even the error reply fails, silently drop
        }
      }
    }
  };
}

/** Extract plain-text body from any supported WhatsApp message type */
function extractText(msg: proto.IWebMessageInfo): string | null {
  const m = msg.message;
  if (!m) return null;

  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    null
  );
}

/**
 * Singleton chat service for the WA handler.
 * Uses the same repositories as the HTTP chat endpoint.
 */
export const waMessageHandlerChatService = new ChatService(
  new ChatbotRepository(),
  new KnowledgeRepository(),
  new ConversationRepository(),
  new UsageRepository(),
);

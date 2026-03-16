import {
  pgTable,
  bigserial,
  varchar,
  timestamp,
  index,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';
import { clients } from './clients.schema';
import { chatbots } from './chatbots.schema';

export const conversationChannelEnum = pgEnum('conversation_channel', ['web', 'whatsapp']);
export const conversationStatusEnum = pgEnum('conversation_status', ['active', 'closed', 'escalated']);

export const conversations = pgTable('conversations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: bigserial('client_id', { mode: 'number' }).notNull().references(() => clients.id),
  chatbotId: bigserial('chatbot_id', { mode: 'number' }).notNull().references(() => chatbots.id),
  sessionId: varchar('session_id', { length: 128 }).notNull().unique(),
  channel: conversationChannelEnum('channel').notNull(),
  userIdentifier: varchar('user_identifier', { length: 100 }),
  userName: varchar('user_name', { length: 255 }),
  status: conversationStatusEnum('status').default('active'),
  metadata: jsonb('metadata'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [
  index('idx_conv_client').on(table.clientId),
  index('idx_conv_session').on(table.sessionId),
  index('idx_conv_user').on(table.clientId, table.userIdentifier),
  index('idx_conv_status').on(table.status, table.lastMessageAt),
]);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

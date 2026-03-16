import {
  pgTable,
  bigserial,
  varchar,
  text,
  timestamp,
  index,
  integer,
  boolean,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { conversations } from './conversations.schema';

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);

export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  conversationId: bigserial('conversation_id', { mode: 'number' }).notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  tokensUsed: integer('tokens_used'),
  waMessageId: varchar('wa_message_id', { length: 100 }),
  isError: boolean('is_error').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_messages_conv').on(table.conversationId, table.createdAt),
]);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

import {
  pgTable,
  bigserial,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  numeric,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { clients } from './clients.schema';

export const channelEnum = pgEnum('channel', ['web', 'whatsapp', 'both']);
export const aiProviderEnum = pgEnum('ai_provider', ['claude', 'openai', 'gemini', 'groq']);

export const chatbots = pgTable('chatbots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: bigserial('client_id', { mode: 'number' }).notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  welcomeMessage: text('welcome_message'),
  language: varchar('language', { length: 10 }).default('id'),
  aiProvider: aiProviderEnum('ai_provider').default('groq'),
  aiModel: varchar('ai_model', { length: 100 }).default('llama-3.3-70b-versatile'),
  temperature: numeric('temperature', { precision: 3, scale: 2 }).default('0.85'),
  maxTokens: integer('max_tokens').default(1000),
  channel: channelEnum('channel').default('both'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('chatbots_client_id_unique').on(table.clientId),
]);

export type Chatbot = typeof chatbots.$inferSelect;
export type NewChatbot = typeof chatbots.$inferInsert;

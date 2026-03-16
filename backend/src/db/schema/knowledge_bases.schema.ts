import {
  pgTable,
  bigserial,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  smallint,
} from 'drizzle-orm/pg-core';
import { clients } from './clients.schema';

export const knowledgeBases = pgTable('knowledge_bases', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: bigserial('client_id', { mode: 'number' }).notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  category: varchar('category', { length: 100 }),
  priority: smallint('priority').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_knowledge_client').on(table.clientId, table.isActive),
]);

export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBases.$inferInsert;

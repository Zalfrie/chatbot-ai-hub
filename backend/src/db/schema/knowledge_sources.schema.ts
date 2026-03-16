import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clients } from './clients.schema';
import { knowledgeBases } from './knowledge_bases.schema';

export const knowledgeSources = pgTable('knowledge_sources', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: bigint('client_id', { mode: 'number' }).notNull().references(() => clients.id, { onDelete: 'cascade' }),
  knowledgeId: bigint('knowledge_id', { mode: 'number' }).notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  sourceType: varchar('source_type', { length: 20 }).notNull(),
  sourceUrl: varchar('source_url', { length: 500 }),
  lastContent: text('last_content'),
  lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('chk_source_type', sql`${table.sourceType} IN ('manual', 'file', 'url', 'text')`),
]);

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;

import {
  pgTable,
  bigserial,
  varchar,
  timestamp,
  boolean,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['free', 'basic', 'pro']);

export const clients = pgTable('clients', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  apiKey: varchar('api_key', { length: 64 }).notNull().unique(),
  webhookUrl: varchar('webhook_url', { length: 500 }),
  plan: planEnum('plan').default('free'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_clients_api_key').on(table.apiKey),
  index('idx_clients_slug').on(table.slug),
]);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

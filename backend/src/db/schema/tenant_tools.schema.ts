import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clients } from './clients.schema';

export const tenantTools = pgTable('tenant_tools', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: bigint('client_id', { mode: 'number' }).notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  parametersSchema: jsonb('parameters_schema').notNull(),
  webhookUrl: varchar('webhook_url', { length: 500 }).notNull(),
  httpMethod: varchar('http_method', { length: 10 }).default('POST'),
  headersTemplate: jsonb('headers_template'),
  timeoutMs: integer('timeout_ms').default(5000),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('tenant_tools_client_name_unique').on(table.clientId, table.name),
  index('idx_tools_client').on(table.clientId, table.isActive),
  check('http_method_check', sql`${table.httpMethod} IN ('GET', 'POST')`),
]);

export type TenantToolRow = typeof tenantTools.$inferSelect;
export type NewTenantTool = typeof tenantTools.$inferInsert;

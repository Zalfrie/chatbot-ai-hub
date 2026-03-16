import {
  pgTable,
  bigserial,
  timestamp,
  index,
  integer,
  date,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { clients } from './clients.schema';

export const usageChannelEnum = pgEnum('usage_channel', ['web', 'whatsapp']);

export const usageLogs = pgTable('usage_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: bigserial('client_id', { mode: 'number' }).notNull().references(() => clients.id),
  logDate: date('log_date').notNull().$defaultFn(() => new Date().toISOString().split('T')[0]),
  channel: usageChannelEnum('channel').notNull(),
  messageCount: integer('message_count').default(0),
  tokenCount: integer('token_count').default(0),
}, (table) => [
  index('idx_usage_client_date').on(table.clientId, table.logDate),
  uniqueIndex('usage_logs_client_date_channel_unique').on(table.clientId, table.logDate, table.channel),
]);

export type UsageLog = typeof usageLogs.$inferSelect;
export type NewUsageLog = typeof usageLogs.$inferInsert;

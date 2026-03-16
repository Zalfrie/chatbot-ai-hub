import {
  pgTable,
  bigserial,
  varchar,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { clients } from './clients.schema';

export const waSessionStatusEnum = pgEnum('wa_session_status', ['disconnected', 'connecting', 'connected', 'banned']);

export const waSessions = pgTable('wa_sessions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: bigserial('client_id', { mode: 'number' }).notNull().unique().references(() => clients.id, { onDelete: 'cascade' }),
  waNumber: varchar('wa_number', { length: 30 }).notNull(),
  sessionData: text('session_data'),
  status: waSessionStatusEnum('status').default('disconnected'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type WaSession = typeof waSessions.$inferSelect;
export type NewWaSession = typeof waSessions.$inferInsert;

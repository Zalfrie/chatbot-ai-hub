import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { conversations } from '../../src/db/schema';

// Capture what Drizzle receives so the generated SQL can be inspected
const captured = vi.hoisted(() => ({
  where: undefined as unknown,
  orderBy: [] as unknown[],
  limit: undefined as number | undefined,
  rows: [] as unknown[],
}));

vi.mock('../../src/config/database', () => {
  const chain = {
    from: () => chain,
    where: (condition: unknown) => {
      captured.where = condition;
      return chain;
    },
    orderBy: (...columns: unknown[]) => {
      captured.orderBy = columns;
      return chain;
    },
    limit: async (n: number) => {
      captured.limit = n;
      return captured.rows;
    },
  };
  return { db: { select: () => chain } };
});

import { ConversationRepository } from '../../src/modules/chat/conversation.repository';

beforeEach(() => {
  captured.where = undefined;
  captured.orderBy = [];
  captured.limit = undefined;
  captured.rows = [];
});

describe('ConversationRepository.findBySessionId', () => {

  it('scopes the lookup to the tenant: filters on client_id and session_id', async () => {
    await new ConversationRepository().findBySessionId(7, 'b3c1f0a2-5d4e-4f6a-8b7c-9d0e1f2a3b4c');

    const { sql, params } = new PgDialect().sqlToQuery(captured.where as SQL);

    // Exact match: an `or` here, or dropping either condition, must fail this test
    expect(sql).toBe('("conversations"."client_id" = $1 and "conversations"."session_id" = $2)');
    expect(params).toEqual([7, 'b3c1f0a2-5d4e-4f6a-8b7c-9d0e1f2a3b4c']);
  });
});

describe('ConversationRepository.getHistory', () => {
  it('selects the most recent messages of the conversation', async () => {
    await new ConversationRepository().getHistory(42, 20);

    const dialect = new PgDialect();
    const where = dialect.sqlToQuery(captured.where as SQL);
    expect(where.sql).toBe('"messages"."conversation_id" = $1');
    expect(where.params).toEqual([42]);
    // Newest first, so LIMIT keeps the latest turns; id breaks ties between equal timestamps
    expect(captured.orderBy.map((column) => dialect.sqlToQuery(column as SQL).sql)).toEqual([
      '"messages"."created_at" desc',
      '"messages"."id" desc',
    ]);
    expect(captured.limit).toBe(20);
  });

  it('returns them oldest first, the order the prompt and the widget need', async () => {
    // What the newest-first query returns
    captured.rows = [
      { id: 30, content: 'third' },
      { id: 29, content: 'second' },
      { id: 28, content: 'first' },
    ];

    const history = await new ConversationRepository().getHistory(42, 3);

    expect(history.map((m) => m.content)).toEqual(['first', 'second', 'third']);
  });
});

describe('conversations table', () => {
  it('makes session_id unique per tenant, not globally', () => {
    const config = getTableConfig(conversations);

    expect(config.columns.find((c) => c.name === 'session_id')!.isUnique).toBe(false);
    expect(config.uniqueConstraints.map((u) => u.columns.map((c) => c.name))).toContainEqual([
      'client_id',
      'session_id',
    ]);
  });
});

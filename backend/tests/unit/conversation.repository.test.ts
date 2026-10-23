import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { conversations } from '../../src/db/schema';

// Capture the WHERE condition Drizzle receives so the generated SQL can be inspected
const captured = vi.hoisted(() => ({ where: undefined as unknown }));

vi.mock('../../src/config/database', () => {
  const chain = {
    from: () => chain,
    where: (condition: unknown) => {
      captured.where = condition;
      return chain;
    },
    limit: async () => [],
  };
  return { db: { select: () => chain } };
});

import { ConversationRepository } from '../../src/modules/chat/conversation.repository';

describe('ConversationRepository.findBySessionId', () => {
  beforeEach(() => {
    captured.where = undefined;
  });

  it('scopes the lookup to the tenant: filters on client_id and session_id', async () => {
    await new ConversationRepository().findBySessionId(7, 'b3c1f0a2-5d4e-4f6a-8b7c-9d0e1f2a3b4c');

    const { sql, params } = new PgDialect().sqlToQuery(captured.where as SQL);

    // Exact match: an `or` here, or dropping either condition, must fail this test
    expect(sql).toBe('("conversations"."client_id" = $1 and "conversations"."session_id" = $2)');
    expect(params).toEqual([7, 'b3c1f0a2-5d4e-4f6a-8b7c-9d0e1f2a3b4c']);
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

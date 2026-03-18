import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────
// We create the mock function references OUTSIDE the factory so we can
// reference them directly in tests without juggling constructor instances.

const mockClaudeStream = vi.fn();
const mockGroqCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: mockClaudeStream },
  })),
}));

vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGroqCreate } },
  })),
}));

vi.mock('../../src/config/env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-claude-key',
    GROQ_API_KEY: 'test-groq-key',
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build an async iterable from an array of values */
async function* makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

/** Collect all yielded values from an AsyncGenerator */
async function collect<T>(gen: AsyncGenerator<T> | AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

const baseRequest = {
  model: 'test-model',
  temperature: 0.7,
  maxTokens: 100,
  system: 'You are a test assistant.',
  messages: [{ role: 'user' as const, content: 'Hello' }],
};

// ─── ClaudeProvider.chatStream ────────────────────────────────────────────────

describe('ClaudeProvider.chatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('yields text chunks from content_block_delta events', async () => {
    const events = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
      { type: 'message_stop' },
    ];
    mockClaudeStream.mockReturnValue(makeAsyncIterable(events));

    const { ClaudeProvider } = await import('../../src/providers/ai/claude.provider');
    const provider = new ClaudeProvider();

    const chunks = await collect(provider.chatStream(baseRequest));

    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('skips non-text_delta events', async () => {
    const events = [
      { type: 'message_start', message: {} },
      { type: 'content_block_start', content_block: { type: 'text' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_stop' },
    ];
    mockClaudeStream.mockReturnValue(makeAsyncIterable(events));

    const { ClaudeProvider } = await import('../../src/providers/ai/claude.provider');
    const provider = new ClaudeProvider();

    const chunks = await collect(provider.chatStream(baseRequest));

    expect(chunks).toEqual(['Hi']);
  });

  it('yields nothing if the stream has no text deltas', async () => {
    mockClaudeStream.mockReturnValue(makeAsyncIterable([
      { type: 'message_start' },
      { type: 'message_stop' },
    ]));

    const { ClaudeProvider } = await import('../../src/providers/ai/claude.provider');
    const provider = new ClaudeProvider();

    const chunks = await collect(provider.chatStream(baseRequest));

    expect(chunks).toEqual([]);
  });

  it('calls messages.stream with correct parameters', async () => {
    mockClaudeStream.mockReturnValue(makeAsyncIterable([]));

    const { ClaudeProvider } = await import('../../src/providers/ai/claude.provider');
    const provider = new ClaudeProvider();

    await collect(provider.chatStream(baseRequest));

    expect(mockClaudeStream).toHaveBeenCalledWith({
      model: 'test-model',
      temperature: 0.7,
      max_tokens: 100,
      system: 'You are a test assistant.',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('propagates errors thrown by the stream', async () => {
    async function* errorStream() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } };
      throw new Error('Stream interrupted');
    }
    mockClaudeStream.mockReturnValue(errorStream());

    const { ClaudeProvider } = await import('../../src/providers/ai/claude.provider');
    const provider = new ClaudeProvider();

    await expect(collect(provider.chatStream(baseRequest))).rejects.toThrow('Stream interrupted');
  });
});

// ─── GroqProvider.chatStream ──────────────────────────────────────────────────

describe('GroqProvider.chatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('yields content from streaming chunks', async () => {
    const chunks = [
      { choices: [{ delta: { content: 'Halo' } }] },
      { choices: [{ delta: { content: ' apa' } }] },
      { choices: [{ delta: { content: ' kabar?' } }] },
    ];
    mockGroqCreate.mockResolvedValue(makeAsyncIterable(chunks));

    const { GroqProvider } = await import('../../src/providers/ai/groq.provider');
    const provider = new GroqProvider();

    const results = await collect(provider.chatStream(baseRequest));

    expect(results).toEqual(['Halo', ' apa', ' kabar?']);
  });

  it('skips chunks where delta.content is empty or undefined', async () => {
    const chunks = [
      { choices: [{ delta: { content: 'Hello' } }] },
      { choices: [{ delta: {} }] },               // No content field
      { choices: [{ delta: { content: '' } }] },  // Empty string
      { choices: [{ delta: { content: '!' } }] },
    ];
    mockGroqCreate.mockResolvedValue(makeAsyncIterable(chunks));

    const { GroqProvider } = await import('../../src/providers/ai/groq.provider');
    const provider = new GroqProvider();

    const results = await collect(provider.chatStream(baseRequest));

    expect(results).toEqual(['Hello', '!']);
  });

  it('calls completions.create with stream: true and correct params', async () => {
    mockGroqCreate.mockResolvedValue(makeAsyncIterable([]));

    const { GroqProvider } = await import('../../src/providers/ai/groq.provider');
    const provider = new GroqProvider();

    await collect(provider.chatStream(baseRequest));

    expect(mockGroqCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        temperature: 0.7,
        max_tokens: 100,
        stream: true,
        messages: expect.arrayContaining([
          { role: 'system', content: 'You are a test assistant.' },
          { role: 'user', content: 'Hello' },
        ]),
      }),
    );
  });

  it('prepends system message as first entry in messages array', async () => {
    mockGroqCreate.mockResolvedValue(makeAsyncIterable([]));

    const { GroqProvider } = await import('../../src/providers/ai/groq.provider');
    const provider = new GroqProvider();

    await collect(provider.chatStream({
      ...baseRequest,
      messages: [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Reply' },
        { role: 'user', content: 'Second' },
      ],
    }));

    const callArgs = mockGroqCreate.mock.calls[0][0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
    expect(callArgs.messages).toHaveLength(4);
  });

  it('propagates errors thrown by the stream', async () => {
    async function* errorStream() {
      yield { choices: [{ delta: { content: 'partial' } }] };
      throw new Error('Quota exceeded');
    }
    mockGroqCreate.mockResolvedValue(errorStream());

    const { GroqProvider } = await import('../../src/providers/ai/groq.provider');
    const provider = new GroqProvider();

    await expect(collect(provider.chatStream(baseRequest))).rejects.toThrow('Quota exceeded');
  });
});

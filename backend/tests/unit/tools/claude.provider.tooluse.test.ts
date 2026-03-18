import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeProvider } from '../../../src/providers/ai/claude.provider';
import type { ChatRequest } from '../../../src/providers/ai/ai.interface';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
        stream: vi.fn(),
      },
    })),
  };
});

vi.mock('../../../src/config/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key' },
}));

const baseRequest: ChatRequest = {
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.85,
  maxTokens: 1000,
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Ada stok Red Velvet?' }],
  tools: [
    {
      name: 'cek_stok_kue',
      description: 'Cek stok kue berdasarkan nama produk',
      input_schema: {
        type: 'object',
        properties: { nama_produk: { type: 'string', description: 'Nama kue' } },
        required: ['nama_produk'],
      },
    },
  ],
};

describe('ClaudeProvider — tool use', () => {
  let provider: ClaudeProvider;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    provider = new ClaudeProvider();
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    mockCreate = (provider as any).client.messages.create;
  });

  it('returns toolCalls when Claude responds with tool_use block', async () => {
    mockCreate.mockResolvedValue({
      id: 'msg_1',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'cek_stok_kue',
          input: { nama_produk: 'Red Velvet' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 50, output_tokens: 20 },
      model: 'claude-3-5-sonnet-20241022',
    });

    const response = await provider.chat(baseRequest);

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe('cek_stok_kue');
    expect(response.toolCalls![0].args).toEqual({ nama_produk: 'Red Velvet' });
    expect(response.stopReason).toBe('tool_use');
    expect(response.content).toBe('');
  });

  it('returns content string when Claude responds with text block', async () => {
    mockCreate.mockResolvedValue({
      id: 'msg_2',
      content: [{ type: 'text', text: 'Stok Red Velvet masih ada 3 loyang!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 80, output_tokens: 25 },
      model: 'claude-3-5-sonnet-20241022',
    });

    const response = await provider.chat(baseRequest);

    expect(response.content).toBe('Stok Red Velvet masih ada 3 loyang!');
    expect(response.toolCalls).toBeUndefined();
    expect(response.stopReason).toBe('end_turn');
  });

  it('handles mixed text + tool_use blocks', async () => {
    mockCreate.mockResolvedValue({
      id: 'msg_3',
      content: [
        { type: 'text', text: 'Saya akan cek stoknya...' },
        {
          type: 'tool_use',
          id: 'toolu_02',
          name: 'cek_stok_kue',
          input: { nama_produk: 'Taro' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 60, output_tokens: 30 },
      model: 'claude-3-5-sonnet-20241022',
    });

    const response = await provider.chat(baseRequest);

    expect(response.content).toBe('Saya akan cek stoknya...');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe('cek_stok_kue');
  });

  it('passes tool_result content blocks to Claude correctly', async () => {
    const requestWithToolResult: ChatRequest = {
      ...baseRequest,
      messages: [
        { role: 'user', content: 'Ada stok Red Velvet?' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01', name: 'cek_stok_kue', input: { nama_produk: 'Red Velvet' } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: 'Stok: 3 loyang' }],
        },
      ],
    };

    mockCreate.mockResolvedValue({
      id: 'msg_4',
      content: [{ type: 'text', text: 'Red Velvet stoknya 3 loyang kak!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20 },
      model: 'claude-3-5-sonnet-20241022',
    });

    const response = await provider.chat(requestWithToolResult);

    expect(response.content).toBe('Red Velvet stoknya 3 loyang kak!');

    // Verify Claude received the messages in the right format
    const callArgs = mockCreate.mock.calls[0][0];
    const lastMessage = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(Array.isArray(lastMessage.content)).toBe(true);
    expect(lastMessage.content[0].type).toBe('tool_result');
  });
});

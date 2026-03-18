import Groq from 'groq-sdk';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'groq-sdk/resources/chat/completions';
import { AIProvider, ChatMessage, ChatRequest, ChatResponse, ToolCallRequest } from './ai.interface';
import { env } from '../../config/env';

function toGroqMessages(
  system: string,
  messages: ChatMessage[],
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
  ];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      continue;
    }

    // Array content — detect tool_use (assistant) and tool_result (user) blocks
    const hasToolUse = msg.content.some((p) => p.type === 'tool_use');
    const hasToolResult = msg.content.some((p) => p.type === 'tool_result');

    if (msg.role === 'assistant' && hasToolUse) {
      const toolCalls = msg.content
        .filter((p): p is Extract<typeof p, { type: 'tool_use' }> => p.type === 'tool_use')
        .map((p) => ({
          id: p.id,
          type: 'function' as const,
          function: { name: p.name, arguments: JSON.stringify(p.input) },
        }));
      result.push({ role: 'assistant', content: null, tool_calls: toolCalls });

    } else if (msg.role === 'user' && hasToolResult) {
      // Groq expects one tool message per result
      for (const part of msg.content) {
        if (part.type === 'tool_result') {
          result.push({
            role: 'tool',
            tool_call_id: part.tool_use_id,
            content: part.content,
          } as ChatCompletionMessageParam);
        }
      }
    } else {
      // Fallback: extract text parts as plain string
      const text = msg.content
        .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .join('');
      result.push({ role: msg.role as 'user' | 'assistant', content: text });
    }
  }

  return result;
}

export class GroqProvider implements AIProvider {
  private client: Groq;

  constructor() {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set');
    }
    this.client = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const tools: ChatCompletionTool[] | undefined = request.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const completion = await this.client.chat.completions.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      messages: toGroqMessages(request.system, request.messages),
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error('Groq returned empty response');

    // Extract tool calls if present
    const toolCalls: ToolCallRequest[] = [];
    if (choice.message.tool_calls?.length) {
      for (const tc of choice.message.tool_calls) {
        try {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
          });
        } catch {
          // skip malformed tool call
        }
      }
    }

    const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : 'end_turn';

    return {
      content: choice.message.content ?? '',
      tokensUsed: completion.usage?.total_tokens ?? 0,
      model: completion.model,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      stopReason,
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      messages: toGroqMessages(request.system, request.messages),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

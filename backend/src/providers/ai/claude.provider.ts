import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { AIProvider, ChatMessage, ChatRequest, ChatResponse, ToolCallRequest } from './ai.interface';
import { env } from '../../config/env';

function toAnthropicMessages(messages: ChatMessage[]): MessageParam[] {
  const result: MessageParam[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    // Array content — convert to Anthropic ContentBlock format
    const blocks: Anthropic.Messages.ContentBlockParam[] = [];
    for (const part of msg.content) {
      if (part.type === 'text') {
        blocks.push({ type: 'text', text: part.text });
      } else if (part.type === 'tool_use') {
        blocks.push({ type: 'tool_use', id: part.id, name: part.name, input: part.input });
      } else if (part.type === 'tool_result') {
        blocks.push({ type: 'tool_result', tool_use_id: part.tool_use_id, content: part.content });
      }
    }
    result.push({ role: msg.role, content: blocks });
  }

  return result;
}

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const tools: Tool[] | undefined = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Tool['input_schema'],
    }));

    const response = await this.client.messages.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: toAnthropicMessages(request.messages),
      ...(tools?.length ? { tools } : {}),
    });

    // Extract tool calls if AI wants to use tools
    const toolCalls: ToolCallRequest[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        const toolUse = block as ToolUseBlock;
        toolCalls.push({
          id: toolUse.id,
          name: toolUse.name,
          args: toolUse.input as Record<string, unknown>,
        });
      }
    }

    const stopReason = response.stop_reason === 'tool_use' ? 'tool_use'
      : response.stop_reason === 'max_tokens' ? 'max_tokens'
      : 'end_turn';

    return {
      content: textContent,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: response.model,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      stopReason,
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const stream = this.client.messages.stream({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: toAnthropicMessages(request.messages),
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, ChatRequest, ChatResponse } from './ai.interface';
import { env } from '../../config/env';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages,
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('Claude returned empty or non-text response');
    }

    return {
      content: block.text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: response.model,
    };
  }
}

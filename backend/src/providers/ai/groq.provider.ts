import Groq from 'groq-sdk';
import { AIProvider, ChatRequest, ChatResponse } from './ai.interface';
import { env } from '../../config/env';

export class GroqProvider implements AIProvider {
  private client: Groq;

  constructor() {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set');
    }
    this.client = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const completion = await this.client.chat.completions.create({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      messages: [
        { role: 'system', content: request.system },
        ...request.messages,
      ],
    });

    const choice = completion.choices[0];
    if (!choice?.message?.content) {
      throw new Error('Groq returned empty response');
    }

    return {
      content: choice.message.content,
      tokensUsed: completion.usage?.total_tokens ?? 0,
      model: completion.model,
    };
  }
}

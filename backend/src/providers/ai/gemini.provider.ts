import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, ChatRequest, ChatResponse } from './ai.interface';
import { env } from '../../config/env';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = this.client.getGenerativeModel({
      model: request.model,
      systemInstruction: request.system,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      },
    });

    // All messages except the last one become history
    const history = request.messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage) {
      throw new Error('No messages provided');
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const text = result.response.text();

    if (!text) {
      throw new Error('Gemini returned empty response');
    }

    return {
      content: text,
      tokensUsed: result.response.usageMetadata?.totalTokenCount ?? 0,
      model: request.model,
    };
  }
}

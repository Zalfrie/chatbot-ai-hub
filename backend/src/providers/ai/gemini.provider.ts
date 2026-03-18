import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, ChatMessage, ChatRequest, ChatResponse } from './ai.interface';
import { env } from '../../config/env';

/** Gemini doesn't support tool_use blocks — extract plain text from any content type. */
function extractText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

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

    const history = request.messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: extractText(msg.content) }],
    }));

    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage) {
      throw new Error('No messages provided');
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(extractText(lastMessage.content));
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

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const model = this.client.getGenerativeModel({
      model: request.model,
      systemInstruction: request.system,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      },
    });

    const history = request.messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: extractText(msg.content) }],
    }));

    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage) {
      throw new Error('No messages provided');
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(extractText(lastMessage.content));

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }
}

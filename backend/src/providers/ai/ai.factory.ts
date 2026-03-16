import { AIProvider } from './ai.interface';

type ProviderName = 'groq' | 'claude' | 'openai' | 'gemini';

export async function createAIProvider(providerName: ProviderName): Promise<AIProvider> {
  switch (providerName) {
    case 'groq': {
      const { GroqProvider } = await import('./groq.provider');
      return new GroqProvider();
    }
    case 'claude': {
      const { ClaudeProvider } = await import('./claude.provider');
      return new ClaudeProvider();
    }
    case 'gemini': {
      const { GeminiProvider } = await import('./gemini.provider');
      return new GeminiProvider();
    }
    default:
      throw new Error(`AI provider "${providerName}" is not supported`);
  }
}

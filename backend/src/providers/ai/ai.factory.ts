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
    default:
      throw new Error(`AI provider "${providerName}" is not supported`);
  }
}

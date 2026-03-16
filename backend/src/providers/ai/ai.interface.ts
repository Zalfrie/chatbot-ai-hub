export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  temperature: number;
  maxTokens: number;
  system: string;
  messages: ChatMessage[];
}

export interface ChatResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
}

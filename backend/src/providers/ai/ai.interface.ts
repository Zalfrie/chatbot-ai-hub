export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | MessageContentPart[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  temperature: number;
  maxTokens: number;
  system: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  content: string;
  tokensUsed: number;
  model: string;
  toolCalls?: ToolCallRequest[];
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  /** Yields text chunks as they arrive from the AI provider. */
  chatStream(request: ChatRequest): AsyncGenerator<string>;
}

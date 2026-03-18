export interface TenantTool {
  id: number;
  clientId: number;
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  webhookUrl: string;
  httpMethod: 'GET' | 'POST';
  headersTemplate: Record<string, string> | null;
  timeoutMs: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolDefinitionForAI {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolExecutionResult {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
  error?: string;
}

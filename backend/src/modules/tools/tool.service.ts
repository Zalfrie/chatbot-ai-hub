import { toolRepository } from './tool.repository';
import { toolExecutor } from './tool.executor';
import { ToolDefinitionForAI, ToolExecutionResult } from './tool.types';
import { ToolCallRequest } from '../../providers/ai/ai.interface';
import { logger } from '../../utils/logger';

export class ToolService {
  /**
   * Load active tools and convert to AI-ready ToolDefinition format.
   */
  async getToolDefinitions(clientId: number): Promise<ToolDefinitionForAI[]> {
    const tools = await toolRepository.findActive(clientId);
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parametersSchema as ToolDefinitionForAI['input_schema'],
    }));
  }

  /**
   * Execute a batch of tool calls requested by the AI.
   * Always returns a result (never throws) so the agentic loop can continue.
   */
  async executeAll(
    toolCalls: ToolCallRequest[],
    clientId: number,
  ): Promise<ToolExecutionResult[]> {
    const tools = await toolRepository.findActive(clientId);
    const toolMap = new Map(tools.map((t) => [t.name, t]));

    const results = await Promise.all(
      toolCalls.map(async (tc): Promise<ToolExecutionResult> => {
        const startMs = Date.now();
        const tool = toolMap.get(tc.name);

        if (!tool) {
          return {
            toolName: tc.name,
            toolCallId: tc.id,
            args: tc.args,
            result: `Tool '${tc.name}' tidak ditemukan.`,
            durationMs: 0,
            error: 'not_found',
          };
        }

        const result = await toolExecutor.execute(tool, tc.args, clientId);
        const durationMs = Date.now() - startMs;

        logger.info(`Tool executed: ${tc.name} (${durationMs}ms)`, { clientId, args: tc.args });

        return {
          toolName: tc.name,
          toolCallId: tc.id,
          args: tc.args,
          result,
          durationMs,
        };
      }),
    );

    return results;
  }

  /**
   * Test a tool with manual input — used from the dashboard test panel.
   */
  async testTool(
    toolId: number,
    clientId: number,
    args: Record<string, unknown>,
  ): Promise<{ result: string; durationMs: number }> {
    const tool = await toolRepository.findById(toolId, clientId);
    if (!tool) throw new Error(`Tool not found`);

    const startMs = Date.now();
    const result = await toolExecutor.execute(tool, args, clientId);
    return { result, durationMs: Date.now() - startMs };
  }
}

export const toolService = new ToolService();

import { TenantTool } from './tool.types';
import { logger } from '../../utils/logger';

const HARD_TIMEOUT_MS = 10_000;

export class ToolExecutor {
  /**
   * Execute a tool by calling its webhook URL.
   * Returns the result as a string. On timeout or HTTP error, returns an error message string.
   */
  async execute(
    tool: TenantTool,
    args: Record<string, unknown>,
    clientId: number,
  ): Promise<string> {
    const timeout = Math.min(tool.timeoutMs, HARD_TIMEOUT_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const payload = {
      tool_name: tool.name,
      args,
      client_id: clientId,
      timestamp: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((tool.headersTemplate as Record<string, string>) ?? {}),
    };

    try {
      let url = tool.webhookUrl;
      let body: string | undefined = JSON.stringify(payload);
      let method = tool.httpMethod;

      if (method === 'GET') {
        // Append args as query params for GET requests
        const params = new URLSearchParams(
          Object.entries(args).map(([k, v]) => [k, String(v)]),
        );
        url = `${url}?${params.toString()}`;
        body = undefined;
        delete headers['Content-Type'];
      }

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        logger.warn(`Tool ${tool.name} returned HTTP ${response.status}`, { clientId });
        return `Tool ${tool.name} gagal dengan status ${response.status}: ${text.slice(0, 200)}`;
      }

      // Try to extract a "result" field from JSON response
      try {
        const json = JSON.parse(text) as { result?: unknown };
        if (json.result !== undefined) {
          return String(json.result);
        }
        return text;
      } catch {
        return text;
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        logger.warn(`Tool ${tool.name} timed out after ${timeout}ms`, { clientId });
        return `Tool ${tool.name} tidak merespons (timeout ${timeout}ms), jawab berdasarkan pengetahuan yang ada.`;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Tool ${tool.name} execution error: ${message}`, { clientId });
      return `Tool ${tool.name} error: ${message}`;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const toolExecutor = new ToolExecutor();

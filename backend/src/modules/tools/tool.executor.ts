import { TenantTool } from './tool.types.js';
import { logger } from '../../utils/logger.js';
import { safeFetch } from '../../utils/safe-fetch.js';

const HARD_TIMEOUT_MS = 10_000;
// The result goes into the AI context, so a webhook answer has no reason to be larger
const MAX_RESPONSE_BYTES = 256 * 1024;

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
      const method = tool.httpMethod;

      if (method === 'GET') {
        // Append args as query params for GET requests, after any the URL already has
        const withArgs = new URL(url);
        for (const [k, v] of Object.entries(args)) withArgs.searchParams.append(k, String(v));
        url = withArgs.toString();
        body = undefined;
        delete headers['Content-Type'];
      }

      // No redirects: a webhook answers itself, and its headers may carry the tenant's credentials
      const response = await safeFetch(url, {
        method,
        headers,
        body,
        timeoutMs: timeout,
        maxBytes: MAX_RESPONSE_BYTES,
      });

      const text = response.text;

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
      const name = (err as { name?: string }).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        logger.warn(`Tool ${tool.name} timed out after ${timeout}ms`, { clientId });
        return `Tool ${tool.name} tidak merespons (timeout ${timeout}ms), jawab berdasarkan pengetahuan yang ada.`;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Tool ${tool.name} execution error: ${message}`, { clientId });
      return `Tool ${tool.name} error: ${message}`;
    }
  }
}

export const toolExecutor = new ToolExecutor();

/**
 * useSSE — Reusable composable for consuming Server-Sent Events over a POST request.
 *
 * Supported event types (backward-compatible):
 *   data: {"type":"session","session_id":"..."}\n\n
 *   data: {"type":"chunk","content":"Hello"}\n\n
 *   data: {"type":"tool_call","tool_name":"cek_stok","args":{...}}\n\n
 *   data: {"type":"tool_result","tool_name":"cek_stok","result":"..."}\n\n
 *   data: {"type":"done","tokens_used":42}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 */

export type SSEEvent =
  | { type: 'session'; session_id: string }
  | { type: 'chunk'; content: string }
  | { type: 'tool_call'; tool_name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool_name: string; result: string }
  | { type: 'done'; tokens_used: number }
  | { type: 'error'; message: string }

export interface SSECallbacks {
  /** Called for every raw event — useful for custom handling (e.g. tool_call/tool_result) */
  onEvent?: (event: Record<string, unknown>) => void
  onSession?: (sessionId: string) => void
  onChunk?: (content: string) => void
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
  onToolResult?: (toolName: string, result: string) => void
  onDone?: (tokensUsed: number) => void
  onError?: (message: string) => void
}

export function useSSE() {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBase as string

  /**
   * Stream a chat message from the preview endpoint (JWT auth — dashboard use).
   */
  async function streamPreview(
    clientId: string | number,
    body: { message: string; session_id?: string },
    callbacks: SSECallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const authStore = useAuthStore()
    const token = authStore.accessToken

    const res = await fetch(
      `${baseURL}/api/clients/${clientId}/conversations/stream/preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      },
    )

    if (!res.ok || !res.body) {
      callbacks.onError?.(`Request failed (${res.status})`)
      return
    }

    await _consumeStream(res.body, callbacks)
  }

  /**
   * Stream a chat message from the widget endpoint (API Key auth).
   */
  async function streamWidget(
    apiKey: string,
    body: { message: string; session_id?: string },
    callbacks: SSECallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch(`${baseURL}/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok || !res.body) {
      callbacks.onError?.(`Request failed (${res.status})`)
      return
    }

    await _consumeStream(res.body, callbacks)
  }

  async function _consumeStream(
    body: ReadableStream<Uint8Array>,
    callbacks: SSECallbacks,
  ): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse complete SSE blocks (separated by double newlines)
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
          if (!dataLine) continue

          let event: SSEEvent
          try {
            event = JSON.parse(dataLine.slice(6)) as SSEEvent
          } catch {
            continue
          }

          // Fire generic event handler first (for custom use cases)
          callbacks.onEvent?.(event as unknown as Record<string, unknown>)

          switch (event.type) {
            case 'session':
              callbacks.onSession?.(event.session_id)
              break
            case 'chunk':
              callbacks.onChunk?.(event.content)
              break
            case 'tool_call':
              callbacks.onToolCall?.(event.tool_name, event.args)
              break
            case 'tool_result':
              callbacks.onToolResult?.(event.tool_name, event.result)
              break
            case 'done':
              callbacks.onDone?.(event.tokens_used)
              break
            case 'error':
              callbacks.onError?.(event.message)
              break
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return { streamPreview, streamWidget }
}

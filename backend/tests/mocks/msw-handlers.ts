import { http, HttpResponse } from 'msw';

/** Intercepts Groq LLaMA chat completion requests */
const groqChatHandler = http.post('https://api.groq.com/openai/v1/chat/completions', () => {
  return HttpResponse.json({
    id: 'chatcmpl-test-123',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Halo! Ada yang bisa saya bantu?' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  });
});

/** Intercepts Anthropic Claude messages requests */
const claudeChatHandler = http.post('https://api.anthropic.com/v1/messages', () => {
  return HttpResponse.json({
    id: 'msg_test_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Halo! Ada yang bisa saya bantu?' }],
    usage: { input_tokens: 50, output_tokens: 20 },
  });
});

export const handlers = [groqChatHandler, claudeChatHandler];

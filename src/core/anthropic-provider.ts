import type { LLMProvider } from './llm-provider.js';
import type { ChatMessage, LLMResponse, ToolCall } from './types.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
}

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'claude-sonnet-4-20250514';
  }

  async chat(messages: ChatMessage[], _options?: Record<string, unknown>): Promise<LLMResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        system: messages.find(m => m.role === 'system')?.content,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API 错误: ${response.status} ${err}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content.find(c => c.type === 'text')?.text || '';

    return {
      content: textContent,
      toolCalls: [],
      stopReason: data.stop_reason === 'end_turn' ? 'stop' : 'max_tokens',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      },
    };
  }
}
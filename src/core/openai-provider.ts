import type { LLMProvider } from './llm-provider.js';
import type { ChatMessage, LLMResponse, ToolCall } from './types.js';

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'gpt-4o-mini';
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
  }

  async chat(messages: ChatMessage[], options?: Record<string, unknown>): Promise<LLMResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
        })),
        ...options,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API 错误: ${response.status} ${err}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const toolCalls: ToolCall[] = (choice.message.tool_calls || []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));

    return {
      content: choice.message.content || '',
      toolCalls,
      stopReason: choice.finish_reason as LLMResponse['stopReason'],
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}
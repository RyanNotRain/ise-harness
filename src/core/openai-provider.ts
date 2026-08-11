import type { LLMProvider } from './llm-provider.js';
import type { ChatMessage, LLMChatOptions, LLMResponse, ToolCall } from './types.js';

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

  async chat(messages: ChatMessage[], options: LLMChatOptions = {}): Promise<LLMResponse> {
    const apiMessages = messages.map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'tool',
          content: message.content,
          tool_call_id: message.toolCallId,
        };
      }
      return {
        role: message.role,
        content: message.content,
        ...(message.toolCalls
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              })),
            }
          : {}),
      };
    });
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: apiMessages,
        ...(options.tools?.length
          ? {
              tools: options.tools.map((tool) => ({
                type: 'function',
                function: tool,
              })),
            }
          : {}),
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
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
      stopReason: choice.finish_reason === 'tool_calls'
        ? 'tool_calls'
        : choice.finish_reason === 'length'
          ? 'max_tokens'
          : 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}

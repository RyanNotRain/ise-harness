import type { LLMProvider } from './llm-provider.js';
import type { ChatMessage, LLMChatOptions, LLMResponse, ToolCall } from './types.js';

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

  async chat(messages: ChatMessage[], options: LLMChatOptions = {}): Promise<LLMResponse> {
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n') || undefined;
    const apiMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => {
        if (message.role === 'tool') {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content: message.content,
            }],
          };
        }
        if (message.role === 'assistant' && message.toolCalls?.length) {
          return {
            role: 'assistant',
            content: [
              ...(message.content ? [{ type: 'text', text: message.content }] : []),
              ...message.toolCalls.map((call) => ({
                type: 'tool_use',
                id: call.id,
                name: call.name,
                input: call.arguments,
              })),
            ],
          };
        }
        return {
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        };
      });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        messages: apiMessages,
        system,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.tools?.length ? { tools: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })) } : {}),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API 错误: ${response.status} ${err}`);
    }

    const data = await response.json() as {
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n');
    const toolCalls: ToolCall[] = data.content
      .filter((part) => part.type === 'tool_use')
      .map((part) => ({
        id: part.id ?? '',
        name: part.name ?? '',
        arguments: part.input ?? {},
      }));

    return {
      content: textContent,
      toolCalls,
      stopReason: data.stop_reason === 'tool_use'
        ? 'tool_calls'
        : data.stop_reason === 'max_tokens'
          ? 'max_tokens'
          : 'stop',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      },
    };
  }
}

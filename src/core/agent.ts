import type { LLMProvider } from './llm-provider.js';
import type { ChatMessage } from './types.js';
import type { Tool } from '../tools/types.js';

export interface AgentOptions {
  llmProvider: LLMProvider;
  tools?: Tool[];
  systemPrompt?: string;
  maxTurns?: number;
}

export interface AgentRunResult {
  halted: boolean;
  messages: ChatMessage[];
  turnCount: number;
}

export class Agent {
  private llmProvider: LLMProvider;
  private tools: Map<string, Tool>;
  private systemPrompt: string;
  private maxTurns: number;

  constructor(options: AgentOptions) {
    this.llmProvider = options.llmProvider;
    this.tools = new Map((options.tools || []).map(t => [t.name, t]));
    this.systemPrompt = options.systemPrompt || '你是一个编程助手。';
    this.maxTurns = options.maxTurns || 10;
  }

  async run(input: string): Promise<AgentRunResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: input },
    ];

    let turnCount = 0;

    while (turnCount < this.maxTurns) {
      const response = await this.llmProvider.chat(messages);

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
      });

      if (response.stopReason === 'stop' || response.stopReason === 'max_tokens') {
        return { halted: true, messages, turnCount: turnCount + 1 };
      }

      if (response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const tool = this.tools.get(toolCall.name);
          if (!tool) {
            messages.push({
              role: 'tool',
              content: `错误：工具 "${toolCall.name}" 未找到`,
              toolCallId: toolCall.id,
            });
            continue;
          }
          try {
            const result = await tool.execute(toolCall.arguments);
            messages.push({
              role: 'tool',
              content: JSON.stringify(result),
              toolCallId: toolCall.id,
            });
          } catch (err) {
            messages.push({
              role: 'tool',
              content: `错误：${(err as Error).message}`,
              toolCallId: toolCall.id,
            });
          }
        }
        turnCount++;
        continue;
      }

      return { halted: true, messages, turnCount: turnCount + 1 };
    }

    return { halted: true, messages, turnCount };
  }
}
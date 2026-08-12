import type { LLMProvider } from './llm-provider.js';
import type { ChatMessage, LLMChatOptions } from './types.js';
import type { Tool } from '../tools/types.js';
import type { Memory, MemoryEntry } from '../memory/types.js';
import type { ContextWindowMemory } from '../memory/context-window.js';
import type { Guardrail, GuardrailCheck, GuardrailResult } from '../governance/types.js';
import type { HITLHandler } from '../governance/hitl.js';
import type { Feedback, Validator } from '../feedback/types.js';
import type { CodeIndexMemory } from '../memory/code-index.js';

export interface AgentOptions {
  llmProvider: LLMProvider;
  tools?: Tool[];
  systemPrompt?: string;
  maxTurns?: number;
  sessionId?: string;
  memory?: Memory;
  codeIndex?: Pick<CodeIndexMemory, 'query'>;
  contextWindow?: ContextWindowMemory;
  summarizer?: (messages: MemoryEntry[]) => Promise<string>;
  guardrails?: Guardrail[];
  hitl?: Pick<HITLHandler, 'requestConfirmation'>;
  validators?: Validator[];
  maxFeedbackRetries?: number;
  onEvent?: (event: AgentEvent) => void;
  llmOptions?: Pick<LLMChatOptions, 'maxTokens' | 'temperature'>;
}

export interface AgentEvent {
  timestamp: string;
  type: 'memory' | 'llm' | 'tool' | 'guardrail' | 'feedback' | 'context';
  details: Record<string, unknown>;
}

export interface AgentRunResult {
  halted: boolean;
  messages: ChatMessage[];
  turnCount: number;
  haltReason: 'completed' | 'max_turns' | 'max_tokens' | 'feedback_limit';
  feedback: Feedback[];
  events: AgentEvent[];
}

export class Agent {
  private llmProvider: LLMProvider;
  private tools: Map<string, Tool>;
  private systemPrompt: string;
  private maxTurns: number;
  private sessionId: string;
  private memory?: Memory;
  private codeIndex?: Pick<CodeIndexMemory, 'query'>;
  private contextWindow?: ContextWindowMemory;
  private summarizer?: (messages: MemoryEntry[]) => Promise<string>;
  private guardrails: Guardrail[];
  private hitl?: Pick<HITLHandler, 'requestConfirmation'>;
  private validators: Validator[];
  private maxFeedbackRetries: number;
  private onEvent?: (event: AgentEvent) => void;
  private llmOptions: Pick<LLMChatOptions, 'maxTokens' | 'temperature'>;

  constructor(options: AgentOptions) {
    this.llmProvider = options.llmProvider;
    this.tools = new Map((options.tools || []).map(t => [t.name, t]));
    this.systemPrompt = options.systemPrompt || '你是一个编程助手。';
    this.maxTurns = options.maxTurns ?? 10;
    this.sessionId = options.sessionId ?? 'default';
    this.memory = options.memory;
    this.codeIndex = options.codeIndex;
    this.contextWindow = options.contextWindow;
    this.summarizer = options.summarizer;
    this.guardrails = options.guardrails ?? [];
    this.hitl = options.hitl;
    this.validators = options.validators ?? [];
    this.maxFeedbackRetries = options.maxFeedbackRetries ?? 3;
    this.onEvent = options.onEvent;
    this.llmOptions = options.llmOptions ?? {};
  }

  async run(input: string): Promise<AgentRunResult> {
    const remembered = this.memory
      ? (await this.memory.retrieve(this.sessionId, 20)).reverse()
      : [];
    const rememberedMessages = this.restoreRememberedMessages(remembered);
    const relevantCode = this.codeIndex ? await this.codeIndex.query(input, 5) : [];
    const events: AgentEvent[] = [];
    const emit = (type: AgentEvent['type'], details: Record<string, unknown>) => {
      const event = { timestamp: new Date().toISOString(), type, details };
      events.push(event);
      this.onEvent?.(event);
    };
    emit('memory', {
      sessionId: this.sessionId,
      recalledEntries: rememberedMessages.length,
      skippedInvalidEntries: remembered.length - rememberedMessages.length,
      codeResults: relevantCode.length,
    });
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...(relevantCode.length
        ? [{
            role: 'system' as const,
            content: `按需检索到的代码库知识：\n${relevantCode.map((item) => `--- ${item.filePath}\n${item.content}`).join('\n')}`,
          }]
        : []),
      ...rememberedMessages,
      { role: 'user', content: input },
    ];
    await this.memory?.store(this.sessionId, { role: 'user', content: input });

    let turnCount = 0;
    let feedbackFailures = 0;
    const feedback: Feedback[] = [];

    while (turnCount < this.maxTurns) {
      const contextMessages = await this.prepareContext(messages);
      const response = await this.llmProvider.chat(contextMessages, {
        ...this.llmOptions,
        tools: Array.from(this.tools.values()).map(({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        })),
      });
      emit('llm', {
        turn: turnCount + 1,
        promptTokens: response.usage?.promptTokens,
        completionTokens: response.usage?.completionTokens,
        stopReason: response.stopReason,
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
      };
      messages.push(assistantMessage);
      await this.memory?.store(this.sessionId, assistantMessage);

      if (response.stopReason === 'stop' || response.stopReason === 'max_tokens') {
        return {
          halted: true,
          messages,
          turnCount: turnCount + 1,
          haltReason: response.stopReason === 'max_tokens' ? 'max_tokens' : 'completed',
          feedback,
          events,
        };
      }

      if (response.toolCalls.length > 0) {
        const deferredFeedbackMessages: ChatMessage[] = [];
        for (const toolCall of response.toolCalls) {
          const tool = this.tools.get(toolCall.name);
          if (!tool) {
            const missingToolMessage: ChatMessage = {
              role: 'tool',
              content: `错误：工具 "${toolCall.name}" 未找到`,
              toolCallId: toolCall.id,
            };
            messages.push(missingToolMessage);
            await this.memory?.store(this.sessionId, missingToolMessage);
            continue;
          }

          const guardResult = await this.checkGuardrails(toolCall.name, toolCall.arguments);
          if (!guardResult.allowed) {
            emit('guardrail', { tool: toolCall.name, allowed: false, reason: guardResult.reason });
            const approved = this.hitl
              ? (await this.hitl.requestConfirmation({
                  action: `${toolCall.name} ${JSON.stringify(toolCall.arguments)}`,
                  reason: guardResult.reason,
                  severity: guardResult.severity,
                })).approved
              : false;
            if (!approved) {
              const blockedMessage: ChatMessage = {
                role: 'tool',
                content: JSON.stringify({ success: false, data: null, error: `护栏拦截: ${guardResult.reason}` }),
                toolCallId: toolCall.id,
              };
              messages.push(blockedMessage);
              await this.memory?.store(this.sessionId, blockedMessage);
              continue;
            }
          }

          try {
            const result = await tool.execute(toolCall.arguments);
            emit('tool', { tool: toolCall.name, success: result.success });
            const toolMessage: ChatMessage = {
              role: 'tool',
              content: JSON.stringify(result),
              toolCallId: toolCall.id,
            };
            messages.push(toolMessage);
            await this.memory?.store(this.sessionId, toolMessage);

            for (const validator of this.validators) {
              const validationContext = {
                toolName: toolCall.name,
                arguments: toolCall.arguments,
              };
              if (validator.supports && !validator.supports(validationContext)) continue;
              const validation = await validator.validate(result, validationContext);
              feedback.push(validation);
              emit('feedback', { validator: validator.name, passed: validation.passed, summary: validation.summary });
              if (!validation.passed) {
                feedbackFailures++;
                const feedbackMessage: ChatMessage = {
                  role: 'user',
                  content: `[确定性反馈:${validator.name}] ${validation.summary}\n${validation.details}\n建议: ${validation.suggestions.join('；')}`,
                };
                deferredFeedbackMessages.push(feedbackMessage);
              }
            }
          } catch (err) {
            const errorMessage: ChatMessage = {
              role: 'tool',
              content: `错误：${(err as Error).message}`,
              toolCallId: toolCall.id,
            };
            messages.push(errorMessage);
            await this.memory?.store(this.sessionId, errorMessage);
          }
        }
        for (const feedbackMessage of deferredFeedbackMessages) {
          messages.push(feedbackMessage);
          await this.memory?.store(this.sessionId, feedbackMessage);
        }
        if (feedbackFailures > this.maxFeedbackRetries) {
          return { halted: true, messages, turnCount: turnCount + 1, haltReason: 'feedback_limit', feedback, events };
        }
        turnCount++;
        continue;
      }

      return { halted: true, messages, turnCount: turnCount + 1, haltReason: 'completed', feedback, events };
    }

    return { halted: true, messages, turnCount, haltReason: 'max_turns', feedback, events };
  }

  private async prepareContext(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (!this.contextWindow || !this.summarizer) return messages;
    const result = await this.contextWindow.addAndCheck(messages, this.summarizer);
    return result.messages.map((message) => ({
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls,
      toolCallId: message.toolCallId,
    }));
  }

  private restoreRememberedMessages(entries: MemoryEntry[]): ChatMessage[] {
    const restored: ChatMessage[] = [];
    for (let index = 0; index < entries.length;) {
      const entry = entries[index];
      if (entry.role === 'assistant' && entry.toolCalls?.length) {
        const expectedIds = new Set(entry.toolCalls.map((call) => call.id));
        const toolResults: ChatMessage[] = [];
        let cursor = index + 1;
        while (cursor < entries.length && entries[cursor].role === 'tool') {
          const result = entries[cursor];
          if (result.toolCallId && expectedIds.has(result.toolCallId)) {
            expectedIds.delete(result.toolCallId);
            toolResults.push({ role: 'tool', content: result.content, toolCallId: result.toolCallId });
          }
          cursor++;
        }
        if (expectedIds.size === 0) {
          restored.push({ role: 'assistant', content: entry.content, toolCalls: entry.toolCalls });
          restored.push(...toolResults);
        }
        index = cursor;
        continue;
      }
      if (entry.role === 'tool') {
        index++;
        continue;
      }
      restored.push({
        role: entry.role,
        content: entry.content,
        ...(entry.role === 'assistant' && entry.toolCalls ? { toolCalls: entry.toolCalls } : {}),
      });
      index++;
    }
    return restored;
  }

  private async checkGuardrails(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<GuardrailResult> {
    const action: GuardrailCheck = {
      action: `${toolName} ${JSON.stringify(args)}`,
      command: toolName === 'bash' ? String(args.command ?? '') : undefined,
      filePath: typeof args.path === 'string' ? args.path : undefined,
      toolName,
    };
    for (const guardrail of this.guardrails) {
      const result = await guardrail.check(action);
      if (!result.allowed) return result;
    }
    return { allowed: true, reason: '所有护栏均已通过', severity: 'info' };
  }
}

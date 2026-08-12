import { resolve } from 'node:path';
import { Agent } from '../core/agent.js';
import type { LLMProvider } from '../core/llm-provider.js';
import { OpenAIProvider } from '../core/openai-provider.js';
import { AnthropicProvider } from '../core/anthropic-provider.js';
import type { HarnessConfig } from '../config/types.js';
import { SQLiteMemory } from '../memory/sqlite-memory.js';
import { CodeIndexMemory, HashingEmbedder } from '../memory/code-index.js';
import { ContextWindowMemory } from '../memory/context-window.js';
import { ReadFile } from '../tools/read-file.js';
import { WriteFile } from '../tools/write-file.js';
import { Bash } from '../tools/bash.js';
import { Grep } from '../tools/grep.js';
import type { Tool } from '../tools/types.js';
import { DangerousCommandGuard } from '../governance/dangerous-command.js';
import { FileDeletionGuard } from '../governance/file-deletion.js';
import { HITLHandler } from '../governance/hitl.js';
import type { Guardrail } from '../governance/types.js';
import { TestResultValidator } from '../feedback/test-validator.js';
import { UserFeedbackValidator } from '../feedback/user-feedback.js';
import type { Validator } from '../feedback/types.js';

export interface HarnessRuntime {
  agent: Agent;
  memory: SQLiteMemory;
  codeIndex?: CodeIndexMemory;
  close(): Promise<void>;
}

export interface RuntimeOptions {
  apiKey: string;
  sessionId?: string;
  interactive?: boolean;
}

export async function createRuntime(
  config: HarnessConfig,
  options: RuntimeOptions
): Promise<HarnessRuntime> {
  const workspaceRoot = resolve(config.workspaceRoot);
  const provider = createProvider(config, options.apiKey);
  const memoryPath = resolve(workspaceRoot, config.memory.path);
  const memory = new SQLiteMemory(memoryPath);
  const codeIndex = config.memory.codeIndex.enabled
    ? new CodeIndexMemory(`${memoryPath}.code-index`, { embedder: new HashingEmbedder() })
    : undefined;
  const contextWindow = new ContextWindowMemory(config.memory.contextWindow);
  const tools = createTools(config.tools, workspaceRoot);
  const guardrails = createGuardrails(config);
  const validators = createValidators(config, options.interactive ?? false);
  const hitl = options.interactive
    ? new HITLHandler({ timeout: config.guardrails.hitlTimeout, defaultDeny: true })
    : undefined;

  const agent = new Agent({
    llmProvider: provider,
    tools,
    memory,
    codeIndex,
    contextWindow,
    summarizer: async (entries) => {
      const response = await provider.chat([
        { role: 'system', content: '请把以下历史压缩为保留约定、决策、错误和待办事项的简洁摘要。' },
        { role: 'user', content: entries.map((entry) => `${entry.role}: ${entry.content}`).join('\n') },
      ]);
      return response.content;
    },
    guardrails,
    hitl,
    validators,
    maxFeedbackRetries: config.feedback.maxRetries,
    sessionId: options.sessionId,
    llmOptions: {
      maxTokens: config.model.maxTokens,
      temperature: config.model.temperature,
    },
    onEvent: process.env.LOG_LEVEL === 'debug'
      ? (event) => console.error(JSON.stringify(event))
      : undefined,
  });

  return {
    agent,
    memory,
    codeIndex,
    async close() {
      await codeIndex?.close();
      await memory.close();
    },
  };
}

function createProvider(config: HarnessConfig, apiKey: string): LLMProvider {
  if (config.model.provider === 'openai') {
    return new OpenAIProvider({
      apiKey,
      model: config.model.model,
      baseURL: config.model.baseURL,
    });
  }
  if (config.model.provider === 'anthropic') {
    return new AnthropicProvider({ apiKey, model: config.model.model });
  }
  throw new Error('mock provider 仅用于测试，请直接注入 MockLLMProvider');
}

function createTools(names: string[], workspaceRoot: string): Tool[] {
  const factories: Record<string, () => Tool> = {
    read_file: () => new ReadFile(workspaceRoot),
    write_file: () => new WriteFile(workspaceRoot),
    bash: () => new Bash(30_000, workspaceRoot),
    grep: () => new Grep(workspaceRoot),
  };
  return names.map((name) => {
    const factory = factories[name];
    if (!factory) throw new Error(`未知工具配置: ${name}`);
    return factory();
  });
}

function createGuardrails(config: HarnessConfig): Guardrail[] {
  const guards: Guardrail[] = [];
  if (config.guardrails.dangerousCommands) guards.push(new DangerousCommandGuard());
  if (config.guardrails.fileDeletion) guards.push(new FileDeletionGuard());
  return guards;
}

function createValidators(config: HarnessConfig, interactive: boolean): Validator[] {
  return config.feedback.validators.map((name) => {
    if (name === 'test_result') return new TestResultValidator();
    if (name === 'user' && interactive) return new UserFeedbackValidator();
    if (name === 'user') throw new Error('非交互模式不能启用 user 校验器');
    throw new Error(`未知校验器配置: ${name}`);
  });
}

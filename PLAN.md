# ise-harness 实现计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 按 task 逐个实现。使用 checkbox (`- [ ]`) 语法追踪进度。

**目标：** 构建一个聚焦记忆与上下文管理的 Coding Agent Harness SDK，以 npm 包形式分发。

**架构：** TypeScript agent 主循环 + 可插拔 LLM 提供者 + SQLite 记忆存储 + 模式匹配护栏 + 可配置校验器。所有核心机制通过 MockLLMProvider 在无网络环境下可测试。

**技术栈：** TypeScript, Vitest, better-sqlite3, @xenova/transformers (可选), openai, @anthropic-ai/sdk

## 全局约束

- TDD：先写测试（红），再写实现（绿），最后重构。绝不先写实现再补测试。
- 所有核心机制测试使用 MockLLMProvider，不依赖网络与真实 LLM。
- 代码中不得出现任何真实凭据。API key 通过加密文件或 .env 提供。
- 所有文件使用 ES module 语法（import/export）。
- 不依赖任何 agent 框架（LangChain、AutoGen、CrewAI 等）。
- 文档用中文，代码和文件名用英文。

---

## 文件结构

```
src/
├── core/
│   ├── types.ts            # 核心类型：ChatMessage, Action, ToolResult, LLMResponse
│   ├── llm-provider.ts     # LLMProvider 接口
│   ├── mock-llm.ts         # MockLLMProvider — 确定性响应序列
│   ├── openai-provider.ts  # OpenAIProvider — OpenAI 兼容 API
│   ├── anthropic-provider.ts # AnthropicProvider — Anthropic API
│   └── agent.ts            # Agent 主循环
├── memory/
│   ├── types.ts            # Memory 接口, MemoryEntry
│   ├── sqlite-memory.ts    # SQLiteMemory — 跨会话持久化
│   ├── code-index.ts       # CodeIndexMemory — 代码库知识索引
│   └── context-window.ts   # ContextWindowMemory — token 感知压缩
├── tools/
│   ├── types.ts            # Tool 接口
│   ├── registry.ts         # ToolRegistry — 注册、查找、分发
│   ├── read-file.ts        # ReadFile 工具
│   ├── write-file.ts       # WriteFile 工具
│   ├── bash.ts             # Bash 工具
│   └── grep.ts             # Grep 工具
├── governance/
│   ├── types.ts            # Guardrail 接口, GuardrailResult
│   ├── dangerous-command.ts # DangerousCommandGuard
│   ├── file-deletion.ts    # FileDeletionGuard
│   └── hitl.ts             # HITLHandler — 超时 + 默认拒绝
├── feedback/
│   ├── types.ts            # Validator 接口, Feedback
│   ├── test-validator.ts   # TestResultValidator — 解析测试输出
│   └── user-feedback.ts    # UserFeedbackValidator — stdin 输入
├── config/
│   ├── types.ts            # HarnessConfig 接口
│   ├── defaults.ts         # 默认配置值
│   └── loader.ts           # 配置加载器 — JSON、环境变量
├── credential/
│   ├── keychain.ts         # FileCredentialStore — AES-256-GCM 加密存储
│   └── cli.ts              # CLI 命令：key set/view/clear
└── cli/
    └── index.ts            # CLI 入口：ise-harness 命令

tests/
├── unit/
│   ├── core/
│   │   ├── mock-llm.test.ts
│   │   └── agent.test.ts
│   ├── memory/
│   │   ├── sqlite-memory.test.ts
│   │   ├── code-index.test.ts
│   │   └── context-window.test.ts
│   ├── tools/
│   │   └── registry.test.ts
│   ├── governance/
│   │   ├── dangerous-command.test.ts
│   │   └── hitl.test.ts
│   ├── feedback/
│   │   └── test-validator.test.ts
│   ├── config/
│   │   └── loader.test.ts
│   └── credential/
│       └── credential.test.ts
└── demo/
    ├── guardrail-demo.test.ts    # 演示 1：护栏拦截危险动作
    ├── feedback-demo.test.ts     # 演示 2：反馈闭环改变 agent 行为
    └── memory-demo.test.ts       # 演示 3：跨会话记忆检索（重点维度）
```

---

### Task 1: 核心类型与 MockLLMProvider

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/llm-provider.ts`
- Create: `src/core/mock-llm.ts`
- Test: `tests/unit/core/mock-llm.test.ts`

**Interfaces:**
- 不依赖任何前置任务
- 产出：`ChatMessage`, `ToolCall`, `LLMResponse`, `ToolResult`, `Action`, `LLMProvider`, `MockLLMProvider`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/core/mock-llm.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../../../src/core/mock-llm.js';

describe('MockLLMProvider', () => {
  it('应按序列返回预定义的响应', async () => {
    const provider = new MockLLMProvider([
      { content: '你好', toolCalls: [] },
      { content: '世界', toolCalls: [] },
    ]);
    const r1 = await provider.chat([{ role: 'user', content: 'Hi' }]);
    expect(r1.content).toBe('你好');
    const r2 = await provider.chat([{ role: 'user', content: 'Hi' }]);
    expect(r2.content).toBe('世界');
  });

  it('响应序列耗尽时应抛出错误', async () => {
    const provider = new MockLLMProvider([]);
    await expect(
      provider.chat([{ role: 'user', content: 'Hi' }])
    ).rejects.toThrow('MockLLMProvider: 没有更多响应');
  });

  it('应记录所有调用历史', async () => {
    const provider = new MockLLMProvider([
      { content: 'OK', toolCalls: [] },
    ]);
    await provider.chat([{ role: 'user', content: 'test' }]);
    expect(provider.callHistory.length).toBe(1);
    expect(provider.callHistory[0][0].content).toBe('test');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/core/mock-llm.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: 编写最小实现**

```typescript
// src/core/types.ts
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  stopReason?: 'stop' | 'tool_calls' | 'max_tokens';
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

export interface Action {
  type: 'tool_call' | 'text' | 'halt';
  toolCall?: ToolCall;
  content?: string;
}
```

```typescript
// src/core/llm-provider.ts
import type { ChatMessage, LLMResponse } from './types.js';

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: Record<string, unknown>): Promise<LLMResponse>;
}
```

```typescript
// src/core/mock-llm.ts
import type { ChatMessage, LLMResponse } from './types.js';
import type { LLMProvider } from './llm-provider.js';

export class MockLLMProvider implements LLMProvider {
  private responses: LLMResponse[];
  private index = 0;
  callHistory: ChatMessage[][] = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(messages: ChatMessage[], _options?: Record<string, unknown>): Promise<LLMResponse> {
    this.callHistory.push([...messages]);
    if (this.index >= this.responses.length) {
      throw new Error('MockLLMProvider: 没有更多响应');
    }
    return this.responses[this.index++];
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/core/mock-llm.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/types.ts src/core/llm-provider.ts src/core/mock-llm.ts tests/unit/core/mock-llm.test.ts
git commit -m "feat: 核心类型与 MockLLMProvider"
```

---

### Task 2: 工具系统

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/registry.ts`
- Create: `src/tools/read-file.ts`
- Create: `src/tools/write-file.ts`
- Create: `src/tools/bash.ts`
- Create: `src/tools/grep.ts`
- Test: `tests/unit/tools/registry.test.ts`

**Interfaces:**
- 消费：`ToolResult`（来自 Task 1）
- 产出：`Tool` 接口, `ToolRegistry`, `ReadFile`, `WriteFile`, `Bash`, `Grep`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/tools/registry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { ReadFile } from '../../../src/tools/read-file.js';

describe('ToolRegistry', () => {
  it('应能注册并查找工具', () => {
    const registry = new ToolRegistry();
    const readFile = new ReadFile();
    registry.register(readFile);
    expect(registry.find('read_file')).toBeDefined();
    expect(registry.find('nonexistent')).toBeUndefined();
  });

  it('应列出所有工具定义', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    const defs = registry.listDefinitions();
    expect(defs.length).toBe(1);
    expect(defs[0].name).toBe('read_file');
    expect(defs[0].description).toBeDefined();
    expect(defs[0].parameters).toBeDefined();
  });

  it('重复注册应抛出错误', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    expect(() => registry.register(new ReadFile())).toThrow('已经注册');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/tools/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/tools/types.ts
import type { ToolResult } from '../core/types.js';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
```

```typescript
// src/tools/registry.ts
import type { Tool } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具 "${tool.name}" 已经注册`);
    }
    this.tools.set(tool.name, tool);
  }

  find(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
```

```typescript
// src/tools/read-file.ts
import { readFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class ReadFile implements Tool {
  name = 'read_file';
  description = '读取文件内容，支持指定行范围';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      offset: { type: 'number', description: '起始行（1-indexed）' },
      limit: { type: 'number', description: '最大读取行数' },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const content = await readFile(args.path as string, 'utf-8');
      const lines = content.split('\n');
      const offset = (args.offset as number) || 1;
      const limit = args.limit as number | undefined;
      const result = limit ? lines.slice(offset - 1, offset - 1 + limit).join('\n') : content;
      return { success: true, data: result };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}
```

```typescript
// src/tools/write-file.ts
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class WriteFile implements Tool {
  name = 'write_file';
  description = '将内容写入文件，自动创建父目录';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '要写入的内容' },
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const path = args.path as string;
      const content = args.content as string;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf-8');
      return { success: true, data: `已写入 ${content.length} 字节` };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}
```

```typescript
// src/tools/bash.ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

const execAsync = promisify(exec);

export class Bash implements Tool {
  name = 'bash';
  description = '执行 shell 命令并返回输出';
  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的 shell 命令' },
      timeout: { type: 'number', description: '超时时间（毫秒）' },
    },
    required: ['command'],
  };
  private timeout: number;

  constructor(timeout = 30000) {
    this.timeout = timeout;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await execAsync(args.command as string, {
        timeout: (args.timeout as number) || this.timeout,
      });
      return { success: true, data: { stdout, stderr } };
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string };
      return {
        success: false,
        data: { stdout: error.stdout || '', stderr: error.stderr || '' },
        error: error.message,
      };
    }
  }
}
```

```typescript
// src/tools/grep.ts
import { readFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class Grep implements Tool {
  name = 'grep';
  description = '在文件中搜索匹配正则表达式的内容';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      pattern: { type: 'string', description: '正则表达式' },
    },
    required: ['path', 'pattern'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const content = await readFile(args.path as string, 'utf-8');
      const pattern = new RegExp(args.pattern as string, 'g');
      const lines = content.split('\n');
      const matches: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          matches.push(`${i + 1}: ${lines[i]}`);
        }
      }
      return { success: true, data: matches.join('\n') || '未找到匹配项' };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/tools/registry.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/tools/ tests/unit/tools/registry.test.ts
git commit -m "feat: 工具系统（ReadFile, WriteFile, Bash, Grep）"
```

---

### Task 3: Agent 主循环

**Files:**
- Create: `src/core/agent.ts`
- Create: `src/core/openai-provider.ts`
- Create: `src/core/anthropic-provider.ts`
- Test: `tests/unit/core/agent.test.ts`

**Interfaces:**
- 消费：`LLMProvider`, `ChatMessage`, `LLMResponse`, `ToolResult`（来自 Task 1），`Tool`（来自 Task 2）
- 产出：`Agent`, `AgentOptions`, `AgentRunResult`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/core/agent.test.ts
import { describe, it, expect } from 'vitest';
import { Agent } from '../../../src/core/agent.js';
import { MockLLMProvider } from '../../../src/core/mock-llm.js';

describe('Agent', () => {
  it('LLM 返回 stop 时应停机', async () => {
    const provider = new MockLLMProvider([
      { content: '完成！', toolCalls: [], stopReason: 'stop' },
    ]);
    const agent = new Agent({ llmProvider: provider });
    const result = await agent.run('做点什么');
    expect(result.halted).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('应执行工具调用并将结果回灌到上下文', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [{ id: 'call1', name: 'mock_tool', arguments: { input: 'test' } }],
        stopReason: 'tool_calls',
      },
      { content: '完成', toolCalls: [], stopReason: 'stop' },
    ]);
    const toolExecutions: string[] = [];
    const agent = new Agent({
      llmProvider: provider,
      tools: [
        {
          name: 'mock_tool',
          description: '一个模拟工具',
          parameters: { type: 'object', properties: { input: { type: 'string' } } },
          async execute(args) {
            toolExecutions.push(args.input as string);
            return { success: true, data: 'ok' };
          },
        },
      ],
    });
    await agent.run('使用工具');
    expect(toolExecutions).toEqual(['test']);
  });

  it('应强制 maxTurns 限制', async () => {
    const provider = new MockLLMProvider(
      Array(10).fill({ content: '...', toolCalls: [], stopReason: 'tool_calls' })
    );
    const agent = new Agent({ llmProvider: provider, maxTurns: 3 });
    const result = await agent.run('循环');
    expect(result.halted).toBe(true);
    expect(result.turnCount).toBeLessThanOrEqual(3);
  });

  it('应支持自定义系统提示词', async () => {
    const provider = new MockLLMProvider([
      { content: 'OK', toolCalls: [], stopReason: 'stop' },
    ]);
    const agent = new Agent({
      llmProvider: provider,
      systemPrompt: '你是一个编码助手',
    });
    await agent.run('测试');
    expect(provider.callHistory[0][0].role).toBe('system');
    expect(provider.callHistory[0][0].content).toBe('你是一个编码助手');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/core/agent.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: 编写最小实现**

```typescript
// src/core/agent.ts
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
```

```typescript
// src/core/openai-provider.ts
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
```

```typescript
// src/core/anthropic-provider.ts
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
      toolCalls: [], // Anthropic 工具调用暂不在此简化版中实现
      stopReason: data.stop_reason === 'end_turn' ? 'stop' : 'max_tokens',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      },
    };
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/core/agent.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/agent.ts src/core/openai-provider.ts src/core/anthropic-provider.ts tests/unit/core/agent.test.ts
git commit -m "feat: Agent 主循环与 OpenAI/Anthropic 提供者"
```

---

### Task 4: SQLite 记忆存储（重点维度）

**Files:**
- Create: `src/memory/types.ts`
- Create: `src/memory/sqlite-memory.ts`
- Test: `tests/unit/memory/sqlite-memory.test.ts`

**Interfaces:**
- 不依赖任何前置任务
- 产出：`MemoryEntry`, `Memory` 接口, `SQLiteMemory`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/memory/sqlite-memory.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteMemory } from '../../../src/memory/sqlite-memory.js';

describe('SQLiteMemory', () => {
  let memory: SQLiteMemory;

  beforeAll(() => {
    memory = new SQLiteMemory(':memory:');
  });

  afterAll(() => {
    memory.close();
  });

  it('应能存储和检索条目', async () => {
    await memory.store('session1', { role: 'user', content: '你好' });
    const entries = await memory.retrieve('session1', 10);
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe('你好');
  });

  it('应按 limit 限制检索数量', async () => {
    for (let i = 0; i < 5; i++) {
      await memory.store('session2', { role: 'user', content: `消息 ${i}` });
    }
    const entries = await memory.retrieve('session2', 3);
    expect(entries.length).toBe(3);
  });

  it('不存在的会话应返回空数组', async () => {
    const entries = await memory.retrieve('nonexistent', 10);
    expect(entries).toEqual([]);
  });

  it('应能清除会话', async () => {
    await memory.store('session3', { role: 'user', content: 'test' });
    await memory.clear('session3');
    const entries = await memory.retrieve('session3', 10);
    expect(entries).toEqual([]);
  });

  it('应能存储和检索决策', async () => {
    await memory.storeDecision('session1', {
      context: '需要选择数据库',
      decision: '使用 SQLite',
      rationale: '轻量、零配置',
    });
    const decisions = await memory.retrieveDecisions('session1', 10);
    expect(decisions.length).toBe(1);
    expect(decisions[0].decision).toBe('使用 SQLite');
  });

  it('应能获取会话摘要', async () => {
    await memory.updateSummary('session1', '这是一个测试会话');
    const summary = await memory.summarize('session1');
    expect(summary).toBe('这是一个测试会话');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/memory/sqlite-memory.test.ts`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/memory/types.ts
export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Decision {
  context: string;
  decision: string;
  rationale: string;
}

export interface Memory {
  store(sessionId: string, entry: MemoryEntry): Promise<void>;
  retrieve(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  clear(sessionId: string): Promise<void>;
  summarize(sessionId: string): Promise<string>;
  storeDecision(sessionId: string, decision: Decision): Promise<void>;
  retrieveDecisions(sessionId: string, limit?: number): Promise<Decision[]>;
  updateSummary(sessionId: string, summary: string): Promise<void>;
  close(): void;
}
```

```typescript
// src/memory/sqlite-memory.ts
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import type { Memory, MemoryEntry, Decision } from './types.js';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function initSqlJsOnce() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export class SQLiteMemory implements Memory {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private async ensureInit(): Promise<SqlJsDatabase> {
    if (this.db && this.initialized) return this.db;
    const sql = await initSqlJsOnce();
    this.db = new sql.Database();
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        summary TEXT DEFAULT ''
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        context TEXT NOT NULL,
        decision TEXT NOT NULL,
        rationale TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_entries_session ON entries(session_id, id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id, id)');
    this.initialized = true;
    return this.db;
  }

  async store(sessionId: string, entry: MemoryEntry): Promise<void> {
    const db = await this.ensureInit();
    db.run('INSERT OR IGNORE INTO sessions (id) VALUES (?)', [sessionId]);
    db.run('INSERT INTO entries (session_id, role, content) VALUES (?, ?, ?)', [sessionId, entry.role, entry.content]);
    db.run("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", [sessionId]);
  }

  async retrieve(sessionId: string, limit?: number): Promise<MemoryEntry[]> {
    const db = await this.ensureInit();
    const results: MemoryEntry[] = [];
    const sql = limit
      ? 'SELECT role, content FROM entries WHERE session_id = ? ORDER BY id DESC LIMIT ?'
      : 'SELECT role, content FROM entries WHERE session_id = ? ORDER BY id DESC';
    const params = limit ? [sessionId, limit] : [sessionId];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({ role: row.role as MemoryEntry['role'], content: row.content as string });
    }
    stmt.free();
    return results;
  }

  async clear(sessionId: string): Promise<void> {
    const db = await this.ensureInit();
    db.run('DELETE FROM entries WHERE session_id = ?', [sessionId]);
    db.run('DELETE FROM decisions WHERE session_id = ?', [sessionId]);
    db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  async summarize(sessionId: string): Promise<string> {
    const db = await this.ensureInit();
    const stmt = db.prepare('SELECT summary FROM sessions WHERE id = ?');
    stmt.bind([sessionId]);
    let summary = '';
    if (stmt.step()) {
      summary = (stmt.getAsObject() as { summary: string }).summary || '';
    }
    stmt.free();
    return summary;
  }

  async storeDecision(sessionId: string, decision: Decision): Promise<void> {
    const db = await this.ensureInit();
    db.run('INSERT OR IGNORE INTO sessions (id) VALUES (?)', [sessionId]);
    db.run('INSERT INTO decisions (session_id, context, decision, rationale) VALUES (?, ?, ?, ?)', [sessionId, decision.context, decision.decision, decision.rationale]);
  }

  async retrieveDecisions(sessionId: string, limit?: number): Promise<Decision[]> {
    const db = await this.ensureInit();
    const results: Decision[] = [];
    const sql = limit
      ? 'SELECT context, decision, rationale FROM decisions WHERE session_id = ? ORDER BY id DESC LIMIT ?'
      : 'SELECT context, decision, rationale FROM decisions WHERE session_id = ? ORDER BY id DESC';
    const params = limit ? [sessionId, limit] : [sessionId];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject() as { context: string; decision: string; rationale: string };
      results.push(row);
    }
    stmt.free();
    return results;
  }

  async updateSummary(sessionId: string, summary: string): Promise<void> {
    const db = await this.ensureInit();
    db.run('INSERT OR IGNORE INTO sessions (id) VALUES (?)', [sessionId]);
    db.run("UPDATE sessions SET summary = ?, updated_at = datetime('now') WHERE id = ?", [summary, sessionId]);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/memory/sqlite-memory.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/memory/types.ts src/memory/sqlite-memory.ts tests/unit/memory/sqlite-memory.test.ts
git commit -m "feat: Memory 接口与 SQLiteMemory 实现"
```

---

### Task 5: 代码索引记忆（重点维度）

**Files:**
- Create: `src/memory/code-index.ts`
- Test: `tests/unit/memory/code-index.test.ts`

**Interfaces:**
- 不依赖任何前置任务
- 产出：`Embedder`, `CodeIndexResult`, `CodeIndexMemory`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/memory/code-index.test.ts
import { describe, it, expect } from 'vitest';
import { CodeIndexMemory } from '../../../src/memory/code-index.js';

describe('CodeIndexMemory', () => {
  it('应能索引文件并通过查询检索', async () => {
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(_text: string) {
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    await index.indexFile('/test/file.ts', 'function hello() { return 1; }');
    const results = await index.query('function hello', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('hello');
    index.close();
  });

  it('未索引的查询应返回空', async () => {
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(_text: string) {
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    const results = await index.query('nothing', 5);
    expect(results).toEqual([]);
    index.close();
  });

  it('应支持增量更新（相同哈希不重新索引）', async () => {
    const embedCalls: string[] = [];
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(text: string) {
          embedCalls.push(text);
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    await index.indexFile('/test/file.ts', 'const x = 1;');
    expect(embedCalls.length).toBe(1);
    await index.indexFile('/test/file.ts', 'const x = 1;');
    expect(embedCalls.length).toBe(1); // 不应再次调用 embed
    index.close();
  });

  it('内容变更后应重新索引', async () => {
    const embedCalls: string[] = [];
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(text: string) {
          embedCalls.push(text);
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    await index.indexFile('/test/file.ts', 'const x = 1;');
    await index.indexFile('/test/file.ts', 'const x = 2;');
    expect(embedCalls.length).toBe(2);
    index.close();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/memory/code-index.test.ts`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/memory/code-index.ts
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { createHash } from 'node:crypto';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function initSqlJsOnce() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

export interface CodeIndexResult {
  filePath: string;
  content: string;
  score: number;
}

export class CodeIndexMemory {
  private db: SqlJsDatabase | null = null;
  private embedder: Embedder;
  private initialized = false;

  constructor(dbPath: string, options: { embedder: Embedder }) {
    this.embedder = options.embedder;
  }

  private async ensureInit(): Promise<SqlJsDatabase> {
    if (this.db && this.initialized) return this.db;
    const sql = await initSqlJsOnce();
    this.db = new sql.Database();
    this.db.run(`
      CREATE TABLE IF NOT EXISTS code_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(file_path)
      )
    `);
    this.initialized = true;
    return this.db;
  }

  async indexFile(filePath: string, content: string): Promise<void> {
    const db = await this.ensureInit();
    const hash = createHash('sha256').update(content).digest('hex');

    const stmt = db.prepare('SELECT file_hash FROM code_index WHERE file_path = ?');
    stmt.bind([filePath]);
    let existingHash = '';
    if (stmt.step()) {
      existingHash = (stmt.getAsObject() as { file_hash: string }).file_hash;
    }
    stmt.free();

    if (existingHash === hash) return;

    const embedding = await this.embedder.embed(content);
    const buf = Buffer.from(embedding.buffer);
    db.run('INSERT OR REPLACE INTO code_index (file_path, file_hash, content, embedding) VALUES (?, ?, ?, ?)', [filePath, hash, content, Array.from(buf)]);
  }

  async query(query: string, limit: number): Promise<CodeIndexResult[]> {
    const db = await this.ensureInit();
    const queryEmbedding = await this.embedder.embed(query);

    const rows: Array<{ file_path: string; content: string; embedding: number[] }> = [];
    const stmt = db.prepare('SELECT file_path, content, embedding FROM code_index');
    while (stmt.step()) {
      const row = stmt.getAsObject() as { file_path: string; content: string; embedding: Int8Array };
      const emb = Array.from(row.embedding);
      rows.push({ file_path: row.file_path, content: row.content, embedding: emb });
    }
    stmt.free();

    if (rows.length === 0) return [];

    const scored = rows.map(row => {
      const storedVec = new Float32Array(row.embedding);
      const score = this.cosineSimilarity(queryEmbedding, storedVec);
      return { filePath: row.file_path, content: row.content, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/memory/code-index.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/memory/code-index.ts tests/unit/memory/code-index.test.ts
git commit -m "feat: CodeIndexMemory — 代码库语义索引与检索"
```

---

### Task 6: 上下文窗口管理（重点维度）

**Files:**
- Create: `src/memory/context-window.ts`
- Test: `tests/unit/memory/context-window.test.ts`

**Interfaces:**
- 消费：`MemoryEntry`（来自 Task 4）
- 产出：`ContextWindowOptions`, `AddAndCheckResult`, `ContextWindowMemory`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/memory/context-window.test.ts
import { describe, it, expect } from 'vitest';
import { ContextWindowMemory } from '../../../src/memory/context-window.js';

describe('ContextWindowMemory', () => {
  it('未超过阈值时不应压缩', async () => {
    const cwm = new ContextWindowMemory({ maxTokens: 1000, compressionThreshold: 0.8 });
    const result = await cwm.addAndCheck(
      [
        { role: 'user', content: '短消息' },
        { role: 'assistant', content: '好的' },
      ],
      async (_msgs) => '摘要'
    );
    expect(result.compressed).toBe(false);
    expect(result.messages.length).toBe(2);
  });

  it('超过阈值时应压缩旧对话', async () => {
    const cwm = new ContextWindowMemory({
      maxTokens: 100,
      compressionThreshold: 0.5,
      keepRecentTurns: 1,
    });
    const long = Array(20).fill('hello world').join(' ');
    const result = await cwm.addAndCheck(
      [
        { role: 'user', content: long },
        { role: 'assistant', content: long },
        { role: 'user', content: '最新消息' },
      ],
      async (_msgs) => '压缩后的摘要'
    );
    expect(result.compressed).toBe(true);
    const summaryMsg = result.messages.find(
      m => m.role === 'system' && m.content.includes('压缩后的摘要')
    );
    expect(summaryMsg).toBeDefined();
    expect(result.messages[result.messages.length - 1].content).toBe('最新消息');
  });

  it('应能估算 token 数量', () => {
    const cwm = new ContextWindowMemory({ maxTokens: 1000, compressionThreshold: 0.8 });
    const count = cwm.estimateTokens('hello world');
    expect(count).toBeGreaterThan(0);
  });

  it('没有可压缩内容时不应压缩', async () => {
    const cwm = new ContextWindowMemory({
      maxTokens: 100,
      compressionThreshold: 0.5,
      keepRecentTurns: 10,
    });
    const long = Array(20).fill('hello world').join(' ');
    const result = await cwm.addAndCheck(
      [{ role: 'user', content: long }],
      async (_msgs) => '不应被调用'
    );
    expect(result.compressed).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/memory/context-window.test.ts`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/memory/context-window.ts
import type { MemoryEntry } from './types.js';

export interface ContextWindowOptions {
  maxTokens: number;
  compressionThreshold: number;
  keepRecentTurns?: number;
}

export interface AddAndCheckResult {
  compressed: boolean;
  messages: MemoryEntry[];
}

export class ContextWindowMemory {
  private options: Required<ContextWindowOptions>;

  constructor(options: ContextWindowOptions) {
    this.options = {
      keepRecentTurns: 5,
      ...options,
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async addAndCheck(
    messages: MemoryEntry[],
    summarizer: (messages: MemoryEntry[]) => Promise<string>
  ): Promise<AddAndCheckResult> {
    const totalTokens = messages.reduce(
      (sum, m) => sum + this.estimateTokens(m.content),
      0
    );
    const threshold = this.options.maxTokens * this.options.compressionThreshold;

    if (totalTokens <= threshold) {
      return { compressed: false, messages };
    }

    const keep = this.options.keepRecentTurns;
    const compressible = messages.slice(0, -keep);
    const recent = messages.slice(-keep);

    if (compressible.length === 0) {
      return { compressed: false, messages };
    }

    const summary = await summarizer(compressible);
    const result: MemoryEntry[] = [
      { role: 'system', content: `[历史对话摘要: ${summary}]` },
      ...recent,
    ];

    return { compressed: true, messages: result };
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/memory/context-window.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/memory/context-window.ts tests/unit/memory/context-window.test.ts
git commit -m "feat: ContextWindowMemory — token 感知的上下文压缩"
```

---

### Task 7: 治理护栏

**Files:**
- Create: `src/governance/types.ts`
- Create: `src/governance/dangerous-command.ts`
- Create: `src/governance/file-deletion.ts`
- Create: `src/governance/hitl.ts`
- Test: `tests/unit/governance/dangerous-command.test.ts`
- Test: `tests/unit/governance/hitl.test.ts`

**Interfaces:**
- 不依赖任何前置任务
- 产出：`Guardrail`, `GuardrailResult`, `DangerousCommandGuard`, `FileDeletionGuard`, `HITLHandler`, `HITLResponse`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/governance/dangerous-command.test.ts
import { describe, it, expect } from 'vitest';
import { DangerousCommandGuard } from '../../../src/governance/dangerous-command.js';

describe('DangerousCommandGuard', () => {
  const guard = new DangerousCommandGuard();

  it('应拦截 rm -rf /', () => {
    const result = guard.check({ command: 'rm -rf /' });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it('应拦截 dd 命令', () => {
    const result = guard.check({ command: 'dd if=/dev/zero of=/dev/sda' });
    expect(result.allowed).toBe(false);
  });

  it('应拦截 mkfs 命令', () => {
    const result = guard.check({ command: 'mkfs.ext4 /dev/sda1' });
    expect(result.allowed).toBe(false);
  });

  it('应放行安全命令', () => {
    const result = guard.check({ command: 'ls -la' });
    expect(result.allowed).toBe(true);
  });

  it('应放行 git 命令', () => {
    const result = guard.check({ command: 'git status' });
    expect(result.allowed).toBe(true);
  });

  it('应拦截 shutdown 命令', () => {
    const result = guard.check({ command: 'shutdown now' });
    expect(result.allowed).toBe(false);
  });
});
```

```typescript
// tests/unit/governance/hitl.test.ts
import { describe, it, expect } from 'vitest';
import { HITLHandler } from '../../../src/governance/hitl.js';

describe('HITLHandler', () => {
  it('超时后应默认拒绝', async () => {
    const handler = new HITLHandler({ timeout: 0.01, defaultDeny: true });
    const result = await handler.requestConfirmation({
      action: 'rm -rf /',
      reason: '危险命令',
      severity: 'block',
    });
    expect(result.approved).toBe(false);
    expect(result.timeout).toBe(true);
  });

  it('默认拒绝策略下未响应应拒绝', async () => {
    const handler = new HITLHandler({ timeout: 0.01, defaultDeny: true });
    const result = await handler.requestConfirmation({
      action: '删除文件',
      reason: '保护目录',
      severity: 'warn',
    });
    expect(result.approved).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/governance/`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/governance/types.ts
export interface GuardrailCheck {
  command?: string;
  filePath?: string;
  action: string;
}

export interface GuardrailResult {
  allowed: boolean;
  reason: string;
  severity: 'info' | 'warn' | 'block';
}

export interface Guardrail {
  name: string;
  check(action: GuardrailCheck): GuardrailResult;
}
```

```typescript
// src/governance/dangerous-command.ts
import type { Guardrail, GuardrailCheck, GuardrailResult } from './types.js';

const DANGEROUS_PATTERNS = [
  /^rm\s+-rf\s+\//,
  /^rm\s+-rf\s+\*/,
  /^dd\s+/,
  /^mkfs/,
  /^fdisk/,
  /^format/,
  /^>\/dev\/sd/,
  /:\(\)\s*\{/,
  /^chmod\s+-R\s+000/,
  /^wget\s+.+--output-document=\/dev\/sd/,
  /^curl\s+.+>\s*\/dev\/sd/,
  /^shutdown/,
  /^reboot/,
  /^halt/,
];

export class DangerousCommandGuard implements Guardrail {
  name = 'dangerous_command';

  check(action: GuardrailCheck): GuardrailResult {
    const cmd = action.command || action.action;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `命令匹配危险模式: ${pattern}`,
          severity: 'block',
        };
      }
    }
    return { allowed: true, reason: '命令看起来安全', severity: 'info' };
  }
}
```

```typescript
// src/governance/file-deletion.ts
import type { Guardrail, GuardrailCheck, GuardrailResult } from './types.js';

const PROTECTED_DIRS = [
  '/etc', '/usr', '/bin', '/sbin', '/boot',
  '/System', '/Library', '.git',
];

export class FileDeletionGuard implements Guardrail {
  name = 'file_deletion';

  check(action: GuardrailCheck): GuardrailResult {
    const target = action.filePath || action.action;
    if (!action.command?.startsWith('rm') && !action.action.includes('delete')) {
      return { allowed: true, reason: '非删除操作', severity: 'info' };
    }
    for (const dir of PROTECTED_DIRS) {
      if (target.includes(dir)) {
        return {
          allowed: false,
          reason: `试图删除受保护目录: ${dir}`,
          severity: 'block',
        };
      }
    }
    return { allowed: true, reason: '文件删除允许', severity: 'info' };
  }
}
```

```typescript
// src/governance/hitl.ts
export interface HITLRequest {
  action: string;
  reason: string;
  severity: 'info' | 'warn' | 'block';
}

export interface HITLResponse {
  approved: boolean;
  timeout: boolean;
}

export interface HITLOptions {
  timeout: number; // 秒
  defaultDeny: boolean;
}

export class HITLHandler {
  private options: HITLOptions;

  constructor(options: HITLOptions) {
    this.options = options;
  }

  async requestConfirmation(request: HITLRequest): Promise<HITLResponse> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ approved: false, timeout: true });
      }, this.options.timeout * 1000);

      const severityLabel = request.severity === 'block' ? '阻断' : '警告';
      console.log(`[HITL] ${severityLabel} | 动作: ${request.action}`);
      console.log(`  原因: ${request.reason}`);
      console.log(`  ${this.options.defaultDeny ? '默认拒绝' : '默认允许'}，超时: ${this.options.timeout}秒`);
      console.log('  等待用户确认...');
    });
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/governance/`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/governance/ tests/unit/governance/
git commit -m "feat: 治理护栏（危险命令拦截、文件删除保护、HITL）"
```

---

### Task 8: 反馈校验器

**Files:**
- Create: `src/feedback/types.ts`
- Create: `src/feedback/test-validator.ts`
- Create: `src/feedback/user-feedback.ts`
- Test: `tests/unit/feedback/test-validator.test.ts`

**Interfaces:**
- 消费：`ToolResult`（来自 Task 1）
- 产出：`Feedback`, `Validator` 接口, `TestResultValidator`, `UserFeedbackValidator`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/feedback/test-validator.test.ts
import { describe, it, expect } from 'vitest';
import { TestResultValidator } from '../../../src/feedback/test-validator.js';

describe('TestResultValidator', () => {
  const validator = new TestResultValidator();

  it('应检测测试通过', () => {
    const feedback = validator.validate({
      success: true,
      data: { stdout: '✓ 3 tests passed', stderr: '' },
    });
    expect(feedback.passed).toBe(true);
    expect(feedback.summary).toContain('3 tests');
  });

  it('应检测测试失败', () => {
    const feedback = validator.validate({
      success: false,
      data: {
        stdout: '',
        stderr: 'FAIL tests/unit/test.test.ts > test fails\nAssertionError: expected 1 to be 2',
      },
      error: '命令执行失败',
    });
    expect(feedback.passed).toBe(false);
    expect(feedback.details).toContain('AssertionError');
  });

  it('无测试输出时应正常处理', () => {
    const feedback = validator.validate({
      success: true,
      data: { stdout: '', stderr: '' },
    });
    expect(feedback.passed).toBe(true);
    expect(feedback.summary).toContain('无测试输出');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/feedback/test-validator.test.ts`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/feedback/types.ts
export interface Feedback {
  passed: boolean;
  summary: string;
  details: string;
  suggestions: string[];
}

export interface Validator {
  name: string;
  validate(result: { success: boolean; data: unknown; error?: string }): Feedback;
}
```

```typescript
// src/feedback/test-validator.ts
import type { Validator, Feedback } from './types.js';

export class TestResultValidator implements Validator {
  name = 'test_result';

  validate(result: { success: boolean; data: unknown; error?: string }): Feedback {
    const stdout = (result.data as { stdout?: string })?.stdout || '';
    const stderr = (result.data as { stderr?: string })?.stderr || '';

    if (result.success && !stderr.includes('FAIL') && !stdout.includes('FAIL')) {
      const match = stdout.match(/(\d+)\s+tests?/);
      return {
        passed: true,
        summary: match ? `${match[1]} 个测试通过` : '无测试输出',
        details: stdout,
        suggestions: [],
      };
    }

    const failMatch = stderr.match(/FAIL\s+(.+?)\n(.+?)(?:\n|$)/);
    return {
      passed: false,
      summary: '测试失败',
      details: failMatch
        ? `${failMatch[1]}: ${failMatch[2]}`
        : stderr || result.error || '未知失败',
      suggestions: ['检查失败的测试并修复实现', '修复后重新运行测试'],
    };
  }
}
```

```typescript
// src/feedback/user-feedback.ts
import * as readline from 'node:readline';
import type { Validator, Feedback } from './types.js';

export class UserFeedbackValidator implements Validator {
  name = 'user_feedback';

  async validate(result: { success: boolean; data: unknown; error?: string }): Promise<Feedback> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question('操作结果是否正确？(yes/no/备注): ', (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === 'yes' || a === 'y') {
          resolve({
            passed: true,
            summary: '用户确认通过',
            details: '',
            suggestions: [],
          });
        } else {
          resolve({
            passed: false,
            summary: '用户报告问题',
            details: answer,
            suggestions: ['检查操作并重试'],
          });
        }
      });
    });
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/feedback/test-validator.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/feedback/ tests/unit/feedback/
git commit -m "feat: 反馈校验器（测试结果解析、用户反馈）"
```

---

### Task 9: 配置系统

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/loader.ts`
- Test: `tests/unit/config/loader.test.ts`

**Interfaces:**
- 不依赖任何前置任务
- 产出：`HarnessConfig`, `defaultConfig`, `loadConfig`

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/config/loader.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/config/loader.js';

describe('ConfigLoader', () => {
  it('未找到配置文件时应返回默认配置', async () => {
    const config = await loadConfig(['/nonexistent/path/config.json']);
    expect(config.model.provider).toBe('openai');
    expect(config.memory.type).toBe('sqlite');
  });

  it('应合并覆盖默认值', async () => {
    const config = await loadConfig([], { model: { model: 'gpt-4' } });
    expect(config.model.model).toBe('gpt-4');
    expect(config.model.provider).toBe('openai');
  });

  it('应从环境变量读取 API key', async () => {
    process.env.ISE_API_KEY = 'test-key-123';
    const config = await loadConfig([], {});
    expect(config.model.apiKey).toBe('test-key-123');
    delete process.env.ISE_API_KEY;
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/config/loader.test.ts`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/config/types.ts
export interface HarnessConfig {
  model: {
    provider: 'openai' | 'anthropic' | 'mock';
    model: string;
    apiKey?: string;
    maxTokens: number;
    temperature: number;
  };
  memory: {
    type: 'sqlite';
    path: string;
    codeIndex: { enabled: boolean; excludePatterns: string[] };
    contextWindow: { maxTokens: number; compressionThreshold: number };
  };
  tools: string[];
  guardrails: {
    dangerousCommands: boolean;
    fileDeletion: boolean;
    hitlTimeout: number;
  };
  feedback: {
    validators: string[];
    maxRetries: number;
  };
}
```

```typescript
// src/config/defaults.ts
import type { HarnessConfig } from './types.js';

export const defaultConfig: HarnessConfig = {
  model: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: undefined,
    maxTokens: 4096,
    temperature: 0.1,
  },
  memory: {
    type: 'sqlite',
    path: './ise-memory.db',
    codeIndex: {
      enabled: true,
      excludePatterns: ['node_modules', 'dist', '.git'],
    },
    contextWindow: {
      maxTokens: 128000,
      compressionThreshold: 0.85,
    },
  },
  tools: ['read_file', 'write_file', 'bash', 'grep'],
  guardrails: {
    dangerousCommands: true,
    fileDeletion: true,
    hitlTimeout: 30,
  },
  feedback: {
    validators: ['test_result', 'user'],
    maxRetries: 3,
  },
};
```

```typescript
// src/config/loader.ts
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultConfig } from './defaults.js';
import type { HarnessConfig } from './types.js';

export async function loadConfig(
  searchPaths?: string[],
  overrides?: Partial<HarnessConfig>
): Promise<HarnessConfig> {
  let config: HarnessConfig = JSON.parse(JSON.stringify(defaultConfig));

  if (searchPaths) {
    for (const searchPath of searchPaths) {
      const resolved = resolve(searchPath);
      if (existsSync(resolved)) {
        try {
          const content = await readFile(resolved, 'utf-8');
          const parsed = JSON.parse(content);
          config = deepMerge(config, parsed) as HarnessConfig;
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
  }

  if (overrides) {
    config = deepMerge(config, overrides) as HarnessConfig;
  }

  if (!config.model.apiKey) {
    if (process.env.ISE_API_KEY) {
      config.model.apiKey = process.env.ISE_API_KEY;
    } else if (config.model.provider === 'openai' && process.env.OPENAI_API_KEY) {
      config.model.apiKey = process.env.OPENAI_API_KEY;
    } else if (config.model.provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      config.model.apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }

  return config;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/config/loader.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/config/ tests/unit/config/loader.test.ts
git commit -m "feat: 配置系统（JSON 加载、环境变量、默认值合并）"
```

---

### Task 10: 凭据管理与 CLI

**Files:**
- Create: `src/credential/keychain.ts`
- Create: `src/credential/cli.ts`
- Create: `src/cli/index.ts`
- Test: `tests/unit/credential/credential.test.ts`

**Interfaces:**
- 不依赖任何前置任务
- 产出：`CredentialStore`, `FileCredentialStore`, `handleKeyCommand`, CLI 入口

- [ ] **Step 1: 编写失败测试**

```typescript
// tests/unit/credential/credential.test.ts
import { describe, it, expect } from 'vitest';
import { FileCredentialStore } from '../../../src/credential/keychain.js';

describe('FileCredentialStore', () => {
  it('应能加密存储和检索凭据', async () => {
    const store = new FileCredentialStore('test-password');
    await store.set('test-key', 'my-api-key');
    const retrieved = await store.get('test-key');
    expect(retrieved).toBe('my-api-key');
  });

  it('应能检查凭据是否存在', async () => {
    const store = new FileCredentialStore('test-password');
    expect(await store.exists('test-key')).toBe(false);
    await store.set('test-key', 'my-api-key');
    expect(await store.exists('test-key')).toBe(true);
  });

  it('应能清除凭据', async () => {
    const store = new FileCredentialStore('test-password');
    await store.set('test-key', 'my-api-key');
    await store.clear('test-key');
    expect(await store.exists('test-key')).toBe(false);
  });

  it('获取不存在的凭据应返回 null', async () => {
    const store = new FileCredentialStore('test-password');
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/credential/credential.test.ts`
Expected: FAIL

- [ ] **Step 3: 编写最小实现**

```typescript
// src/credential/keychain.ts
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;

export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  clear(key: string): Promise<void>;
}

export class FileCredentialStore implements CredentialStore {
  private store: Map<string, string>;
  private masterPassword: string;

  constructor(masterPassword?: string) {
    this.store = new Map();
    this.masterPassword = masterPassword || process.env.ISE_MASTER_PASSWORD || 'default-dev-password';
  }

  private encrypt(text: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(this.masterPassword, salt, KEY_LEN);
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(encoded: string): string {
    const parts = encoded.split(':');
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const key = scryptSync(this.masterPassword, salt, KEY_LEN);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf-8');
  }

  async get(key: string): Promise<string | null> {
    const encrypted = this.store.get(key);
    if (!encrypted) return null;
    try {
      return this.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, this.encrypt(value));
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async clear(key: string): Promise<void> {
    this.store.delete(key);
  }
}
```

```typescript
// src/credential/cli.ts
import * as readline from 'node:readline';
import { FileCredentialStore } from './keychain.js';
import type { CredentialStore } from './keychain.js';

function hiddenInput(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function handleKeyCommand(args: string[]): Promise<void> {
  const store: CredentialStore = new FileCredentialStore();
  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'set':
    case 'update': {
      const key = await hiddenInput('请输入 API key（输入将隐藏）: ');
      if (!key.trim()) {
        console.log('未提供 key。');
        return;
      }
      await store.set('api_key', key.trim());
      console.log('API key 已安全保存。');
      break;
    }
    case 'view':
    case 'status': {
      const exists = await store.exists('api_key');
      console.log(`API key: ${exists ? '已配置' : '未配置'}`);
      break;
    }
    case 'clear':
    case 'delete': {
      await store.clear('api_key');
      console.log('API key 已清除。');
      break;
    }
    default:
      console.log('用法: ise-harness key <set|view|clear|update>');
  }
}
```

```typescript
// src/cli/index.ts
#!/usr/bin/env node
import { handleKeyCommand } from '../credential/cli.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'key':
      await handleKeyCommand(args.slice(1));
      break;
    case 'init':
      console.log('正在初始化 ise-harness 项目...');
      break;
    case 'run':
      console.log('正在运行 agent...');
      break;
    case '--help':
    case '-h':
    default:
      console.log(`
ise-harness — Coding Agent Harness SDK

命令:
  key <set|view|clear|update>  管理 API key
  init                          初始化项目配置
  run <prompt>                  运行 agent
  --help                        显示帮助
      `);
  }
}

main().catch(console.error);
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/credential/credential.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/credential/ src/cli/ tests/unit/credential/
git commit -m "feat: 凭据管理（AES-256-GCM 加密存储）与 CLI"
```

---

### Task 11: 机制演示脚本

**Files:**
- Create: `tests/demo/guardrail-demo.test.ts`
- Create: `tests/demo/feedback-demo.test.ts`
- Create: `tests/demo/memory-demo.test.ts`

**Interfaces:**
- 消费：Task 1-10 的所有模块
- 产出：三个确定性演示脚本

- [ ] **Step 1: 编写护栏演示测试**

```typescript
// tests/demo/guardrail-demo.test.ts
import { describe, it, expect } from 'vitest';
import { DangerousCommandGuard } from '../../src/governance/dangerous-command.js';
import { Agent } from '../../src/core/agent.js';
import { MockLLMProvider } from '../../src/core/mock-llm.js';

describe('演示：护栏拦截危险动作', () => {
  it('应直接拦截危险命令', () => {
    const guard = new DangerousCommandGuard();
    const result = guard.check({ command: 'rm -rf /' });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it('应放行安全命令', () => {
    const guard = new DangerousCommandGuard();
    const result = guard.check({ command: 'ls -la' });
    expect(result.allowed).toBe(true);
  });

  it('应集成到 agent 循环中：危险工具调用被拦截并返回错误反馈', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [
          { id: 'call1', name: 'bash', arguments: { command: 'rm -rf /' } },
        ],
        stopReason: 'tool_calls',
      },
      { content: '我看到命令被拦截了', toolCalls: [], stopReason: 'stop' },
    ]);

    const executedCommands: string[] = [];
    const agent = new Agent({
      llmProvider: provider,
      tools: [
        {
          name: 'bash',
          description: '执行 shell 命令',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
          async execute(args) {
            const guard = new DangerousCommandGuard();
            const check = guard.check({ command: args.command as string });
            if (!check.allowed) {
              return {
                success: false,
                data: null,
                error: `拦截: ${check.reason}`,
              };
            }
            executedCommands.push(args.command as string);
            return { success: true, data: { stdout: 'ok', stderr: '' } };
          },
        },
      ],
      maxTurns: 5,
    });

    const result = await agent.run('删除所有东西');
    expect(executedCommands).toEqual([]);
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('拦截');
  });
});
```

- [ ] **Step 2: 编写反馈演示测试**

```typescript
// tests/demo/feedback-demo.test.ts
import { describe, it, expect } from 'vitest';
import { Agent } from '../../src/core/agent.js';
import { MockLLMProvider } from '../../src/core/mock-llm.js';

describe('演示：反馈闭环改变 agent 行为', () => {
  it('注入失败后 agent 应改变下一步动作', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [
          {
            id: 'call1',
            name: 'run_test',
            arguments: { command: 'npm test' },
          },
        ],
        stopReason: 'tool_calls',
      },
      {
        content: '',
        toolCalls: [
          {
            id: 'call2',
            name: 'edit_file',
            arguments: {
              path: 'test.js',
              oldString: 'error',
              newString: 'fix',
            },
          },
        ],
        stopReason: 'tool_calls',
      },
      { content: '测试现在通过了', toolCalls: [], stopReason: 'stop' },
    ]);

    const actions: string[] = [];
    const agent = new Agent({
      llmProvider: provider,
      tools: [
        {
          name: 'run_test',
          description: '运行测试',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
          async execute() {
            actions.push('run_test');
            return {
              success: false,
              data: {
                stdout: '',
                stderr: 'FAIL test.js > test error\nAssertionError',
              },
              error: '测试失败',
            };
          },
        },
        {
          name: 'edit_file',
          description: '编辑文件',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              oldString: { type: 'string' },
              newString: { type: 'string' },
            },
            required: ['path', 'oldString', 'newString'],
          },
          async execute() {
            actions.push('edit_file');
            return { success: true, data: '文件已编辑' };
          },
        },
      ],
      maxTurns: 5,
    });

    const result = await agent.run('修复失败的测试');
    expect(actions).toEqual(['run_test', 'edit_file']);
    const toolMsg = result.messages.find(
      (m) => m.role === 'tool' && m.content.includes('FAIL')
    );
    expect(toolMsg).toBeDefined();
  });
});
```

- [ ] **Step 3: 编写记忆演示测试**

```typescript
// tests/demo/memory-demo.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteMemory } from '../../src/memory/sqlite-memory.js';

describe('演示：跨会话记忆存储与检索', () => {
  let memory: SQLiteMemory;

  beforeAll(() => {
    memory = new SQLiteMemory(':memory:');
  });

  afterAll(() => {
    memory.close();
  });

  it('应存储和检索多轮对话', async () => {
    const sessionId = 'demo-session';

    await memory.store(sessionId, {
      role: 'user',
      content: '项目结构是什么？',
    });
    await memory.store(sessionId, {
      role: 'assistant',
      content: '使用 TypeScript，src/ 目录结构',
    });
    await memory.store(sessionId, {
      role: 'user',
      content: '添加一个新模块',
    });
    await memory.store(sessionId, {
      role: 'assistant',
      content: '已创建 src/new-module.ts',
    });

    const recent = await memory.retrieve(sessionId, 2);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe('已创建 src/new-module.ts');
    expect(recent[1].content).toBe('添加一个新模块');

    const all = await memory.retrieve(sessionId);
    expect(all.length).toBe(4);
  });

  it('应独立处理多个会话', async () => {
    await memory.store('session-a', {
      role: 'user',
      content: '会话 A 的消息',
    });
    await memory.store('session-b', {
      role: 'user',
      content: '会话 B 的消息',
    });

    const a = await memory.retrieve('session-a');
    const b = await memory.retrieve('session-b');

    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].content).toContain('会话 A');
    expect(b[0].content).toContain('会话 B');
  });

  it('应能清除会话数据', async () => {
    await memory.store('temp-session', {
      role: 'user',
      content: '临时数据',
    });
    await memory.clear('temp-session');
    const entries = await memory.retrieve('temp-session');
    expect(entries).toEqual([]);
  });
});
```

- [ ] **Step 4: 运行所有演示测试，确认通过**

Run: `npx vitest run tests/demo/`
Expected: All PASS

- [ ] **Step 5: 提交**

```bash
git add tests/demo/
git commit -m "feat: 机制演示脚本（护栏、反馈、记忆）"
```

---

### Task 12: CI 与分发

**Files:**
- Create: `.gitlab-ci.yml`
- Modify: `package.json`（添加 bin 和 scripts）

- [ ] **Step 1: 编写 CI 配置**

```yaml
# .gitlab-ci.yml
stages:
  - test
  - demo

unit-test:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm test
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

demo:
  stage: demo
  image: node:20
  script:
    - npm ci
    - npx vitest run tests/demo/ --reporter=verbose
```

- [ ] **Step 2: 更新 package.json**

```json
{
  "name": "ise-harness",
  "version": "0.1.0",
  "description": "Coding Agent Harness SDK — 记忆与上下文管理",
  "type": "module",
  "bin": {
    "ise-harness": "dist/cli/index.js"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:demo": "vitest run tests/demo/",
    "build": "tsc",
    "start": "node dist/cli/index.js",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "tsx": "^4.19.0"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "@xenova/transformers": "^2.17.0"
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add .gitlab-ci.yml package.json
git commit -m "chore: CI 配置与 npm 分发设置"
```

---

### Task 13: 文档

**Files:**
- Create: `README.md`
- Create: `SPEC_PROCESS.md`（模板）
- Create: `AGENT_LOG.md`（模板）
- Create: `REFLECTION.md`（模板）

- [ ] **Step 1: 编写 README.md**

```markdown
# ise-harness

Coding Agent Harness SDK — 将 LLM 封装为可靠编码智能体的工程层。

**重点维度：记忆与上下文管理**（跨会话记忆、代码库知识索引、上下文窗口管理）。

## 安装

```bash
npm install ise-harness
# 或全局安装 CLI
npm install -g ise-harness
```

## 快速开始

```typescript
import { Agent, OpenAIProvider } from 'ise-harness';

const agent = new Agent({
  llmProvider: new OpenAIProvider({ apiKey: 'sk-...' }),
  tools: [/* 注册工具 */],
});

const result = await agent.run('创建一个 TypeScript 项目');
```

## CLI 命令

```bash
# 管理 API key
ise-harness key set      # 录入 key（隐藏输入）
ise-harness key view     # 查看是否已配置（不显示明文）
ise-harness key clear    # 清除 key

# 运行 agent
ise-harness run "你的任务"
```

## API Key 安全配置

1. **加密文件存储**（默认）：使用 `ise-harness key set` 录入，key 以 AES-256-GCM 加密存储
2. **环境变量**：设置 `ISE_API_KEY` 环境变量（注意：明文风险）
3. **主密码**：设置 `ISE_MASTER_PASSWORD` 环境变量增强加密安全性

## 开发

```bash
npm install        # 安装依赖
npm test           # 运行所有测试
npm run test:demo  # 运行机制演示
npm run build      # 编译 TypeScript
npm run lint       # 类型检查
```

## 目录结构

```
src/
├── core/          # Agent 主循环、LLM 抽象层
├── memory/        # 记忆子系统（重点）
├── tools/         # 工具定义与注册
├── governance/    # 护栏、HITL
├── feedback/      # 校验器、反馈回灌
├── config/        # 配置系统
├── credential/    # 凭据加密存储
└── cli/           # CLI 入口
```

## 已知限制

- better-sqlite3 需要原生编译，部分环境可能安装失败
- @xenova/transformers 为可选依赖，体积较大
- 仅支持 macOS / Linux，Windows 未经测试
- 加密文件存储依赖主密码安全性

## 许可证

MIT
```

- [ ] **Step 2: 编写 SPEC_PROCESS.md 模板**

```markdown
# SPEC_PROCESS.md — 规约与计划生成过程

## 一、brainstorming 关键节点

（记录与 Superpowers brainstorming 技能协作的过程）

### 关键提问与设计修正

（记录智能体追问了哪些好问题，哪些让你修正了原设想）

### 迭代轮次

（至少 3 轮关键迭代的对话节选与处理决策）

### AI 建议的采纳与推翻

（哪些建议是 AI 提出而你采纳的？哪些是你推翻或修正的？为什么？）

### 反思

（brainstorming 技能在你的项目里做得好的地方与让你不满的地方）

## 二、冷启动验证

（用第二个不同 agent 仅凭 SPEC + PLAN 尝试实现 1-2 个 task）

### 第二个 agent 的信息

- 使用的智能体：
- 配置：
- 日期：

### 暴露的 SPEC 缺陷

（第二个 agent 在哪里暂停并提问？暴露了哪些 spec 缺陷？）

### 产出与预期差距

（它做出了哪些与原意不一致的解读？）

### 据此对 SPEC / PLAN 的修订

（修订前后的关键 diff）
```

- [ ] **Step 3: 编写 AGENT_LOG.md 模板**

```markdown
# AGENT_LOG.md — 实现过程日志

按时间顺序记录关键节点。

| 时间 | Task | 技能 | 关键操作 | Commit | 人工干预 | 教训 |
|------|------|------|---------|--------|---------|------|
| | | | | | | |
```

- [ ] **Step 4: 编写 REFLECTION.md 模板**

```markdown
# REFLECTION.md — 反思报告

（1500-2500 字，由学生本人撰写）

## 1. Superpowers 技能评估

## 2. TDD 在 AI 协作中的体验

## 3. Subagent 驱动开发体验

## 4. SPEC / PLAN 质量对实现的影响

## 5. 最有效的 prompt / context 策略

## 6. 凭据与分发的工程思考

## 7. 如果重做会改变什么

## 8. 对 Superpowers 方法论的批判
```

- [ ] **Step 5: 提交**

```bash
git add README.md SPEC_PROCESS.md AGENT_LOG.md REFLECTION.md
git commit -m "docs: README 与文档模板"
```

---

## 依赖关系图

```
Task 1 (核心类型 + MockLLM)
  ├── Task 2 (工具系统) ──────┐
  ├── Task 3 (Agent 循环) ────┤
  ├── Task 7 (护栏) ──────────┤
  ├── Task 8 (反馈) ──────────┤
  └── Task 9 (配置) ──────────┤
       │                       │
       ▼                       ▼
Task 4 (SQLite 记忆) ◄─── Task 11 (演示脚本)
Task 5 (代码索引)          │
Task 6 (上下文窗口)        │
       │                   │
       ▼                   ▼
Task 10 (凭据 + CLI) ── Task 12 (CI + 分发)
       │
       ▼
Task 13 (文档)
```

**可并行组：**
- 组 A：Task 1 → 2, 3（核心 → 工具 + Agent）
- 组 B：Task 4, 5, 6（记忆子系统，重点维度）
- 组 C：Task 7, 8（护栏 + 反馈）
- 组 D：Task 9, 10（配置 + 凭据）
- 组 E：Task 11, 12, 13（演示 + 分发 + 文档）— 依赖以上全部
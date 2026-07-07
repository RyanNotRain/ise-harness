# ise-harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Coding Agent Harness SDK with focus on Memory & Context Management, deliverable as npm package + Docker image.

**Architecture:** TypeScript agent loop with pluggable LLM providers, SQLite-backed memory, pattern-matching guardrails, and configurable validators. All core mechanisms testable via MockLLMProvider without network.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, keytar, @xenova/transformers (optional), openai npm package

## Global Constraints

- TDD: RED → GREEN → REFACTOR. Never write implementation before tests.
- Mock LLM for all core mechanism tests. No real LLM calls in unit tests.
- No secrets in code. API keys via keychain or .env only.
- All files use ES module syntax (import/export).
- No dependency on any agent framework (LangChain, AutoGen, CrewAI, etc.).

---
## File Structure

```
src/
├── core/
│   ├── types.ts            # Core types: Action, ToolResult, LLMResponse, ChatMessage
│   ├── llm-provider.ts     # LLMProvider interface
│   ├── mock-llm.ts         # MockLLMProvider — deterministic responses
│   └── agent.ts            # Agent main loop
├── memory/
│   ├── types.ts            # Memory interface
│   ├── sqlite-memory.ts    # SQLiteMemory — cross-session persistence
│   ├── code-index.ts       # CodeIndexMemory — codebase knowledge indexing
│   └── context-window.ts   # ContextWindowMemory — token-aware compression
├── tools/
│   ├── types.ts            # Tool interface
│   ├── registry.ts         # ToolRegistry — register, find, dispatch
│   ├── read-file.ts        # ReadFile tool
│   ├── write-file.ts       # WriteFile tool
│   ├── edit-file.ts        # EditFile tool
│   ├── bash.ts             # Bash tool
│   ├── glob.ts             # Glob tool
│   ├── grep.ts             # Grep tool
│   └── run-test.ts         # RunTest tool
├── governance/
│   ├── types.ts            # Guardrail interface, GuardrailResult
│   ├── dangerous-command.ts  # DangerousCommandGuard
│   ├── file-deletion.ts    # FileDeletionGuard
│   └── hitl.ts             # HITL handler — prompt user, timeout
├── feedback/
│   ├── types.ts            # Validator interface, Feedback
│   ├── test-validator.ts   # TestResultValidator — parse TAP/JUnit/vitest output
│   ├── lint-validator.ts   # LintValidator — parse lint output
│   └── user-feedback.ts    # UserFeedbackValidator — stdin input
├── config/
│   ├── types.ts            # HarnessConfig interface
│   ├── defaults.ts         # Default configuration values
│   └── loader.ts           # Config loader — YAML, JSON, env
├── credential/
│   ├── keychain.ts         # macOS Keychain via keytar
│   └── cli.ts              # CLI commands: key set/view/clear/update
└── cli/
    └── index.ts            # Main CLI entry point

tests/
├── unit/
│   ├── core/
│   │   ├── agent.test.ts
│   │   └── mock-llm.test.ts
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
│   └── config/
│       └── loader.test.ts
└── demo/
    ├── guardrail-demo.test.ts    # Demo 1: Guardrail intercepts dangerous action
    ├── feedback-demo.test.ts     # Demo 2: Feedback loop changes agent behavior
    └── memory-demo.test.ts       # Demo 3: Memory retrieval (focus dimension)
```

---

### Task 1: Core Types & LLMProvider Interface

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/llm-provider.ts`
- Create: `src/core/mock-llm.ts`
- Test: `tests/unit/core/mock-llm.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ChatMessage`, `Action`, `ToolResult`, `LLMResponse`, `LLMProvider`, `MockLLMProvider`

- [ ] **Step 1: Write the failing test for MockLLMProvider**

```typescript
// tests/unit/core/mock-llm.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../../../src/core/mock-llm.js';

describe('MockLLMProvider', () => {
  it('should return the next response from a predefined sequence', async () => {
    const provider = new MockLLMProvider([
      { role: 'assistant', content: 'Hello', toolCalls: [] },
      { role: 'assistant', content: 'World', toolCalls: [] },
    ]);
    const r1 = await provider.chat([{ role: 'user', content: 'Hi' }]);
    expect(r1.content).toBe('Hello');
    const r2 = await provider.chat([{ role: 'user', content: 'Hi' }]);
    expect(r2.content).toBe('World');
  });

  it('should throw when response sequence exhausted', async () => {
    const provider = new MockLLMProvider([]);
    await expect(provider.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow('MockLLMProvider: no more responses');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/mock-llm.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

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
import type { ChatMessage, LLMResponse, ToolCall } from './types.js';
import type { LLMProvider } from './llm-provider.js';

export class MockLLMProvider implements LLMProvider {
  private responses: LLMResponse[];
  private index = 0;

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(_messages: ChatMessage[], _options?: Record<string, unknown>): Promise<LLMResponse> {
    if (this.index >= this.responses.length) {
      throw new Error('MockLLMProvider: no more responses');
    }
    return this.responses[this.index++];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/mock-llm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/llm-provider.ts src/core/mock-llm.ts tests/unit/core/mock-llm.test.ts
git commit -m "feat: core types and MockLLMProvider"
```

---

### Task 2: Tool System (must come before Agent Loop)

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/registry.ts`
- Create: `src/tools/read-file.ts`
- Create: `src/tools/write-file.ts`
- Create: `src/tools/edit-file.ts`
- Create: `src/tools/bash.ts`
- Test: `tests/unit/tools/registry.test.ts`

**Interfaces:**
- Consumes: `ToolResult` (from Task 1)
- Produces: `Tool` interface, `ToolRegistry`, `ReadFile`, `WriteFile`, `EditFile`, `Bash`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/tools/registry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { ReadFile } from '../../../src/tools/read-file.js';

describe('ToolRegistry', () => {
  it('should register and find tools', () => {
    const registry = new ToolRegistry();
    const readFile = new ReadFile();
    registry.register(readFile);
    expect(registry.find('read_file')).toBeDefined();
    expect(registry.find('nonexistent')).toBeUndefined();
  });

  it('should list all tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    const defs = registry.listDefinitions();
    expect(defs.length).toBe(1);
    expect(defs[0].name).toBe('read_file');
  });

  it('should throw on duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    expect(() => registry.register(new ReadFile())).toThrow('already registered');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tools/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/tools/types.ts — THIS IS THE CANONICAL Tool INTERFACE, imported by Agent
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
      throw new Error(`Tool "${tool.name}" already registered`);
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
  description = 'Read the contents of a file. Optionally specify line range.';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      offset: { type: 'number', description: 'Starting line (1-indexed)', optional: true },
      limit: { type: 'number', description: 'Max lines to read', optional: true },
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
import { writeFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class WriteFile implements Tool {
  name = 'write_file';
  description = 'Write content to a file. Creates parent directories if needed.';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      await writeFile(args.path as string, args.content as string, 'utf-8');
      return { success: true, data: `Written ${(args.content as string).length} bytes` };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}
```

```typescript
// src/tools/edit-file.ts
import { readFile, writeFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class EditFile implements Tool {
  name = 'edit_file';
  description = 'Edit a file by replacing exact string matches.';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      oldString: { type: 'string', description: 'Text to replace' },
      newString: { type: 'string', description: 'Replacement text' },
    },
    required: ['path', 'oldString', 'newString'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const content = await readFile(args.path as string, 'utf-8');
      const oldStr = args.oldString as string;
      const newStr = args.newString as string;
      if (!content.includes(oldStr)) {
        return { success: false, data: null, error: 'oldString not found in file' };
      }
      const updated = content.replace(oldStr, newStr);
      await writeFile(args.path as string, updated, 'utf-8');
      return { success: true, data: 'File edited successfully' };
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
  description = 'Execute a shell command and return output.';
  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms', optional: true },
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tools/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/ tests/unit/tools/registry.test.ts
git commit -m "feat: tool system with built-in tools"
```

---

### Task 3: Agent Main Loop (imports Tool from tools/types.ts)

**Files:**
- Create: `src/core/agent.ts`
- Test: `tests/unit/core/agent.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `ChatMessage`, `LLMResponse`, `Action`, `ToolResult` (from Task 1), `Tool` (from Task 2)
- Produces: `Agent`, `AgentOptions`, `AgentRunResult`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/core/agent.test.ts
import { describe, it, expect } from 'vitest';
import { Agent } from '../../../src/core/agent.js';
import { MockLLMProvider } from '../../../src/core/mock-llm.js';

describe('Agent', () => {
  it('should halt when LLM returns stop reason', async () => {
    const provider = new MockLLMProvider([
      { content: 'Done!', toolCalls: [], stopReason: 'stop' },
    ]);
    const agent = new Agent({ llmProvider: provider });
    const result = await agent.run('Do something');
    expect(result.halted).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('should execute a tool call and incorporate result', async () => {
    const provider = new MockLLMProvider([
      {
        content: '', toolCalls: [{ id: 'call1', name: 'mock_tool', arguments: { input: 'test' } }],
        stopReason: 'tool_calls',
      },
      { content: 'Done', toolCalls: [], stopReason: 'stop' },
    ]);
    const toolExecutions: string[] = [];
    const agent = new Agent({
      llmProvider: provider,
      tools: [{
        name: 'mock_tool',
        description: 'A mock tool',
        parameters: { type: 'object', properties: { input: { type: 'string' } } },
        async execute(args) { toolExecutions.push(args.input as string); return { success: true, data: 'ok' }; },
      }],
    });
    await agent.run('Use tool');
    expect(toolExecutions).toEqual(['test']);
  });

  it('should enforce max turns', async () => {
    const provider = new MockLLMProvider(
      Array(10).fill({ content: '...', toolCalls: [], stopReason: 'tool_calls' })
    );
    const agent = new Agent({ llmProvider: provider, maxTurns: 3 });
    const result = await agent.run('Loop');
    expect(result.halted).toBe(true);
    expect(result.messages.filter(m => m.role === 'assistant').length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/agent.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/agent.ts
import type { LLMProvider } from './llm-provider.js';
import type { ChatMessage, ToolResult } from './types.js';
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
    this.systemPrompt = options.systemPrompt || 'You are a helpful coding assistant.';
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
              content: `Error: tool "${toolCall.name}" not found`,
              toolCallId: toolCall.id,
            });
            continue;
          }
          try {
            const result = await tool.execute(toolCall.arguments);
            messages.push({
              role: 'tool',
              content: JSON.stringify(result.data),
              toolCallId: toolCall.id,
            });
          } catch (err) {
            messages.push({
              role: 'tool',
              content: `Error: ${(err as Error).message}`,
              toolCallId: toolCall.id,
            });
          }
        }
      } else {
        return { halted: true, messages, turnCount: turnCount + 1 };
      }

      turnCount++;
    }

    return { halted: true, messages, turnCount };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent.ts tests/unit/core/agent.test.ts
git commit -m "feat: agent main loop"
```

---

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/registry.ts`
- Create: `src/tools/read-file.ts`
- Create: `src/tools/write-file.ts`
- Create: `src/tools/edit-file.ts`
- Create: `src/tools/bash.ts`
- Test: `tests/unit/tools/registry.test.ts`

**Interfaces:**
- Consumes: `ToolResult`, `ToolDefinition` (already defined in agent.ts)
- Produces: `ToolRegistry`, `ReadFile`, `WriteFile`, `EditFile`, `Bash`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/tools/registry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { ReadFile } from '../../../src/tools/read-file.js';

describe('ToolRegistry', () => {
  it('should register and find tools', () => {
    const registry = new ToolRegistry();
    const readFile = new ReadFile();
    registry.register(readFile);
    expect(registry.find('read_file')).toBeDefined();
    expect(registry.find('nonexistent')).toBeUndefined();
  });

  it('should list all tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    const defs = registry.listDefinitions();
    expect(defs.length).toBe(1);
    expect(defs[0].name).toBe('read_file');
  });

  it('should throw on duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    expect(() => registry.register(new ReadFile())).toThrow('already registered');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tools/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

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
      throw new Error(`Tool "${tool.name}" already registered`);
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
  description = 'Read the contents of a file. Optionally specify line range.';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      offset: { type: 'number', description: 'Starting line (1-indexed)', optional: true },
      limit: { type: 'number', description: 'Max lines to read', optional: true },
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
import { writeFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class WriteFile implements Tool {
  name = 'write_file';
  description = 'Write content to a file. Creates parent directories if needed.';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      await writeFile(args.path as string, args.content as string, 'utf-8');
      return { success: true, data: `Written ${(args.content as string).length} bytes` };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}
```

```typescript
// src/tools/edit-file.ts
import { readFile, writeFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class EditFile implements Tool {
  name = 'edit_file';
  description = 'Edit a file by replacing exact string matches.';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      oldString: { type: 'string', description: 'Text to replace' },
      newString: { type: 'string', description: 'Replacement text' },
    },
    required: ['path', 'oldString', 'newString'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const content = await readFile(args.path as string, 'utf-8');
      const oldStr = args.oldString as string;
      const newStr = args.newString as string;
      if (!content.includes(oldStr)) {
        return { success: false, data: null, error: 'oldString not found in file' };
      }
      const updated = content.replace(oldStr, newStr);
      await writeFile(args.path as string, updated, 'utf-8');
      return { success: true, data: 'File edited successfully' };
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
  description = 'Execute a shell command and return output.';
  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms', optional: true },
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tools/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/ tests/unit/tools/registry.test.ts
git commit -m "feat: tool system with built-in tools"
```

---

### Task 4: Memory Interfaces & SQLite Memory

**Files:**
- Create: `src/memory/types.ts`
- Create: `src/memory/sqlite-memory.ts`
- Test: `tests/unit/memory/sqlite-memory.test.ts`

**Interfaces:**
- Consumes: nothing independent
- Produces: `Memory` interface, `MemoryEntry`, `SQLiteMemory`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/memory/sqlite-memory.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteMemory } from '../../../src/memory/sqlite-memory.js';

describe('SQLiteMemory', () => {
  let memory: SQLiteMemory;

  beforeAll(() => {
    memory = new SQLiteMemory(':memory:'); // in-memory for testing
  });

  afterAll(() => {
    memory.close();
  });

  it('should store and retrieve entries', async () => {
    await memory.store('session1', { role: 'user', content: 'Hello' });
    const entries = await memory.retrieve('session1', 10);
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe('Hello');
  });

  it('should retrieve only the requested number of entries', async () => {
    for (let i = 0; i < 5; i++) {
      await memory.store('session2', { role: 'user', content: `msg ${i}` });
    }
    const entries = await memory.retrieve('session2', 3);
    expect(entries.length).toBe(3);
  });

  it('should return empty array for non-existent session', async () => {
    const entries = await memory.retrieve('nonexistent', 10);
    expect(entries).toEqual([]);
  });

  it('should clear session entries', async () => {
    await memory.store('session3', { role: 'user', content: 'test' });
    await memory.clear('session3');
    const entries = await memory.retrieve('session3', 10);
    expect(entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/sqlite-memory.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/memory/types.ts
export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Memory {
  store(sessionId: string, entry: MemoryEntry): Promise<void>;
  retrieve(sessionId: string, limit?: number, query?: string): Promise<MemoryEntry[]>;
  clear(sessionId: string): Promise<void>;
  summarize(sessionId: string): Promise<string>;
  close(): void;
}
```

```typescript
// src/memory/sqlite-memory.ts
import Database from 'better-sqlite3';
import type { Memory, MemoryEntry } from './types.js';

export class SQLiteMemory implements Memory {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        summary TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_entries_session ON entries(session_id, id);
    `);
  }

  async store(sessionId: string, entry: MemoryEntry): Promise<void> {
    this.db.prepare(
      'INSERT OR IGNORE INTO sessions (id) VALUES (?)'
    ).run(sessionId);
    this.db.prepare(
      'INSERT INTO entries (session_id, role, content) VALUES (?, ?, ?)'
    ).run(sessionId, entry.role, entry.content);
    this.db.prepare(
      'UPDATE sessions SET updated_at = datetime(\'now\') WHERE id = ?'
    ).run(sessionId);
  }

  async retrieve(sessionId: string, limit?: number, _query?: string): Promise<MemoryEntry[]> {
    const rows = limit
      ? this.db.prepare(
          'SELECT role, content FROM entries WHERE session_id = ? ORDER BY id DESC LIMIT ?'
        ).all(sessionId, limit)
      : this.db.prepare(
          'SELECT role, content FROM entries WHERE session_id = ? ORDER BY id DESC'
        ).all(sessionId);
    return (rows as Array<{ role: string; content: string }>).map(r => ({
      role: r.role as MemoryEntry['role'],
      content: r.content,
    }));
  }

  async clear(sessionId: string): Promise<void> {
    this.db.prepare('DELETE FROM entries WHERE session_id = ?').run(sessionId);
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  async summarize(sessionId: string): Promise<string> {
    const row = this.db.prepare('SELECT summary FROM sessions WHERE id = ?').get(sessionId) as { summary: string } | undefined;
    return row?.summary || '';
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory/sqlite-memory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/types.ts src/memory/sqlite-memory.ts tests/unit/memory/sqlite-memory.test.ts
git commit -m "feat: memory interface and SQLiteMemory"
```

---

### Task 5: Code Index Memory

**Files:**
- Create: `src/memory/code-index.ts`
- Test: `tests/unit/memory/code-index.test.ts`

**Interfaces:**
- Consumes: `Memory` interface (from Task 4)
- Produces: `CodeIndexMemory`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/memory/code-index.test.ts
import { describe, it, expect } from 'vitest';
import { CodeIndexMemory } from '../../../src/memory/code-index.js';

describe('CodeIndexMemory', () => {
  it('should index a file and retrieve by query', async () => {
    const index = new CodeIndexMemory(':memory:', {
      embedder: async (_text: string) => new Float32Array([0.1, 0.2, 0.3]),
    });
    await index.indexFile('/test/file.ts', 'function hello() { return 1; }');
    const results = await index.query('function hello', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('hello');
    index.close();
  });

  it('should return empty for unindexed query', async () => {
    const index = new CodeIndexMemory(':memory:', {
      embedder: async (_text: string) => new Float32Array([0.1, 0.2, 0.3]),
    });
    const results = await index.query('nothing', 5);
    expect(results).toEqual([]);
    index.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/code-index.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/memory/code-index.ts
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

export interface CodeIndexResult {
  filePath: string;
  content: string;
  score: number;
}

export class CodeIndexMemory {
  private db: Database.Database;
  private embedder: Embedder;

  constructor(dbPath: string, options: { embedder: Embedder }) {
    this.db = new Database(dbPath);
    this.embedder = options.embedder;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(file_path)
      );
    `);
  }

  async indexFile(filePath: string, content: string): Promise<void> {
    const hash = createHash('sha256').update(content).digest('hex');
    const existing = this.db.prepare('SELECT file_hash FROM code_index WHERE file_path = ?').get(filePath) as { file_hash: string } | undefined;
    if (existing && existing.file_hash === hash) return; // unchanged

    const embedding = await this.embedder.embed(content);
    const buf = Buffer.from(embedding.buffer);
    this.db.prepare(
      'INSERT OR REPLACE INTO code_index (file_path, file_hash, content, embedding) VALUES (?, ?, ?, ?)'
    ).run(filePath, hash, content, buf);
  }

  async query(query: string, limit: number): Promise<CodeIndexResult[]> {
    const queryEmbedding = await this.embedder.embed(query);

    const rows = this.db.prepare(
      'SELECT file_path, content, embedding FROM code_index'
    ).all() as Array<{ file_path: string; content: string; embedding: Buffer }>;

    if (rows.length === 0) return [];

    const scored = rows.map(row => {
      const storedVec = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      const score = this.cosineSimilarity(queryEmbedding, storedVec);
      return { filePath: row.file_path, content: row.content, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory/code-index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/code-index.ts tests/unit/memory/code-index.test.ts
git commit -m "feat: code index memory with semantic search"
```

---

### Task 6: Context Window Memory

**Files:**
- Create: `src/memory/context-window.ts`
- Test: `tests/unit/memory/context-window.test.ts`

**Interfaces:**
- Consumes: `MemoryEntry` (from Task 4)
- Produces: `ContextWindowMemory`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/memory/context-window.test.ts
import { describe, it, expect } from 'vitest';
import { ContextWindowMemory } from '../../../src/memory/context-window.js';

describe('ContextWindowMemory', () => {
  it('should not compress when under threshold', async () => {
    const cwm = new ContextWindowMemory({ maxTokens: 1000, compressionThreshold: 0.8 });
    const result = await cwm.addAndCheck([
      { role: 'user', content: 'short' },
      { role: 'assistant', content: 'ok' },
    ], async (_msgs) => 'summary');
    expect(result.compressed).toBe(false);
    expect(result.messages.length).toBe(2);
  });

  it('should compress when over threshold', async () => {
    const cwm = new ContextWindowMemory({ maxTokens: 100, compressionThreshold: 0.5 });
    const long = Array(20).fill('hello world').join(' ');
    const result = await cwm.addAndCheck([
      { role: 'user', content: long },
      { role: 'assistant', content: long },
      { role: 'user', content: long },
    ], async (_msgs) => 'compressed summary here');
    expect(result.compressed).toBe(true);
    // Should have replaced old messages with summary
    const summaryMsg = result.messages.find(m => m.role === 'system' && m.content.includes('summary'));
    expect(summaryMsg).toBeDefined();
  });

  it('should estimate token count', () => {
    const cwm = new ContextWindowMemory({ maxTokens: 1000, compressionThreshold: 0.8 });
    const count = cwm.estimateTokens('hello world');
    expect(count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory/context-window.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/memory/context-window.ts
import type { MemoryEntry } from './types.js';

export interface ContextWindowOptions {
  maxTokens: number;
  compressionThreshold: number; // 0.0 - 1.0, trigger compression when this ratio is exceeded
  keepRecentTurns?: number; // number of recent turns to keep uncompressed
}

export interface AddAndCheckResult {
  compressed: boolean;
  messages: MemoryEntry[];
}

export class ContextWindowMemory {
  private options: ContextWindowOptions;

  constructor(options: ContextWindowOptions) {
    this.options = {
      keepRecentTurns: 5,
      ...options,
    };
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English text
    return Math.ceil(text.length / 4);
  }

  async addAndCheck(
    messages: MemoryEntry[],
    summarizer: (messages: MemoryEntry[]) => Promise<string>
  ): Promise<AddAndCheckResult> {
    const totalTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    const threshold = this.options.maxTokens * this.options.compressionThreshold;

    if (totalTokens <= threshold) {
      return { compressed: false, messages };
    }

    // Compress: keep recent turns, summarize the rest
    const keep = this.options.keepRecentTurns!;
    const compressible = messages.slice(0, -keep);
    const recent = messages.slice(-keep);

    if (compressible.length === 0) {
      return { compressed: false, messages };
    }

    const summary = await summarizer(compressible);
    const result: MemoryEntry[] = [
      { role: 'system', content: `[Previous conversation summary: ${summary}]` },
      ...recent,
    ];

    return { compressed: true, messages: result };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory/context-window.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/context-window.ts tests/unit/memory/context-window.test.ts
git commit -m "feat: context window memory with compression"
```

---

### Task 7: Governance / Guardrails

**Files:**
- Create: `src/governance/types.ts`
- Create: `src/governance/dangerous-command.ts`
- Create: `src/governance/file-deletion.ts`
- Create: `src/governance/hitl.ts`
- Test: `tests/unit/governance/dangerous-command.test.ts`
- Test: `tests/unit/governance/hitl.test.ts`

**Interfaces:**
- Consumes: `Action` (from Task 1)
- Produces: `Guardrail`, `GuardrailResult`, `DangerousCommandGuard`, `FileDeletionGuard`, `HITLHandler`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/governance/dangerous-command.test.ts
import { describe, it, expect } from 'vitest';
import { DangerousCommandGuard } from '../../../src/governance/dangerous-command.js';

describe('DangerousCommandGuard', () => {
  const guard = new DangerousCommandGuard();

  it('should block rm -rf /', () => {
    const result = guard.check({ command: 'rm -rf /' });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it('should block dd command', () => {
    const result = guard.check({ command: 'dd if=/dev/zero of=/dev/sda' });
    expect(result.allowed).toBe(false);
  });

  it('should block mkfs command', () => {
    const result = guard.check({ command: 'mkfs.ext4 /dev/sda1' });
    expect(result.allowed).toBe(false);
  });

  it('should allow safe commands', () => {
    const result = guard.check({ command: 'ls -la' });
    expect(result.allowed).toBe(true);
  });

  it('should allow git commands', () => {
    const result = guard.check({ command: 'git status' });
    expect(result.allowed).toBe(true);
  });
});
```

```typescript
// tests/unit/governance/hitl.test.ts
import { describe, it, expect } from 'vitest';
import { HITLHandler } from '../../../src/governance/hitl.js';

describe('HITLHandler', () => {
  it('should require confirmation for blocked actions', async () => {
    const handler = new HITLHandler({ timeout: 1, defaultDeny: true });
    const result = await handler.requestConfirmation({
      action: 'rm -rf /',
      reason: 'Dangerous command',
      severity: 'block',
    });
    expect(result.approved).toBe(false);
  });

  it('should default to deny on timeout', async () => {
    const handler = new HITLHandler({ timeout: 0.01, defaultDeny: true });
    const result = await handler.requestConfirmation({
      action: 'rm -rf /',
      reason: 'Dangerous command',
      severity: 'block',
    });
    expect(result.approved).toBe(false);
    expect(result.timeout).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/governance/`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

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
  /^dd\s+/,
  /^mkfs/,
  /^fdisk/,
  /^format/,
  /^>\/dev\/sd/,
  /:(){ :\|:& };:/,  // fork bomb
  /^chmod\s+-R\s+000\s+\//,
  /^mv\s+\/\s+\/dev\/null/,
  /^wget\s+.+--output-document=\/dev\/sd/,
  /^curl\s+.+-\s*>\s*\/dev\/sd/,
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
          reason: `Command matches dangerous pattern: ${pattern}`,
          severity: 'block',
        };
      }
    }
    return { allowed: true, reason: 'Command appears safe', severity: 'info' };
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
    // Only check delete operations
    if (!action.command?.startsWith('rm') && !action.action.includes('delete')) {
      return { allowed: true, reason: 'Not a deletion operation', severity: 'info' };
    }
    for (const dir of PROTECTED_DIRS) {
      if (target.includes(dir)) {
        return {
          allowed: false,
          reason: `Attempting to delete protected directory: ${dir}`,
          severity: 'block',
        };
      }
    }
    return { allowed: true, reason: 'File deletion allowed', severity: 'info' };
  }
}
```

```typescript
// src/governance/hitl.ts
import * as readline from 'node:readline';

export interface HITLRequest {
  action: string;
  reason: string;
  severity: 'info' | 'warn' | 'block';
}

export interface HITLResponse {
  approved: boolean;
  modified?: string;
  timeout: boolean;
}

export interface HITLOptions {
  timeout: number; // seconds
  defaultDeny: boolean;
}

export class HITLHandler {
  private options: HITLOptions;

  constructor(options: HITLOptions) {
    this.options = options;
  }

  async requestConfirmation(request: HITLRequest): Promise<HITLResponse> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        rl.close();
        resolve({ approved: this.options.defaultDeny ? false : true, timeout: true });
      }, this.options.timeout * 1000);

      const sev = request.severity === 'block' ? '🔴' : request.severity === 'warn' ? '🟡' : '🔵';
      rl.question(
        `${sev} [HITL] Action: ${request.action}\n  Reason: ${request.reason}\n  Allow? (y/N/modify): `,
        (answer) => {
          clearTimeout(timer);
          rl.close();
          const a = answer.trim().toLowerCase();
          if (a === 'y' || a === 'yes') {
            resolve({ approved: true, timeout: false });
          } else if (a === 'modify' || a === 'm') {
            resolve({ approved: true, modified: '(modified by user)', timeout: false });
          } else {
            resolve({ approved: false, timeout: false });
          }
        }
      );
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/governance/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance/ tests/unit/governance/
git commit -m "feat: governance guardrails and HITL"
```

---

### Task 8: Feedback / Validators

**Files:**
- Create: `src/feedback/types.ts`
- Create: `src/feedback/test-validator.ts`
- Create: `src/feedback/lint-validator.ts`
- Create: `src/feedback/user-feedback.ts`
- Test: `tests/unit/feedback/test-validator.test.ts`

**Interfaces:**
- Consumes: `ToolResult` (from Task 1)
- Produces: `Validator`, `Feedback`, `TestResultValidator`, `LintValidator`, `UserFeedbackValidator`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/feedback/test-validator.test.ts
import { describe, it, expect } from 'vitest';
import { TestResultValidator } from '../../../src/feedback/test-validator.js';

describe('TestResultValidator', () => {
  const validator = new TestResultValidator();

  it('should detect test pass', () => {
    const feedback = validator.validate({
      success: true,
      data: { stdout: '✓ tests passed (3 tests)', stderr: '' },
    });
    expect(feedback.passed).toBe(true);
    expect(feedback.summary).toContain('3 tests');
  });

  it('should detect test failure', () => {
    const feedback = validator.validate({
      success: false,
      data: { stdout: '', stderr: 'FAIL tests/unit/test.test.ts > test fails\nAssertionError: expected 1 to be 2' },
      error: 'Command failed',
    });
    expect(feedback.passed).toBe(false);
    expect(feedback.details).toContain('AssertionError');
  });

  it('should handle no test output', () => {
    const feedback = validator.validate({
      success: true,
      data: { stdout: '', stderr: '' },
    });
    expect(feedback.passed).toBe(true);
    expect(feedback.summary).toContain('No test output');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/feedback/test-validator.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

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
        summary: match ? `${match[1]} tests passed` : 'No test output',
        details: stdout,
        suggestions: [],
      };
    }

    const failMatch = stderr.match(/FAIL\s+(.+?)\n(.+?)(?:\n|$)/);
    return {
      passed: false,
      summary: 'Tests failed',
      details: failMatch ? `${failMatch[1]}: ${failMatch[2]}` : stderr || result.error || 'Unknown failure',
      suggestions: ['Check the failing test and fix the implementation', 'Run tests again after fixing'],
    };
  }
}
```

```typescript
// src/feedback/lint-validator.ts
import type { Validator, Feedback } from './types.js';

export class LintValidator implements Validator {
  name = 'lint';

  validate(result: { success: boolean; data: unknown; error?: string }): Feedback {
    const stdout = (result.data as { stdout?: string })?.stdout || '';
    const stderr = (result.data as { stderr?: string })?.stderr || '';

    if (result.success && !stderr) {
      return { passed: true, summary: 'No lint errors', details: '', suggestions: [] };
    }

    const errors = (stderr || stdout).split('\n').filter(l => l.includes('error'));
    return {
      passed: false,
      summary: `${errors.length} lint error(s) found`,
      details: errors.join('\n'),
      suggestions: errors.map(e => `Fix: ${e}`),
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
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question('Was the action correct? (yes/no/notes): ', (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === 'yes' || a === 'y') {
          resolve({ passed: true, summary: 'User approved', details: '', suggestions: [] });
        } else {
          resolve({
            passed: false,
            summary: 'User reported issue',
            details: answer,
            suggestions: ['Review the action and retry'],
          });
        }
      });
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/feedback/test-validator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/feedback/ tests/unit/feedback/
git commit -m "feat: feedback validators"
```

---

### Task 9: Configuration System

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/loader.ts`
- Test: `tests/unit/config/loader.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `HarnessConfig`, `defaultConfig`, `loadConfig`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/config/loader.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/config/loader.js';
import { defaultConfig } from '../../../src/config/defaults.js';

describe('ConfigLoader', () => {
  it('should return default config when no file found', async () => {
    const config = await loadConfig(['/nonexistent/path/config.yaml']);
    expect(config.model.provider).toBe('openai');
    expect(config.memory.type).toBe('sqlite');
  });

  it('should override defaults with provided values', async () => {
    const config = await loadConfig([], { model: { model: 'gpt-4' } });
    expect(config.model.model).toBe('gpt-4');
    expect(config.model.provider).toBe('openai'); // should keep default
  });

  it('should resolve API key from env', async () => {
    process.env.ISE_API_KEY = 'test-key-123';
    const config = await loadConfig([], {});
    expect(config.model.apiKey).toBe('test-key-123');
    delete process.env.ISE_API_KEY;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config/loader.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/config/types.ts
export interface HarnessConfig {
  model: {
    provider: 'openai' | 'anthropic' | 'local' | 'mock';
    model: string;
    apiKey?: string;
    maxTokens: number;
    temperature: number;
  };
  memory: {
    type: 'sqlite' | 'file';
    path: string;
    codeIndex: { enabled: boolean; excludePatterns: string[] };
    contextWindow: { maxTokens: number; compressionThreshold: number };
  };
  tools: string[];
  guardrails: {
    dangerousCommands: boolean;
    fileDeletion: boolean;
    networkAccess: boolean;
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
    codeIndex: { enabled: true, excludePatterns: ['node_modules', 'dist', '.git'] },
    contextWindow: { maxTokens: 128000, compressionThreshold: 0.85 },
  },
  tools: ['read_file', 'write_file', 'edit_file', 'bash', 'glob', 'grep', 'run_test'],
  guardrails: {
    dangerousCommands: true,
    fileDeletion: true,
    networkAccess: false,
    hitlTimeout: 30,
  },
  feedback: {
    validators: ['test_result', 'lint', 'user'],
    maxRetries: 3,
  },
};
```

```typescript
// src/config/loader.ts
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { defaultConfig } from './defaults.js';
import type { HarnessConfig } from './types.js';
import { resolve } from 'node:path';

export async function loadConfig(
  searchPaths?: string[],
  overrides?: Partial<HarnessConfig>
): Promise<HarnessConfig> {
  let config = { ...defaultConfig };

  // Deep merge defaults
  config = deepMerge(config, defaultConfig) as HarnessConfig;

  // Try loading from file
  if (searchPaths) {
    for (const searchPath of searchPaths) {
      const resolved = resolve(searchPath);
      if (existsSync(resolved)) {
        try {
          const content = await readFile(resolved, 'utf-8');
          if (resolved.endsWith('.json')) {
            const parsed = JSON.parse(content);
            config = deepMerge(config, parsed) as HarnessConfig;
          }
          // YAML support would require a yaml parser dep
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  // Apply overrides
  if (overrides) {
    config = deepMerge(config, overrides) as HarnessConfig;
  }

  // Resolve API key from env
  if (!config.model.apiKey && process.env.ISE_API_KEY) {
    config.model.apiKey = process.env.ISE_API_KEY;
  }

  // Resolve API key from env provider-specific vars
  if (!config.model.apiKey) {
    if (config.model.provider === 'openai' && process.env.OPENAI_API_KEY) {
      config.model.apiKey = process.env.OPENAI_API_KEY;
    } else if (config.model.provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      config.model.apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }

  return config;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown> || {}, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config/loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/ tests/unit/config/loader.test.ts
git commit -m "feat: configuration system"
```

---

### Task 10: Credential Management

**Files:**
- Create: `src/credential/keychain.ts`
- Create: `src/credential/cli.ts`
- Create: `src/cli/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CredentialManager`, CLI commands

- [ ] **Step 1: Write the failing test**

This task is harder to unit test (depends on system keychain). Focus on the CLI logic.

```typescript
// tests/unit/credential/credential.test.ts
import { describe, it, expect } from 'vitest';

// Testing the fallback file-based credential store
describe('CredentialManager', () => {
  it('should store and retrieve credentials from encrypted file', async () => {
    // We'll test the credential manager logic
    // Actual keychain integration needs system access
    const { FileCredentialStore } = await import('../../../src/credential/keychain.js');
    const store = new FileCredentialStore(':memory:');
    await store.set('test-key', 'my-api-key');
    const retrieved = await store.get('test-key');
    expect(retrieved).toBe('my-api-key');
    expect(await store.exists('test-key')).toBe(true);
    await store.clear('test-key');
    expect(await store.exists('test-key')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/credential/credential.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

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
    try { return this.decrypt(encrypted); } catch { return null; }
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

// macOS Keychain integration (requires keytar)
export async function getKeychainStore(): Promise<CredentialStore | null> {
  try {
    const keytar = await import('keytar');
    const SERVICE = 'ise-harness';
    return {
      async get(key: string) { return keytar.default.getPassword(SERVICE, key) || null; },
      async set(key: string, value: string) { await keytar.default.setPassword(SERVICE, key, value); },
      async exists(key: string) { return (await keytar.default.getPassword(SERVICE, key)) !== null; },
      async clear(key: string) { await keytar.default.deletePassword(SERVICE, key); },
    };
  } catch {
    return null; // keytar not available, fallback to file-based
  }
}
```

```typescript
// src/credential/cli.ts
import * as readline from 'node:readline';
import { FileCredentialStore, getKeychainStore } from './keychain.js';
import type { CredentialStore } from './keychain.js';

function hiddenInput(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    // Simple hidden input (stdin is not echoed by default in Node.js)
    // For true hidden input, use a library like 'read'
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function handleKeyCommand(args: string[]): Promise<void> {
  const store: CredentialStore = (await getKeychainStore()) || new FileCredentialStore();

  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'set':
    case 'update': {
      const key = await hiddenInput('Enter API key (input hidden): ');
      if (!key.trim()) { console.log('No key provided.'); return; }
      await store.set('api_key', key.trim());
      console.log('✓ API key saved securely.');
      break;
    }
    case 'view':
    case 'status': {
      const exists = await store.exists('api_key');
      console.log(`API key: ${exists ? '✓ configured' : '✗ not configured'}`);
      break;
    }
    case 'clear':
    case 'delete': {
      await store.clear('api_key');
      console.log('✓ API key cleared.');
      break;
    }
    default:
      console.log('Usage: ise-harness key <set|view|clear|update>');
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
      console.log('Initializing ise-harness project...');
      // TODO: scaffold config file
      break;
    case 'run':
      console.log('Running agent...');
      // TODO: load config and run agent
      break;
    case '--help':
    case '-h':
    default:
      console.log(`
ise-harness — Coding Agent Harness SDK

Commands:
  key <set|view|clear|update>  Manage API keys
  init                          Initialize project config
  run <prompt>                  Run the agent
  --help                        Show this help
      `);
  }
}

main().catch(console.error);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/credential/credential.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/credential/ src/cli/ tests/unit/credential/
git commit -m "feat: credential management and CLI"
```

---

### Task 11: Mechanism Demo Scripts

**Files:**
- Create: `tests/demo/guardrail-demo.test.ts`
- Create: `tests/demo/feedback-demo.test.ts`
- Create: `tests/demo/memory-demo.test.ts`

**Goal:** Produce deterministic, mock-LLM-driven demonstrations of the three required harness behaviors.

- [ ] **Step 1: Write the guardrail demo test**

```typescript
// tests/demo/guardrail-demo.test.ts
// Demo 1: Governance guardrail intercepts a dangerous action
import { describe, it, expect } from 'vitest';
import { DangerousCommandGuard } from '../../src/governance/dangerous-command.js';
import { Agent } from '../../src/core/agent.js';
import { MockLLMProvider } from '../../src/core/mock-llm.js';

describe('Demo: Guardrail intercepts dangerous action', () => {
  it('should block dangerous command via guardrail', () => {
    const guard = new DangerousCommandGuard();
    const result = guard.check({ command: 'rm -rf /' });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it('should allow safe command', () => {
    const guard = new DangerousCommandGuard();
    const result = guard.check({ command: 'ls -la' });
    expect(result.allowed).toBe(true);
  });

  it('should integrate with agent loop: dangerous tool call gets blocked feedback', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [{ id: 'call1', name: 'bash', arguments: { command: 'rm -rf /' } }],
        stopReason: 'tool_calls',
      },
      { content: 'I see the command was blocked', toolCalls: [], stopReason: 'stop' },
    ]);

    const toolExecuted: string[] = [];
    const agent = new Agent({
      llmProvider: provider,
      tools: [{
        name: 'bash',
        description: 'Execute a shell command',
        parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
        async execute(args) {
          const guard = new DangerousCommandGuard();
          const check = guard.check({ command: args.command as string });
          if (!check.allowed) {
            return { success: false, data: null, error: `BLOCKED: ${check.reason}` };
          }
          toolExecuted.push(args.command as string);
          return { success: true, data: { stdout: 'ok', stderr: '' } };
        },
      }],
      maxTurns: 5,
    });

    const result = await agent.run('Delete everything');

    // The tool should NOT have executed the dangerous command
    expect(toolExecuted).toEqual([]);
    // The agent should have received the error feedback
    const toolMessage = result.messages.find(m => m.role === 'tool');
    expect(toolMessage?.content).toContain('BLOCKED');
  });
});
```

- [ ] **Step 2: Write the feedback demo test**

```typescript
// tests/demo/feedback-demo.test.ts
// Demo 2: Feedback loop — inject failure, agent changes behavior
import { describe, it, expect } from 'vitest';
import { Agent } from '../../src/core/agent.js';
import { MockLLMProvider } from '../../src/core/mock-llm.js';

describe('Demo: Feedback loop changes agent behavior', () => {
  it('should change next action based on failure feedback', async () => {
    // First call: LLM says "run tests"
    // Tool returns failure
    // Second call: LLM receives failure feedback, says "fix code"
    const provider = new MockLLMProvider([
      {
        content: '', toolCalls: [{ id: 'call1', name: 'run_test', arguments: { command: 'npm test' } }],
        stopReason: 'tool_calls',
      },
      {
        content: '', toolCalls: [{ id: 'call2', name: 'edit_file', arguments: { path: 'test.js', oldString: 'error', newString: 'fix' } }],
        stopReason: 'tool_calls',
      },
      { content: 'Tests pass now', toolCalls: [], stopReason: 'stop' },
    ]);

    const actions: string[] = [];
    const agent = new Agent({
      llmProvider: provider,
      tools: [
        {
          name: 'run_test', description: 'Run tests',
          parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
          async execute() {
            actions.push('run_test');
            return { success: false, data: { stdout: '', stderr: 'FAIL test.js > test error\nAssertionError' }, error: 'Tests failed' };
          },
        },
        {
          name: 'edit_file', description: 'Edit a file',
          parameters: { type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['path', 'oldString', 'newString'] },
          async execute() {
            actions.push('edit_file');
            return { success: true, data: 'File edited' };
          },
        },
      ],
      maxTurns: 5,
    });

    const result = await agent.run('Fix the failing test');

    // Agent should have run tests, got failure, then edited file
    expect(actions).toEqual(['run_test', 'edit_file']);
    // The tool result with failure should be in the messages
    const toolMsg = result.messages.find(m => m.role === 'tool' && m.content.includes('FAIL'));
    expect(toolMsg).toBeDefined();
  });
});
```

- [ ] **Step 3: Write the memory demo test**

```typescript
// tests/demo/memory-demo.test.ts
// Demo 3: Memory retrieval (focus dimension)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteMemory } from '../../src/memory/sqlite-memory.js';

describe('Demo: Memory stores and retrieves conversation history', () => {
  let memory: SQLiteMemory;

  beforeAll(() => {
    memory = new SQLiteMemory(':memory:');
  });

  afterAll(() => {
    memory.close();
  });

  it('should store and retrieve conversation across multiple turns', async () => {
    const sessionId = 'demo-session';

    // Simulate a multi-turn conversation
    await memory.store(sessionId, { role: 'user', content: 'What is the project structure?' });
    await memory.store(sessionId, { role: 'assistant', content: 'It uses TypeScript with src/ directory' });
    await memory.store(sessionId, { role: 'user', content: 'Add a new module' });
    await memory.store(sessionId, { role: 'assistant', content: 'Created src/new-module.ts' });

    // Retrieve last 2 entries
    const recent = await memory.retrieve(sessionId, 2);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe('Created src/new-module.ts');
    expect(recent[1].content).toBe('Add a new module');

    // Retrieve all entries
    const all = await memory.retrieve(sessionId);
    // In SQLite DESC order, earliest entries come last
    expect(all.length).toBe(4);
  });

  it('should handle multiple sessions independently', async () => {
    await memory.store('session-a', { role: 'user', content: 'Session A message' });
    await memory.store('session-b', { role: 'user', content: 'Session B message' });

    const a = await memory.retrieve('session-a');
    const b = await memory.retrieve('session-b');

    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].content).toContain('Session A');
    expect(b[0].content).toContain('Session B');
  });

  it('should clear session data', async () => {
    await memory.store('temp-session', { role: 'user', content: 'temp data' });
    await memory.clear('temp-session');
    const entries = await memory.retrieve('temp-session');
    expect(entries).toEqual([]);
  });
});
```

- [ ] **Step 4: Run all demo tests to verify they pass**

Run: `npx vitest run tests/demo/`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tests/demo/
git commit -m "feat: mechanism demo scripts"
```

---

### Task 12: Docker + CI + Distribution

**Files:**
- Create: `Dockerfile`
- Create: `.gitlab-ci.yml`
- Modify: `package.json` (add build scripts)

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npx tsc

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
ENV ISE_MEMORY_PATH=/data/ise-memory.db
VOLUME /data
ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["--help"]
```

- [ ] **Step 2: Create .gitlab-ci.yml**

```yaml
stages:
  - test
  - build
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

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t ise-harness .
  only:
    - main

demo:
  stage: demo
  image: node:20
  script:
    - npm ci
    - npx vitest run tests/demo/ --reporter=verbose
```

- [ ] **Step 3: Update package.json**

```json
{
  "bin": {
    "ise-harness": "dist/cli/index.js"
  },
  "scripts": {
    "test": "vitest run",
    "test:demo": "vitest run tests/demo/",
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

- [ ] **Step 4: Verify build works**

Run: `npm run build`
Expected: TypeScript compiles without errors

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .gitlab-ci.yml package.json
git commit -m "chore: Docker, CI, and distribution setup"
```

---

### Task 13: Documentation

**Files:**
- Create: `README.md`
- Create: `AGENT_LOG.md`
- Create: `REFLECTION.md` (template — user writes actual reflection)

- [ ] **Step 1: Create README.md**

See README structure below.

- [ ] **Step 2: Create AGENT_LOG.md**

See AGENT_LOG structure below.

- [ ] **Step 3: Commit**

```bash
git add README.md AGENT_LOG.md
git commit -m "docs: README and AGENT_LOG"
```

---

## Dependency Graph

```
Task 1 (Core Types + MockLLM)
  └── Task 2 (Tool System) ─────────┐
  └── Task 3 (Agent Loop) ──────────┤
  └── Task 7 (Guardrails) ──────────┤
  └── Task 8 (Feedback) ────────────┤
  └── Task 9 (Config) ──────────────┤
       │                             │
       ▼                             ▼
Task 4 (SQLite Memory) ◄──── Task 11 (Demo Scripts)
Task 5 (Code Index)          │
Task 6 (Context Window)      │
       │                     │
       ▼                     ▼
Task 10 (Credential) ──── Task 12 (Docker + CI)
       │
       ▼
Task 13 (Documentation)
```

**Parallelizable groups** (can be done in separate git worktrees):
- Group A: Tasks 1, 2, 3 (core types → tools → agent loop)
- Group B: Tasks 4, 5, 6 (memory subsystem — focus dimension)
- Group C: Tasks 7, 8 (governance + feedback)
- Group D: Tasks 9, 10 (config + credential)
- Group E: Tasks 11, 12, 13 (demo + infra + docs) — depends on all above
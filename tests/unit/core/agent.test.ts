import { describe, it, expect } from 'vitest';
import { Agent } from '../../../src/core/agent.js';
import { MockLLMProvider } from '../../../src/core/mock-llm.js';
import { DangerousCommandGuard } from '../../../src/governance/dangerous-command.js';
import { TestResultValidator } from '../../../src/feedback/test-validator.js';
import { ContextWindowMemory } from '../../../src/memory/context-window.js';
import { SQLiteMemory } from '../../../src/memory/sqlite-memory.js';

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

  it('应把工具定义提供给 LLM', async () => {
    const provider = new MockLLMProvider([{ content: '完成', toolCalls: [], stopReason: 'stop' }]);
    const agent = new Agent({
      llmProvider: provider,
      tools: [{
        name: 'read_file',
        description: '读取文件',
        parameters: { type: 'object' },
        async execute() { return { success: true, data: '' }; },
      }],
    });
    await agent.run('读取 README');
    expect(provider.optionHistory[0].tools?.[0].name).toBe('read_file');
  });

  it('上下文管理不应丢失工具调用协议字段', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [{ id: 'context-call', name: 'mock_tool', arguments: { input: 'test' } }],
        stopReason: 'tool_calls',
      },
      { content: '完成', toolCalls: [], stopReason: 'stop' },
    ]);
    const agent = new Agent({
      llmProvider: provider,
      tools: [{
        name: 'mock_tool',
        description: '模拟工具',
        parameters: { type: 'object' },
        async execute() { return { success: true, data: 'ok' }; },
      }],
      contextWindow: new ContextWindowMemory({
        maxTokens: 1,
        compressionThreshold: 0.1,
        keepRecentTurns: 10,
      }),
      summarizer: async () => '摘要',
    });

    await agent.run('使用工具');

    const secondTurn = provider.callHistory[1];
    expect(secondTurn.find((message) => message.role === 'assistant')?.toolCalls).toEqual([
      { id: 'context-call', name: 'mock_tool', arguments: { input: 'test' } },
    ]);
    expect(secondTurn.find((message) => message.role === 'tool')?.toolCallId).toBe('context-call');
  });

  it('不应把旧数据库中缺少关联 ID 的孤立工具消息发送给 LLM', async () => {
    const memory = new SQLiteMemory(':memory:');
    try {
      await memory.store('legacy-session', { role: 'tool', content: '旧工具结果' });
      const provider = new MockLLMProvider([
        { content: '完成', toolCalls: [], stopReason: 'stop' },
      ]);
      const agent = new Agent({ llmProvider: provider, memory, sessionId: 'legacy-session' });

      await agent.run('继续任务');

      expect(provider.callHistory[0].some((message) => message.role === 'tool')).toBe(false);
    } finally {
      await memory.close();
    }
  });

  it('不应恢复因进程中断而缺少工具结果的不完整调用组', async () => {
    const memory = new SQLiteMemory(':memory:');
    try {
      await memory.store('interrupted-session', {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'unfinished-call', name: 'bash', arguments: { command: 'npm test' } }],
      });
      const provider = new MockLLMProvider([
        { content: '完成', toolCalls: [], stopReason: 'stop' },
      ]);
      const agent = new Agent({ llmProvider: provider, memory, sessionId: 'interrupted-session' });

      await agent.run('重新开始');

      expect(provider.callHistory[0].some((message) => message.toolCalls?.length)).toBe(false);
    } finally {
      await memory.close();
    }
  });

  it.each([
    {
      name: '未知工具',
      toolName: 'missing_tool',
      tools: [],
      expected: '未找到',
    },
    {
      name: '工具异常',
      toolName: 'throwing_tool',
      tools: [{
        name: 'throwing_tool', description: '抛出异常', parameters: {},
        async execute() { throw new Error('注入异常'); },
      }],
      expected: '注入异常',
    },
  ])('$name 的结果应写入跨会话记忆并保持工具调用关联', async ({ toolName, tools, expected }) => {
    const memory = new SQLiteMemory(':memory:');
    try {
      const firstProvider = new MockLLMProvider([
        {
          content: '',
          toolCalls: [{ id: `error-${toolName}`, name: toolName, arguments: {} }],
          stopReason: 'tool_calls',
        },
        { content: '本轮结束', toolCalls: [], stopReason: 'stop' },
      ]);
      await new Agent({
        llmProvider: firstProvider,
        memory,
        sessionId: `session-${toolName}`,
        tools,
      }).run('执行工具');

      const secondProvider = new MockLLMProvider([
        { content: '恢复完成', toolCalls: [], stopReason: 'stop' },
      ]);
      await new Agent({
        llmProvider: secondProvider,
        memory,
        sessionId: `session-${toolName}`,
      }).run('恢复历史');

      const restoredTool = secondProvider.callHistory[0].find((message) => message.role === 'tool');
      expect(restoredTool?.toolCallId).toBe(`error-${toolName}`);
      expect(restoredTool?.content).toContain(expected);
    } finally {
      await memory.close();
    }
  });

  it('应把声明式 maxTokens 和 temperature 提供给 LLM', async () => {
    const provider = new MockLLMProvider([{ content: '完成', toolCalls: [], stopReason: 'stop' }]);
    const agent = new Agent({
      llmProvider: provider,
      llmOptions: { maxTokens: 2048, temperature: 0.25 },
    });

    await agent.run('检查配置');

    expect(provider.optionHistory[0].maxTokens).toBe(2048);
    expect(provider.optionHistory[0].temperature).toBe(0.25);
  });

  it('应在主循环中拦截危险动作', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [{ id: 'danger', name: 'bash', arguments: { command: 'sudo rm -rf /' } }],
        stopReason: 'tool_calls',
      },
      { content: '已停止危险操作', toolCalls: [], stopReason: 'stop' },
    ]);
    let executed = false;
    const agent = new Agent({
      llmProvider: provider,
      guardrails: [new DangerousCommandGuard()],
      tools: [{
        name: 'bash', description: 'shell', parameters: {},
        async execute() { executed = true; return { success: true, data: '' }; },
      }],
    });
    const result = await agent.run('删除根目录');
    expect(executed).toBe(false);
    expect(result.messages.some((message) => message.content.includes('护栏拦截'))).toBe(true);
  });

  it('应把确定性失败反馈回灌给下一轮 LLM', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [{ id: 'test', name: 'run_test', arguments: { command: 'npm test' } }],
        stopReason: 'tool_calls',
      },
      { content: '根据失败反馈修复', toolCalls: [], stopReason: 'stop' },
    ]);
    const agent = new Agent({
      llmProvider: provider,
      validators: [new TestResultValidator()],
      tools: [{
        name: 'run_test', description: '测试', parameters: {},
        async execute() {
          return { success: false, data: { stdout: '', stderr: 'FAIL a.test.ts\nAssertionError' } };
        },
      }],
    });
    await agent.run('修复测试');
    expect(provider.callHistory[1].some((message) => message.content.includes('确定性反馈'))).toBe(true);
  });

  it('多工具调用时应先回灌全部工具结果，再追加验证反馈', async () => {
    const provider = new MockLLMProvider([
      {
        content: '',
        toolCalls: [
          { id: 'first-call', name: 'first_tool', arguments: {} },
          { id: 'second-call', name: 'second_tool', arguments: {} },
        ],
        stopReason: 'tool_calls',
      },
      { content: '已根据反馈处理', toolCalls: [], stopReason: 'stop' },
    ]);
    const agent = new Agent({
      llmProvider: provider,
      validators: [{
        name: 'always-fail',
        async validate() {
          return { passed: false, summary: '需要修复', details: '测试失败', suggestions: ['重试'] };
        },
      }],
      tools: [
        {
          name: 'first_tool', description: '第一个工具', parameters: {},
          async execute() { return { success: true, data: 'first' }; },
        },
        {
          name: 'second_tool', description: '第二个工具', parameters: {},
          async execute() { return { success: true, data: 'second' }; },
        },
      ],
    });

    await agent.run('依次调用两个工具');

    const secondTurn = provider.callHistory[1];
    const assistantIndex = secondTurn.findIndex((message) => message.toolCalls?.length === 2);
    expect(secondTurn.slice(assistantIndex + 1).map((message) => message.role)).toEqual([
      'tool',
      'tool',
      'user',
      'user',
    ]);
    expect(secondTurn.slice(assistantIndex + 1, assistantIndex + 3).map((message) => message.toolCallId)).toEqual([
      'first-call',
      'second-call',
    ]);
  });
});

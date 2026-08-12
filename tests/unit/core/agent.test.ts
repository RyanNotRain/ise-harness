import { describe, it, expect } from 'vitest';
import { Agent } from '../../../src/core/agent.js';
import { MockLLMProvider } from '../../../src/core/mock-llm.js';
import { DangerousCommandGuard } from '../../../src/governance/dangerous-command.js';
import { TestResultValidator } from '../../../src/feedback/test-validator.js';

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
});

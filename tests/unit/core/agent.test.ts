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
import { describe, it, expect } from 'vitest';
import { Agent } from '../../src/core/agent.js';
import { MockLLMProvider } from '../../src/core/mock-llm.js';
import { TestResultValidator } from '../../src/feedback/test-validator.js';

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
      validators: [new TestResultValidator()],
      maxTurns: 5,
    });

    const result = await agent.run('修复失败的测试');
    expect(actions).toEqual(['run_test', 'edit_file']);
    const toolMsg = result.messages.find(
      (m) => m.role === 'tool' && m.content.includes('FAIL')
    );
    expect(toolMsg).toBeDefined();
    expect(provider.callHistory[1].some(
      (message) => message.content.includes('[确定性反馈:test_result]')
    )).toBe(true);
  });
});

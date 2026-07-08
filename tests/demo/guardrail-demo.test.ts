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
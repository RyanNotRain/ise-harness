import { describe, it, expect } from 'vitest';
import { ContextWindowMemory } from '../../../src/memory/context-window.js';
import type { MemoryEntry } from '../../../src/memory/types.js';

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

  it('压缩边界不应拆开工具调用与工具结果', async () => {
    const cwm = new ContextWindowMemory({
      maxTokens: 1,
      compressionThreshold: 0.1,
      keepRecentTurns: 2,
    });
    const messages: MemoryEntry[] = [
      { role: 'user', content: '较早消息' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'paired-call', name: 'read_file', arguments: { path: 'README.md' } }],
      },
      { role: 'tool', content: '文件内容', toolCallId: 'paired-call' },
      { role: 'user', content: '继续' },
    ];

    const result = await cwm.addAndCheck(messages, async () => '摘要');

    expect(result.compressed).toBe(true);
    expect(result.messages.slice(1)).toEqual(messages.slice(1));
  });
});

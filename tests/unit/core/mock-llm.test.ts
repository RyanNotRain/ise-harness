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
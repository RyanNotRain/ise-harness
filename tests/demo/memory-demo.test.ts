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
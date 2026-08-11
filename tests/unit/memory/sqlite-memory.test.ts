import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteMemory } from '../../../src/memory/sqlite-memory.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('SQLiteMemory', () => {
  let memory: SQLiteMemory;

  beforeAll(() => {
    memory = new SQLiteMemory(':memory:');
  });

  afterAll(async () => {
    await memory.close();
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

  it('关闭后新实例应能恢复磁盘记忆', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ise-memory-'));
    const path = join(directory, 'memory.db');
    try {
      const first = new SQLiteMemory(path);
      await first.store('persistent', { role: 'user', content: '跨进程约定' });
      await first.close();
      const second = new SQLiteMemory(path);
      expect(await second.retrieve('persistent')).toEqual([{ role: 'user', content: '跨进程约定' }]);
      await second.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

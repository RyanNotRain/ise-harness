import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLiteMemory } from '../../../src/memory/sqlite-memory.js';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

type TestHooks = {
  persist: (db: unknown) => Promise<void>;
  ensureInit: () => Promise<unknown>;
  db: unknown;
  initialized: boolean;
};

describe('SQLiteMemory', () => {
  let memory: SQLiteMemory;

  beforeAll(() => {
    memory = new SQLiteMemory(':memory:');
  });

  afterAll(async () => {
    await memory.close();
  });

  it('应能存储和检索条目', async () => {
    await memory.store('session1', {
      role: 'user',
      content: '你好',
      metadata: { source: 'unit-test', priority: 2 },
    });
    const entries = await memory.retrieve('session1', 10);
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe('你好');
    expect(entries[0].metadata).toEqual({ source: 'unit-test', priority: 2 });
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

  it('应拒绝超过 100KB 的单条记忆', async () => {
    await expect(memory.store('oversized', {
      role: 'user',
      content: 'x'.repeat(100 * 1024 + 1),
    })).rejects.toThrow('100KB');
  });

  it('单会话应只保留最新 10000 条记忆', async () => {
    const bounded = new SQLiteMemory(':memory:');
    try {
      for (let index = 0; index <= 10_000; index += 1) {
        await bounded.store('bounded', { role: 'user', content: `消息 ${index}` });
      }
      const entries = await bounded.retrieve('bounded');
      expect(entries).toHaveLength(10_000);
      expect(entries[0].content).toBe('消息 10000');
      expect(entries.at(-1)?.content).toBe('消息 1');
    } finally {
      await bounded.close();
    }
  }, 30_000);

  it('关闭后新实例应能恢复磁盘记忆', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ise-memory-'));
    const path = join(directory, 'memory.db');
    try {
      const first = new SQLiteMemory(path);
      await first.store('persistent', {
        role: 'user',
        content: '跨进程约定',
        metadata: { category: 'decision' },
      });
      await first.close();
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      const second = new SQLiteMemory(path);
      expect(await second.retrieve('persistent')).toEqual([{
        role: 'user',
        content: '跨进程约定',
        metadata: { category: 'decision' },
      }]);
      await second.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('并发写入同一个磁盘数据库时不应丢失条目或发生临时文件冲突', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ise-memory-concurrent-'));
    const path = join(directory, 'memory.db');
    const concurrent = new SQLiteMemory(path);
    try {
      await expect(Promise.all(
        Array.from({ length: 25 }, (_, index) => concurrent.store('shared', {
          role: 'user',
          content: `并发消息 ${index}`,
        }))
      )).resolves.toHaveLength(25);
      await concurrent.close();

      const reopened = new SQLiteMemory(path);
      expect(await reopened.retrieve('shared')).toHaveLength(25);
      await reopened.close();
    } finally {
      await concurrent.close().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['retrieve', (target: SQLiteMemory) => target.retrieve('lifecycle')],
    ['retrieveDecisions', (target: SQLiteMemory) => target.retrieveDecisions('lifecycle')],
    ['summarize', (target: SQLiteMemory) => target.summarize('lifecycle')],
  ])('未初始化实例的 %s 已发起时 close 应等待读取完成', async (_name, read) => {
    const warmup = new SQLiteMemory(':memory:');
    await warmup.retrieve('warmup');
    await warmup.close();
    const target = new SQLiteMemory(':memory:');
    const hooks = target as unknown as TestHooks;
    const originalEnsureInit = hooks.ensureInit.bind(target);
    const started = deferred();
    const release = deferred();
    hooks.ensureInit = async () => {
      started.resolve();
      await release.promise;
      return originalEnsureInit();
    };

    const pendingRead = read(target);
    await started.promise;
    let closeSettled = false;
    const closing = target.close().then(() => { closeSettled = true; });
    await Promise.resolve();
    const closeOvertookRead = closeSettled;
    release.resolve();
    await Promise.all([pendingRead, closing]);

    expect(closeOvertookRead).toBe(false);
    expect(hooks.db).toBeNull();
    expect(hooks.initialized).toBe(false);
  });

  it('所有写 API 应共用队列，读 API 应等待已排队写入', async () => {
    const queued = new SQLiteMemory(':memory:');
    const hooks = queued as unknown as TestHooks;
    const originalPersist = hooks.persist.bind(queued);
    const started = deferred();
    const release = deferred();
    let calls = 0;
    hooks.persist = async (db) => {
      calls += 1;
      if (calls === 1) { started.resolve(); await release.promise; }
      await originalPersist(db);
    };
    const store = queued.store('ordered', { role: 'user', content: '将被清除' });
    await started.promise;
    const clear = queued.clear('ordered');
    const decision = queued.storeDecision('ordered', { context: '顺序', decision: '串行', rationale: '竞态' });
    const update = queued.updateSummary('ordered', '排队后摘要');
    const entries = queued.retrieve('ordered');
    const decisions = queued.retrieveDecisions('ordered');
    const summary = queued.summarize('ordered');
    await Promise.resolve();
    expect(calls).toBe(1);
    release.resolve();
    await Promise.all([store, clear, decision, update]);
    await expect(entries).resolves.toEqual([]);
    await expect(decisions).resolves.toEqual([{ context: '顺序', decision: '串行', rationale: '竞态' }]);
    await expect(summary).resolves.toBe('排队后摘要');
    await queued.close();
  });

  it('close 应等待已排队写入，写失败不得毒化后续队列', async () => {
    const queued = new SQLiteMemory(':memory:');
    const hooks = queued as unknown as TestHooks;
    const originalPersist = hooks.persist.bind(queued);
    const started = deferred();
    const release = deferred();
    let calls = 0;
    hooks.persist = async (db) => {
      calls += 1;
      if (calls === 1) throw new Error('注入的持久化失败');
      if (calls === 2) {
        started.resolve();
        await release.promise;
      }
      await originalPersist(db);
    };
    await expect(queued.store('recovery', { role: 'user', content: '保留' })).rejects.toThrow('注入的持久化失败');
    const update = queued.updateSummary('recovery', '已恢复');
    await started.promise;
    let closeSettled = false;
    const closing = queued.close().then(() => { closeSettled = true; });
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    release.resolve();
    await expect(update).resolves.toBeUndefined();
    await expect(closing).resolves.toBeUndefined();
    expect(hooks.db).toBeNull();
    expect(hooks.initialized).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { CodeIndexMemory } from '../../../src/memory/code-index.js';

describe('CodeIndexMemory', () => {
  it('应能索引文件并通过查询检索', async () => {
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(_text: string) {
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    await index.indexFile('/test/file.ts', 'function hello() { return 1; }');
    const results = await index.query('function hello', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('hello');
    await index.close();
  });

  it('未索引的查询应返回空', async () => {
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(_text: string) {
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    const results = await index.query('nothing', 5);
    expect(results).toEqual([]);
    await index.close();
  });

  it('应支持增量更新（相同哈希不重新索引）', async () => {
    const embedCalls: string[] = [];
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(text: string) {
          embedCalls.push(text);
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    await index.indexFile('/test/file.ts', 'const x = 1;');
    expect(embedCalls.length).toBe(1);
    await index.indexFile('/test/file.ts', 'const x = 1;');
    expect(embedCalls.length).toBe(1);
    await index.close();
  });

  it('内容变更后应重新索引', async () => {
    const embedCalls: string[] = [];
    const index = new CodeIndexMemory(':memory:', {
      embedder: {
        async embed(text: string) {
          embedCalls.push(text);
          return new Float32Array([0.1, 0.2, 0.3]);
        },
      },
    });
    await index.indexFile('/test/file.ts', 'const x = 1;');
    await index.indexFile('/test/file.ts', 'const x = 2;');
    expect(embedCalls.length).toBe(2);
    await index.close();
  });
});

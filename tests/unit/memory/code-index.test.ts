import { describe, it, expect } from 'vitest';
import { CodeIndexMemory, HashingEmbedder } from '../../../src/memory/code-index.js';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CodeIndexMemory', () => {
  it('内置 hashing embedder 应确定性地把共享代码词映射得更接近', async () => {
    const embedder = new HashingEmbedder(128);
    const query = await embedder.embed('parse user config');
    const related = await embedder.embed('function parseUserConfig input');
    const unrelated = await embedder.embed('database migration rollback');

    expect(await embedder.embed('parse user config')).toEqual(query);
    expect(query).toHaveLength(128);
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

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

  it('目录索引应排除依赖目录、跳过超大文件并可从磁盘恢复', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ise-code-index-'));
    const databasePath = join(directory, 'index.db');
    const workspace = join(directory, 'workspace');
    const embedCalls: string[] = [];
    const embedder = {
      async embed(text: string) {
        embedCalls.push(text);
        return new Float32Array([1, 0, 0]);
      },
    };

    try {
      await mkdir(join(workspace, 'src'), { recursive: true });
      await mkdir(join(workspace, 'node_modules', 'ignored'), { recursive: true });
      await writeFile(join(workspace, 'src', 'kept.ts'), 'export const kept = true;');
      await writeFile(join(workspace, 'node_modules', 'ignored', 'index.ts'), 'export const ignored = true;');
      await writeFile(join(workspace, 'too-large.ts'), 'x'.repeat(512 * 1024 + 1));

      const first = new CodeIndexMemory(databasePath, { embedder });
      expect(await first.indexDirectory(workspace)).toBe(1);
      await first.close();
      expect((await stat(databasePath)).mode & 0o777).toBe(0o600);
      expect(embedCalls).toEqual(['export const kept = true;']);

      const second = new CodeIndexMemory(databasePath, { embedder });
      const results = await second.query('kept', 5);
      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe(join('src', 'kept.ts'));
      expect(results[0].content).toContain('kept');
      await second.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function cosine(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

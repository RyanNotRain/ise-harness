import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WriteFile } from '../../../src/tools/write-file.js';
import { ReadFile } from '../../../src/tools/read-file.js';

describe('工具工作区边界', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ise-workspace-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('应允许在工作区内写入和读取', async () => {
    const write = await new WriteFile(root).execute({ path: 'src/a.ts', content: 'export {}' });
    expect(write.success).toBe(true);
    expect(await readFile(join(root, 'src/a.ts'), 'utf-8')).toBe('export {}');
    expect((await new ReadFile(root).execute({ path: 'src/a.ts' })).success).toBe(true);
  });

  it('应拒绝路径逃逸', async () => {
    const result = await new WriteFile(root).execute({ path: '../outside.txt', content: 'blocked' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('工作区边界');
  });

  it('应拒绝通过工作区内符号链接读写外部文件', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'ise-outside-'));
    try {
      await writeFile(join(outside, 'secret.txt'), 'outside', 'utf-8');
      await symlink(outside, join(root, 'linked-outside'));

      const read = await new ReadFile(root).execute({ path: 'linked-outside/secret.txt' });
      const write = await new WriteFile(root).execute({ path: 'linked-outside/new.txt', content: 'blocked' });

      expect(read.success).toBe(false);
      expect(read.error).toContain('工作区边界');
      expect(write.success).toBe(false);
      expect(write.error).toContain('工作区边界');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

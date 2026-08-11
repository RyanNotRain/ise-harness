import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';
import { resolveWorkspacePath } from './workspace.js';

export class WriteFile implements Tool {
  name = 'write_file';
  description = '将内容写入文件，自动创建父目录';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '要写入的内容' },
    },
    required: ['path', 'content'],
  };
  constructor(private workspaceRoot = process.cwd()) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const path = resolveWorkspacePath(this.workspaceRoot, String(args.path));
      const content = args.content as string;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf-8');
      return { success: true, data: `已写入 ${content.length} 字节` };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}

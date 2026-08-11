import { readFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';
import { resolveWorkspacePath } from './workspace.js';

export class Grep implements Tool {
  name = 'grep';
  description = '在文件中搜索匹配正则表达式的内容';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      pattern: { type: 'string', description: '正则表达式' },
    },
    required: ['path', 'pattern'],
  };
  constructor(private workspaceRoot = process.cwd()) {}

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const content = await readFile(resolveWorkspacePath(this.workspaceRoot, String(args.path)), 'utf-8');
      const pattern = new RegExp(String(args.pattern));
      const lines = content.split('\n');
      const matches: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          matches.push(`${i + 1}: ${lines[i]}`);
        }
      }
      return { success: true, data: matches.join('\n') || '未找到匹配项' };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}

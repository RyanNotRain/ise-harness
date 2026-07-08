import { readFile } from 'node:fs/promises';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

export class ReadFile implements Tool {
  name = 'read_file';
  description = '读取文件内容，支持指定行范围';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      offset: { type: 'number', description: '起始行（1-indexed）' },
      limit: { type: 'number', description: '最大读取行数' },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const content = await readFile(args.path as string, 'utf-8');
      const lines = content.split('\n');
      const offset = (args.offset as number) || 1;
      const limit = args.limit as number | undefined;
      const result = limit ? lines.slice(offset - 1, offset - 1 + limit).join('\n') : content;
      return { success: true, data: result };
    } catch (err) {
      return { success: false, data: null, error: (err as Error).message };
    }
  }
}
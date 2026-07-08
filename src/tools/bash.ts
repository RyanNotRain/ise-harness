import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool } from './types.js';
import type { ToolResult } from '../core/types.js';

const execAsync = promisify(exec);

export class Bash implements Tool {
  name = 'bash';
  description = '执行 shell 命令并返回输出';
  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的 shell 命令' },
      timeout: { type: 'number', description: '超时时间（毫秒）' },
    },
    required: ['command'],
  };
  private timeout: number;

  constructor(timeout = 30000) {
    this.timeout = timeout;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await execAsync(args.command as string, {
        timeout: (args.timeout as number) || this.timeout,
      });
      return { success: true, data: { stdout, stderr } };
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string };
      return {
        success: false,
        data: { stdout: error.stdout || '', stderr: error.stderr || '' },
        error: error.message,
      };
    }
  }
}
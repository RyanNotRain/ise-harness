import { resolve, sep } from 'node:path';
import type { Guardrail, GuardrailCheck, GuardrailResult } from './types.js';

const PROTECTED_DIRS = ['/etc', '/usr', '/bin', '/sbin', '/boot', '/System', '/Library'];

export class FileDeletionGuard implements Guardrail {
  name = 'file_deletion';

  check(action: GuardrailCheck): GuardrailResult {
    const command = action.command?.trim() ?? '';
    const isDeletion = action.toolName === 'delete_file'
      || /(?:^|[;&|]{1,2}\s*)(?:sudo\s+)?rm\b/i.test(command)
      || /delete/i.test(action.action);
    if (!isDeletion) {
      return { allowed: true, reason: '非删除操作', severity: 'info' };
    }
    const target = action.filePath ? resolve(action.filePath) : undefined;
    for (const dir of PROTECTED_DIRS) {
      const commandTargetsProtectedDirectory = new RegExp(`${escapeRegex(dir)}(?:${escapeRegex(sep)}|\\s|$)`).test(command);
      if (target === dir || target?.startsWith(`${dir}${sep}`) || commandTargetsProtectedDirectory) {
        return {
          allowed: false,
          reason: `试图删除受保护目录: ${dir}`,
          severity: 'block',
        };
      }
    }
    if ((target && /(?:^|\/)\.git(?:\/|$)/.test(target)) || /(?:^|[\s/])\.git(?:[\s/]|$)/.test(command)) {
      return { allowed: false, reason: '试图删除 Git 元数据', severity: 'block' };
    }
    return { allowed: true, reason: '文件删除允许', severity: 'info' };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

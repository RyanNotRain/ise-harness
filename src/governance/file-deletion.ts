import type { Guardrail, GuardrailCheck, GuardrailResult } from './types.js';

const PROTECTED_DIRS = [
  '/etc', '/usr', '/bin', '/sbin', '/boot',
  '/System', '/Library', '.git',
];

export class FileDeletionGuard implements Guardrail {
  name = 'file_deletion';

  check(action: GuardrailCheck): GuardrailResult {
    const target = action.filePath || action.action;
    if (!action.command?.startsWith('rm') && !action.action.includes('delete')) {
      return { allowed: true, reason: '非删除操作', severity: 'info' };
    }
    for (const dir of PROTECTED_DIRS) {
      if (target.includes(dir)) {
        return {
          allowed: false,
          reason: `试图删除受保护目录: ${dir}`,
          severity: 'block',
        };
      }
    }
    return { allowed: true, reason: '文件删除允许', severity: 'info' };
  }
}
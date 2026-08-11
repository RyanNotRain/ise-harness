import type { Guardrail, GuardrailCheck, GuardrailResult } from './types.js';

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(?:^|[;&|]{1,2}\s*)(?:sudo\s+)?rm\s+-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\s+(?:\/|\*|~)(?:\s|$)/i, label: '递归强制删除宽泛路径' },
  { pattern: /(?:^|[;&|]{1,2}\s*)(?:sudo\s+)?(?:dd|mkfs(?:\.[a-z0-9]+)?|fdisk|format)\b/i, label: '磁盘破坏命令' },
  { pattern: />\s*\/dev\/(?:sd|disk|nvme)/i, label: '直接写入块设备' },
  { pattern: /:\(\)\s*\{/, label: 'fork bomb' },
  { pattern: /(?:^|[;&|]{1,2}\s*)(?:sudo\s+)?chmod\s+-R\s+0{3}\b/i, label: '递归移除权限' },
  { pattern: /(?:^|[;&|]{1,2}\s*)(?:sudo\s+)?(?:shutdown|reboot|halt|poweroff)\b/i, label: '系统关机命令' },
];

export class DangerousCommandGuard implements Guardrail {
  name = 'dangerous_command';

  check(action: GuardrailCheck): GuardrailResult {
    if (action.toolName && action.toolName !== 'bash') {
      return { allowed: true, reason: '非 shell 工具', severity: 'info' };
    }
    const cmd = (action.command || action.action).trim();
    for (const { pattern, label } of DANGEROUS_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `危险命令：${label}`,
          severity: 'block',
        };
      }
    }
    return { allowed: true, reason: '命令看起来安全', severity: 'info' };
  }
}

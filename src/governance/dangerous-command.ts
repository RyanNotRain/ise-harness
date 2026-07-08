import type { Guardrail, GuardrailCheck, GuardrailResult } from './types.js';

const DANGEROUS_PATTERNS = [
  /^rm\s+-rf\s+\//,
  /^rm\s+-rf\s+\*/,
  /^dd\s+/,
  /^mkfs/,
  /^fdisk/,
  /^format/,
  /^>\/dev\/sd/,
  /:\(\)\s*\{/,
  /^chmod\s+-R\s+000/,
  /^wget\s+.+--output-document=\/dev\/sd/,
  /^curl\s+.+>\s*\/dev\/sd/,
  /^shutdown/,
  /^reboot/,
  /^halt/,
];

export class DangerousCommandGuard implements Guardrail {
  name = 'dangerous_command';

  check(action: GuardrailCheck): GuardrailResult {
    const cmd = action.command || action.action;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `命令匹配危险模式: ${pattern}`,
          severity: 'block',
        };
      }
    }
    return { allowed: true, reason: '命令看起来安全', severity: 'info' };
  }
}
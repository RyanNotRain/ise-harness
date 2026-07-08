import { describe, it, expect } from 'vitest';
import { HITLHandler } from '../../../src/governance/hitl.js';

describe('HITLHandler', () => {
  it('超时后应默认拒绝', async () => {
    const handler = new HITLHandler({ timeout: 0.01, defaultDeny: true });
    const result = await handler.requestConfirmation({
      action: 'rm -rf /',
      reason: '危险命令',
      severity: 'block',
    });
    expect(result.approved).toBe(false);
    expect(result.timeout).toBe(true);
  });

  it('默认拒绝策略下未响应应拒绝', async () => {
    const handler = new HITLHandler({ timeout: 0.01, defaultDeny: true });
    const result = await handler.requestConfirmation({
      action: '删除文件',
      reason: '保护目录',
      severity: 'warn',
    });
    expect(result.approved).toBe(false);
  });
});
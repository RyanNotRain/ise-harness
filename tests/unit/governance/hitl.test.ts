import { describe, it, expect } from 'vitest';
import { HITLHandler } from '../../../src/governance/hitl.js';

describe('HITLHandler', () => {
  it('超时后应默认拒绝', async () => {
    const handler = new HITLHandler({
      timeout: 0.01,
      defaultDeny: true,
      confirm: () => new Promise(() => undefined),
    });
    const result = await handler.requestConfirmation({
      action: 'rm -rf /',
      reason: '危险命令',
      severity: 'block',
    });
    expect(result.approved).toBe(false);
    expect(result.timeout).toBe(true);
  });

  it('用户明确拒绝时应拒绝', async () => {
    const handler = new HITLHandler({ timeout: 1, defaultDeny: true, confirm: async () => false });
    const result = await handler.requestConfirmation({
      action: '删除文件',
      reason: '保护目录',
      severity: 'warn',
    });
    expect(result.approved).toBe(false);
    expect(result.timeout).toBe(false);
  });

  it('用户明确批准时应批准', async () => {
    const handler = new HITLHandler({ timeout: 1, defaultDeny: true, confirm: async () => true });
    const result = await handler.requestConfirmation({
      action: '删除文件',
      reason: '安全目录',
      severity: 'warn',
    });
    expect(result.approved).toBe(true);
    expect(result.timeout).toBe(false);
  });
});

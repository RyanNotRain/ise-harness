import { describe, it, expect } from 'vitest';
import { DangerousCommandGuard } from '../../../src/governance/dangerous-command.js';

describe('DangerousCommandGuard', () => {
  const guard = new DangerousCommandGuard();

  it('应拦截 rm -rf /', () => {
    const result = guard.check({ command: 'rm -rf /' });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it('应拦截 dd 命令', () => {
    const result = guard.check({ command: 'dd if=/dev/zero of=/dev/sda' });
    expect(result.allowed).toBe(false);
  });

  it('应拦截 mkfs 命令', () => {
    const result = guard.check({ command: 'mkfs.ext4 /dev/sda1' });
    expect(result.allowed).toBe(false);
  });

  it('应放行安全命令', () => {
    const result = guard.check({ command: 'ls -la' });
    expect(result.allowed).toBe(true);
  });

  it('应放行 git 命令', () => {
    const result = guard.check({ command: 'git status' });
    expect(result.allowed).toBe(true);
  });

  it('应拦截 shutdown 命令', () => {
    const result = guard.check({ command: 'shutdown now' });
    expect(result.allowed).toBe(false);
  });
});
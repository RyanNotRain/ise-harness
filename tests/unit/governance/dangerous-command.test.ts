import { describe, it, expect } from 'vitest';
import { DangerousCommandGuard } from '../../../src/governance/dangerous-command.js';
import { FileDeletionGuard } from '../../../src/governance/file-deletion.js';

describe('DangerousCommandGuard', () => {
  const guard = new DangerousCommandGuard();

  it('应拦截 rm -rf /', () => {
    const result = guard.check({ command: 'rm -rf /', action: 'rm -rf /', toolName: 'bash' });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it('应拦截 dd 命令', () => {
    const result = guard.check({ command: 'dd if=/dev/zero of=/dev/sda', action: 'dd', toolName: 'bash' });
    expect(result.allowed).toBe(false);
  });

  it('应拦截 mkfs 命令', () => {
    const result = guard.check({ command: 'mkfs.ext4 /dev/sda1', action: 'mkfs', toolName: 'bash' });
    expect(result.allowed).toBe(false);
  });

  it('应放行安全命令', () => {
    const result = guard.check({ command: 'ls -la', action: 'ls -la', toolName: 'bash' });
    expect(result.allowed).toBe(true);
  });

  it('应放行 git 命令', () => {
    const result = guard.check({ command: 'git status', action: 'git status', toolName: 'bash' });
    expect(result.allowed).toBe(true);
  });

  it('应拦截 shutdown 命令', () => {
    const result = guard.check({ command: 'shutdown now', action: 'shutdown now', toolName: 'bash' });
    expect(result.allowed).toBe(false);
  });

  it.each(['sudo rm -rf /', 'cd /tmp && rm -rf /', ' rm -rf /', 'rm -fr /'])(
    '应拦截常见绕过写法：%s',
    (command) => {
      expect(guard.check({ command, action: command, toolName: 'bash' }).allowed).toBe(false);
    }
  );
});

describe('FileDeletionGuard', () => {
  const guard = new FileDeletionGuard();

  it('应拦截删除受保护目录', () => {
    const result = guard.check({ command: 'rm -rf /etc/config', action: 'delete /etc/config' });
    expect(result.allowed).toBe(false);
  });

  it('应拦截管道或链式命令中的受保护目录', () => {
    const result = guard.check({
      command: 'echo start && rm /etc/config && echo done',
      action: 'bash',
      toolName: 'bash',
    });
    expect(result.allowed).toBe(false);
  });

  it('应放行删除非保护目录', () => {
    const result = guard.check({ command: 'rm myfile.txt', action: 'delete myfile.txt' });
    expect(result.allowed).toBe(true);
  });

  it('非删除操作应放行', () => {
    const result = guard.check({ command: 'ls -la', action: 'ls -la' });
    expect(result.allowed).toBe(true);
  });
});

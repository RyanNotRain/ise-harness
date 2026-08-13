import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('README 提交契约', () => {
  it('应给出可从干净源码运行 WebUI 的完整前置步骤', async () => {
    const readme = await readFile('README.md', 'utf-8');
    const sourceWebSection = readme.match(/从源码运行 Node WebUI[\s\S]*?```bash([\s\S]*?)```/i)?.[1] ?? '';

    expect(sourceWebSection).toContain('npm ci');
    expect(sourceWebSection).toContain('npm run build');
    expect(sourceWebSection).toContain('npm run web');
    expect(sourceWebSection.indexOf('npm run build')).toBeLessThan(sourceWebSection.indexOf('npm run web'));
  });

  it('应准确区分文件工具与 Bash 的工作区边界', async () => {
    const readme = await readFile('README.md', 'utf-8');

    expect(readme).toMatch(/文件工具[^\n]*拒绝[^\n]*workspaceRoot/);
    expect(readme).toMatch(/Bash[^\n]*(cwd|工作目录)[^\n]*不[^\n]*(沙箱|边界)/);
  });

  it('应说明实际验证的平台、架构和 Windows 限制', async () => {
    const readme = await readFile('README.md', 'utf-8');

    expect(readme).toContain('Ubuntu x64');
    expect(readme).toContain('macOS arm64');
    expect(readme).toContain('Windows');
  });

  it('应区分声明式配置与只承载秘密或进程参数的环境变量', async () => {
    const readme = await readFile('README.md', 'utf-8');

    expect(readme).toContain('环境变量不合并进声明式配置对象');
    expect(readme).toContain('ISE_WEB_ACCESS_TOKEN');
    expect(readme).toContain('PORT');
  });

  it('应链接最新 Pages 部署并完整列出直接依赖许可证', async () => {
    const readme = await readFile('README.md', 'utf-8');

    expect(readme).toContain('actions/runs/31595587659');
    expect(readme).toContain('TypeScript`：Apache-2.0');
    expect(readme).toContain('@types/node`：MIT');
  });

  it('应链接真实的 Task 1–20 回溯矩阵而非宣称补造历史', async () => {
    const readme = await readFile('README.md', 'utf-8');
    const traceability = await readFile('TASK_TRACEABILITY.md', 'utf-8');

    expect(readme).toContain('TASK_TRACEABILITY.md');
    expect(traceability).toContain('事后回溯');
    expect(traceability).toContain('不能补成当时已存在的 worktree 或 PR');
    for (let task = 1; task <= 20; task++) {
      expect(traceability).toContain(`| ${task} |`);
    }
  });
});

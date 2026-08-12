import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('GitHub Pages MockLLM demo', () => {
  it('应明确安全边界并包含三项确定性机制', async () => {
    const html = await readFile('web-demo/index.html', 'utf-8');
    const script = await readFile('web-demo/app.js', 'utf-8');

    expect(html).toContain('不接收 API key');
    expect(html).toContain('确定性 MockLLM');
    expect(script).toContain('guardrail_blocked');
    expect(script).toContain('TestResultValidator');
    expect(script).toContain('localStorage');
  });

  it('不应加载第三方脚本或提供秘密输入框', async () => {
    const html = await readFile('web-demo/index.html', 'utf-8');

    expect(html).not.toMatch(/<script[^>]+https?:\/\//i);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('type="password"');
  });
});

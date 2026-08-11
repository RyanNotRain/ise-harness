import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/config/loader.js';

describe('ConfigLoader', () => {
  it('未找到配置文件时应返回默认配置', async () => {
    const config = await loadConfig(['/nonexistent/path/config.json']);
    expect(config.model.provider).toBe('openai');
    expect(config.memory.type).toBe('sqlite');
  });

  it('应合并覆盖默认值', async () => {
    const config = await loadConfig([], { model: { model: 'gpt-4' } });
    expect(config.model.model).toBe('gpt-4');
    expect(config.model.provider).toBe('openai');
  });

  it('不得把环境变量中的 API key 复制进可序列化配置', async () => {
    process.env.ISE_API_KEY = 'test-key-123';
    const config = await loadConfig([], {});
    expect('apiKey' in config.model).toBe(false);
    delete process.env.ISE_API_KEY;
  });
});

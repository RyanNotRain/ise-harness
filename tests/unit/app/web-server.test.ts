import { describe, expect, it } from 'vitest';
import { startWebServer } from '../../../src/app/web-server.js';
import { defaultConfig } from '../../../src/config/defaults.js';

describe('WebUI server', () => {
  it('未配置访问令牌时应拒绝启动真实后端', async () => {
    const outcome = await startWebServer({
      config: structuredClone(defaultConfig),
      apiKey: 'server-api-key',
      port: 0,
    }).then(
      (server) => ({ server, error: undefined }),
      (error: Error) => ({ server: undefined, error }),
    );

    try {
      expect(outcome.error?.message).toContain('ISE_WEB_ACCESS_TOKEN');
    } finally {
      await outcome.server?.close();
    }
  });

  it('应提供页面和健康检查', async () => {
    const server = await startWebServer({
      config: structuredClone(defaultConfig),
      apiKey: 'not-used-by-health-check',
      port: 0,
      accessToken: 'test-access-token',
    });
    try {
      const health = await fetch(`http://127.0.0.1:${server.port}/health`);
      expect(await health.json()).toEqual({ ok: true });
      const page = await fetch(`http://127.0.0.1:${server.port}/`);
      expect(await page.text()).toContain('ise-harness WebUI');
      const unauthorized = await fetch(`http://127.0.0.1:${server.port}/api/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      });
      expect(unauthorized.status).toBe(401);
    } finally {
      await server.close();
    }
  });
});

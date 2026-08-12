import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { HarnessConfig } from '../config/types.js';
import { createRuntime } from './factory.js';

export interface WebServerOptions {
  config: HarnessConfig;
  apiKey: string;
  port?: number;
  accessToken?: string;
}

const PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>ise-harness</title><style>
body{font:16px system-ui;max-width:920px;margin:40px auto;padding:0 20px;background:#f5f7fb;color:#172033}
main{background:white;padding:28px;border-radius:16px;box-shadow:0 8px 30px #17203318}
textarea{box-sizing:border-box;width:100%;min-height:130px;padding:12px}button{margin-top:12px;padding:10px 18px}
pre{white-space:pre-wrap;background:#101827;color:#e7edf8;padding:16px;border-radius:10px;min-height:120px}
</style></head><body><main><h1>ise-harness WebUI</h1>
<p>所有工具受工作区边界与治理护栏约束；Web 模式下危险动作默认拒绝。</p>
<input id="token" type="password" placeholder="WebUI 访问令牌（必填）"><textarea id="prompt" placeholder="输入编码任务"></textarea><button id="run">运行</button><pre id="result">等待任务…</pre>
<script>document.querySelector('#run').onclick=async()=>{const result=document.querySelector('#result');result.textContent='运行中…';try{const token=document.querySelector('#token').value;const response=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({prompt:document.querySelector('#prompt').value})});const data=await response.json();result.textContent=data.error||data.output||JSON.stringify(data,null,2)}catch(error){result.textContent=String(error)}};</script>
</main></body></html>`;

export function startWebServer(options: WebServerOptions): Promise<{ port: number; close(): Promise<void> }> {
  if (!options.accessToken?.trim()) {
    return Promise.reject(new Error('启动 WebUI 前必须配置 ISE_WEB_ACCESS_TOKEN'));
  }

  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/') return send(response, 200, 'text/html; charset=utf-8', PAGE);
      if (request.method === 'GET' && request.url === '/health') return sendJson(response, 200, { ok: true });
      if (request.method === 'POST' && request.url === '/api/run') {
        if (request.headers.authorization !== `Bearer ${options.accessToken}`) {
          return sendJson(response, 401, { error: '访问令牌无效' });
        }
        const body = await readJson(request);
        if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
          return sendJson(response, 400, { error: 'prompt 不能为空' });
        }
        const runtime = await createRuntime(options.config, {
          apiKey: options.apiKey,
          sessionId: typeof body.sessionId === 'string' ? body.sessionId : randomUUID(),
          interactive: false,
        });
        try {
          const result = await runtime.agent.run(body.prompt);
          const output = [...result.messages].reverse().find((message) => message.role === 'assistant')?.content ?? '';
          return sendJson(response, 200, { output, haltReason: result.haltReason, turnCount: result.turnCount });
        } finally {
          await runtime.close();
        }
      }
      return sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      return sendJson(response, 500, { error: (error as Error).message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? options.config.web.port, '0.0.0.0', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.config.web.port;
      resolve({
        port,
        close: () => new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done())),
      });
    });
  });
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf-8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) request.destroy(new Error('请求体过大'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('无效 JSON')); }
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  return send(response, status, 'application/json; charset=utf-8', JSON.stringify(value));
}

function send(response: ServerResponse, status: number, contentType: string, body: string) {
  response.writeHead(status, { 'content-type': contentType, 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

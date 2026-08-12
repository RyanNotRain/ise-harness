#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleKeyCommand, readStoredApiKey } from '../credential/cli.js';
import { loadConfig } from '../config/loader.js';
import { defaultConfig } from '../config/defaults.js';
import { createRuntime } from '../app/factory.js';
import { startWebServer } from '../app/web-server.js';
import { CodeIndexMemory, HashingEmbedder } from '../memory/code-index.js';

export async function main(args = process.argv.slice(2)): Promise<void> {
  const command = args[0];

  switch (command) {
    case 'key':
      await loadConfig([]); // 仅加载本地 .env；秘密不会进入配置对象
      await handleKeyCommand(args.slice(1));
      return;
    case 'init':
      await initializeConfig();
      return;
    case 'run':
      await runAgent(args.slice(1).join(' '));
      return;
    case 'index':
      await indexWorkspace();
      return;
    case 'web':
      await runWeb(args.slice(1));
      return;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`未知命令: ${command}。使用 ise-harness --help 查看帮助。`);
  }
}

async function initializeConfig(): Promise<void> {
  const path = resolve('ise-harness.json');
  if (existsSync(path)) throw new Error(`配置文件已存在，不会覆盖: ${path}`);
  await writeFile(path, `${JSON.stringify(defaultConfig, null, 2)}\n`, 'utf-8');
  console.log(`已创建 ${path}`);
  console.log('下一步：运行 ise-harness key set 安全录入 API key。');
}

async function runAgent(prompt: string): Promise<void> {
  if (!prompt.trim()) throw new Error('用法: ise-harness run "你的任务"');
  const config = await loadConfig();
  const apiKey = await resolveApiKey();
  const runtime = await createRuntime(config, { apiKey, sessionId: 'cli', interactive: true });
  try {
    const result = await runtime.agent.run(prompt);
    const finalMessage = [...result.messages].reverse().find((message) => message.role === 'assistant');
    console.log(finalMessage?.content || `Agent 已停止：${result.haltReason}`);
  } finally {
    await runtime.close();
  }
}

async function indexWorkspace(): Promise<void> {
  const config = await loadConfig();
  if (!config.memory.codeIndex.enabled) {
    throw new Error('请先在 ise-harness.json 中启用 memory.codeIndex.enabled');
  }
  const workspaceRoot = resolve(config.workspaceRoot);
  const codeIndex = new CodeIndexMemory(
    `${resolve(workspaceRoot, config.memory.path)}.code-index`,
    { embedder: new HashingEmbedder() }
  );
  try {
    const count = await codeIndex.indexDirectory(workspaceRoot, {
      excludePatterns: config.memory.codeIndex.excludePatterns,
    });
    console.log(`代码索引完成：${count} 个文件。`);
  } finally {
    await codeIndex.close();
  }
}

async function runWeb(args: string[]): Promise<void> {
  const config = await loadConfig();
  const apiKey = await resolveApiKey();
  const portFlag = args.indexOf('--port');
  const port = portFlag >= 0
    ? Number(args[portFlag + 1])
    : Number(process.env.PORT ?? config.web.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('无效端口');
  const server = await startWebServer({
    config,
    apiKey,
    port,
    accessToken: process.env.ISE_WEB_ACCESS_TOKEN,
  });
  console.log(`ise-harness WebUI 已启动：http://localhost:${server.port}`);
}

async function resolveApiKey(): Promise<string> {
  const key = process.env.ISE_API_KEY
    ?? process.env.OPENAI_API_KEY
    ?? process.env.ANTHROPIC_API_KEY
    ?? await readStoredApiKey();
  if (!key) throw new Error('未配置 API key；请运行 ise-harness key set 或使用 .env 加载 ISE_API_KEY');
  return key;
}

function printHelp(): void {
  console.log(`ise-harness — Coding Agent Harness SDK

命令:
  init                          创建 ise-harness.json
  key <set|view|clear|update>   管理加密 API key
  run <prompt>                  运行 agent
  index                         建立代码库语义索引
  web [--port 3210]             启动 WebUI
  --help                        显示帮助`);
}

main().catch((error) => {
  console.error(`错误：${(error as Error).message}`);
  process.exitCode = 1;
});

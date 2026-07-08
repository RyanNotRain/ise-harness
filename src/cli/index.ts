#!/usr/bin/env node
import { handleKeyCommand } from '../credential/cli.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'key':
      await handleKeyCommand(args.slice(1));
      break;
    case 'init':
      console.log('正在初始化 ise-harness 项目...');
      break;
    case 'run':
      console.log('正在运行 agent...');
      break;
    case '--help':
    case '-h':
    default:
      console.log(`
ise-harness — Coding Agent Harness SDK

命令:
  key <set|view|clear|update>  管理 API key
  init                          初始化项目配置
  run <prompt>                  运行 agent
  --help                        显示帮助
      `);
  }
}

main().catch(console.error);
import * as readline from 'node:readline';
import { FileCredentialStore } from './keychain.js';
import type { CredentialStore } from './keychain.js';

function hiddenInput(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function handleKeyCommand(args: string[]): Promise<void> {
  const store: CredentialStore = new FileCredentialStore();
  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'set':
    case 'update': {
      const key = await hiddenInput('请输入 API key（输入将隐藏）: ');
      if (!key.trim()) {
        console.log('未提供 key。');
        return;
      }
      await store.set('api_key', key.trim());
      console.log('API key 已安全保存。');
      break;
    }
    case 'view':
    case 'status': {
      const exists = await store.exists('api_key');
      console.log(`API key: ${exists ? '已配置' : '未配置'}`);
      break;
    }
    case 'clear':
    case 'delete': {
      await store.clear('api_key');
      console.log('API key 已清除。');
      break;
    }
    default:
      console.log('用法: ise-harness key <set|view|clear|update>');
  }
}
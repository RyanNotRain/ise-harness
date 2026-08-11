import * as readline from 'node:readline';
import { FileCredentialStore } from './keychain.js';

export function hiddenInput(query: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    }));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = input.isRaw;
    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write('\n');
    };
    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      for (const character of text) {
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u0003') {
          cleanup();
          reject(new Error('用户取消输入'));
          return;
        }
        if (character === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    output.write(query);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function createPasswordProtectedStore(): Promise<FileCredentialStore> {
  const masterPassword = process.env.ISE_MASTER_PASSWORD
    ?? await hiddenInput('请输入凭据主密码（不会回显）: ');
  if (!masterPassword) throw new Error('主密码不能为空');
  return new FileCredentialStore({ masterPassword });
}

export async function handleKeyCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'set':
    case 'update': {
      const store = await createPasswordProtectedStore();
      const key = await hiddenInput('请输入 API key（不会回显）: ');
      if (!key.trim()) throw new Error('API key 不能为空');
      await store.set('api_key', key.trim());
      console.log('API key 已加密保存。');
      break;
    }
    case 'view':
    case 'status': {
      const store = new FileCredentialStore();
      console.log(`API key: ${await store.exists('api_key') ? '已配置' : '未配置'}`);
      break;
    }
    case 'clear':
    case 'delete': {
      const store = new FileCredentialStore();
      await store.clear('api_key');
      console.log('API key 已清除。');
      break;
    }
    default:
      console.log('用法: ise-harness key <set|view|clear|update>');
  }
}

export async function readStoredApiKey(): Promise<string | null> {
  const statusStore = new FileCredentialStore();
  if (!await statusStore.exists('api_key')) return null;
  return (await createPasswordProtectedStore()).get('api_key');
}

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { FileCredentialStore } from '../../../src/credential/keychain.js';
import { chmod, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('FileCredentialStore', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ise-credential-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function createStore(password = 'test-password') {
    return new FileCredentialStore({
      masterPassword: password,
      filePath: join(directory, 'credentials.enc.json'),
    });
  }

  it('应能加密存储和检索凭据', async () => {
    const store = createStore();
    await store.set('test-key', 'my-api-key');
    const retrieved = await store.get('test-key');
    expect(retrieved).toBe('my-api-key');
  });

  it('应能检查凭据是否存在', async () => {
    const store = createStore();
    expect(await store.exists('test-key')).toBe(false);
    await store.set('test-key', 'my-api-key');
    expect(await store.exists('test-key')).toBe(true);
  });

  it('应能清除凭据', async () => {
    const store = createStore();
    await store.set('test-key', 'my-api-key');
    await store.clear('test-key');
    expect(await store.exists('test-key')).toBe(false);
  });

  it('获取不存在的凭据应返回 null', async () => {
    const store = createStore();
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('新实例应能读取磁盘中的加密凭据', async () => {
    await createStore().set('test-key', 'persistent-secret');
    expect(await createStore().get('test-key')).toBe('persistent-secret');
  });

  it('错误主密码不得解密凭据', async () => {
    await createStore().set('test-key', 'persistent-secret');
    await expect(createStore('wrong-password').get('test-key')).rejects.toThrow('无法解密凭据');
  });

  it('应把已有凭据目录收紧为 0700，并将凭据文件保持为 0600', async () => {
    const credentialDirectory = join(directory, 'existing');
    const filePath = join(credentialDirectory, 'credentials.enc.json');
    await mkdir(credentialDirectory, { mode: 0o755 });
    await chmod(credentialDirectory, 0o755);

    const store = new FileCredentialStore({ masterPassword: 'test-password', filePath });
    await store.set('test-key', 'my-api-key');

    expect((await stat(credentialDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });
});

import { describe, it, expect } from 'vitest';
import { FileCredentialStore } from '../../../src/credential/keychain.js';

describe('FileCredentialStore', () => {
  it('应能加密存储和检索凭据', async () => {
    const store = new FileCredentialStore('test-password');
    await store.set('test-key', 'my-api-key');
    const retrieved = await store.get('test-key');
    expect(retrieved).toBe('my-api-key');
  });

  it('应能检查凭据是否存在', async () => {
    const store = new FileCredentialStore('test-password');
    expect(await store.exists('test-key')).toBe(false);
    await store.set('test-key', 'my-api-key');
    expect(await store.exists('test-key')).toBe(true);
  });

  it('应能清除凭据', async () => {
    const store = new FileCredentialStore('test-password');
    await store.set('test-key', 'my-api-key');
    await store.clear('test-key');
    expect(await store.exists('test-key')).toBe(false);
  });

  it('获取不存在的凭据应返回 null', async () => {
    const store = new FileCredentialStore('test-password');
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });
});
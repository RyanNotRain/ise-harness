import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;

export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  clear(key: string): Promise<void>;
}

export interface FileCredentialStoreOptions {
  masterPassword?: string;
  filePath?: string;
}

type EncryptedStore = Record<string, string>;

export class FileCredentialStore implements CredentialStore {
  readonly filePath: string;
  private masterPassword?: string;

  constructor(options: string | FileCredentialStoreOptions = {}) {
    const normalized = typeof options === 'string' ? { masterPassword: options } : options;
    this.masterPassword = normalized.masterPassword ?? process.env.ISE_MASTER_PASSWORD;
    this.filePath = normalized.filePath ?? join(homedir(), '.ise-harness', 'credentials.enc.json');
  }

  private requireMasterPassword(): string {
    if (!this.masterPassword) {
      throw new Error('缺少主密码；请设置 ISE_MASTER_PASSWORD 或通过安全输入提供主密码');
    }
    return this.masterPassword;
  }

  private encrypt(text: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(this.requireMasterPassword(), salt, KEY_LEN);
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(encoded: string): string {
    const [saltHex, ivHex, tagHex, encryptedHex] = encoded.split(':');
    if (!saltHex || !ivHex || !tagHex || !encryptedHex) throw new Error('凭据文件格式损坏');
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const key = scryptSync(this.requireMasterPassword(), salt, KEY_LEN);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
  }

  private async readStore(): Promise<EncryptedStore> {
    if (!existsSync(this.filePath)) return {};
    const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('凭据文件格式无效');
    }
    return parsed as EncryptedStore;
  }

  private async writeStore(store: EncryptedStore): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    await chmod(this.filePath, 0o600);
  }

  async get(key: string): Promise<string | null> {
    const encrypted = (await this.readStore())[key];
    if (!encrypted) return null;
    try {
      return this.decrypt(encrypted);
    } catch {
      throw new Error('无法解密凭据：主密码错误或凭据文件已损坏');
    }
  }

  async set(key: string, value: string): Promise<void> {
    const store = await this.readStore();
    store[key] = this.encrypt(value);
    await this.writeStore(store);
  }

  async exists(key: string): Promise<boolean> {
    return Object.hasOwn(await this.readStore(), key);
  }

  async clear(key: string): Promise<void> {
    const store = await this.readStore();
    delete store[key];
    await this.writeStore(store);
  }
}

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;

export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  clear(key: string): Promise<void>;
}

export class FileCredentialStore implements CredentialStore {
  private store: Map<string, string>;
  private masterPassword: string;

  constructor(masterPassword?: string) {
    this.store = new Map();
    this.masterPassword = masterPassword || process.env.ISE_MASTER_PASSWORD || 'default-dev-password';
  }

  private encrypt(text: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(this.masterPassword, salt, KEY_LEN);
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(encoded: string): string {
    const parts = encoded.split(':');
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const key = scryptSync(this.masterPassword, salt, KEY_LEN);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf-8');
  }

  async get(key: string): Promise<string | null> {
    const encrypted = this.store.get(key);
    if (!encrypted) return null;
    try {
      return this.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, this.encrypt(value));
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async clear(key: string): Promise<void> {
    this.store.delete(key);
  }
}
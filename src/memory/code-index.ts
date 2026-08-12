import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function initSqlJsOnce() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

export class HashingEmbedder implements Embedder {
  constructor(private dimensions = 384) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error('embedding dimensions 必须是正整数');
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const vector = new Float32Array(this.dimensions);
    for (const token of tokenize(text)) {
      const hash = createHash('sha256').update(token).digest();
      const bucket = hash.readUInt32BE(0) % this.dimensions;
      const sign = (hash[4] & 1) === 0 ? 1 : -1;
      vector[bucket] += sign;
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm > 0) vector.forEach((value, index) => { vector[index] = value / norm; });
    return vector;
  }
}

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
}

export interface CodeIndexResult {
  filePath: string;
  content: string;
  score: number;
}

export class CodeIndexMemory {
  private db: SqlJsDatabase | null = null;
  private embedder: Embedder;
  private initialized = false;
  private dbPath: string;
  private readonly inMemory: boolean;

  constructor(dbPath: string, options: { embedder: Embedder }) {
    this.dbPath = dbPath;
    this.inMemory = dbPath === ':memory:';
    this.embedder = options.embedder;
  }

  private async ensureInit(): Promise<SqlJsDatabase> {
    if (this.db && this.initialized) return this.db;
    const sql = await initSqlJsOnce();
    const existing = !this.inMemory && existsSync(this.dbPath)
      ? new Uint8Array(await readFile(this.dbPath))
      : undefined;
    this.db = existing ? new sql.Database(existing) : new sql.Database();
    this.db.run(`
      CREATE TABLE IF NOT EXISTS code_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(file_path)
      )
    `);
    this.initialized = true;
    return this.db;
  }

  async indexFile(filePath: string, content: string): Promise<void> {
    const db = await this.ensureInit();
    const hash = createHash('sha256').update(content).digest('hex');

    const stmt = db.prepare('SELECT file_hash FROM code_index WHERE file_path = ?');
    stmt.bind([filePath]);
    let existingHash = '';
    if (stmt.step()) {
      existingHash = (stmt.getAsObject() as { file_hash: string }).file_hash;
    }
    stmt.free();

    if (existingHash === hash) return;

    const embedding = await this.embedder.embed(content);
    const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    db.run('INSERT OR REPLACE INTO code_index (file_path, file_hash, content, embedding) VALUES (?, ?, ?, ?)', [filePath, hash, content, Array.from(buf)]);
    await this.persist(db);
  }

  async indexDirectory(
    rootPath: string,
    options: { excludePatterns?: string[]; extensions?: string[]; maxFileBytes?: number } = {}
  ): Promise<number> {
    const excludePatterns = options.excludePatterns ?? ['node_modules', 'dist', '.git'];
    const extensions = options.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
    const maxFileBytes = options.maxFileBytes ?? 512 * 1024;
    let count = 0;

    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const fullPath = join(directory, entry.name);
        const relativePath = relative(rootPath, fullPath);
        if (excludePatterns.some((pattern) => relativePath.split(sep).includes(pattern))) continue;
        if (entry.isDirectory()) {
          await visit(fullPath);
          continue;
        }
        if (!entry.isFile() || !extensions.includes(extname(entry.name))) continue;
        if ((await stat(fullPath)).size > maxFileBytes) continue;
        await this.indexFile(relativePath, await readFile(fullPath, 'utf-8'));
        count++;
      }
    };

    await visit(rootPath);
    return count;
  }

  async query(query: string, limit: number): Promise<CodeIndexResult[]> {
    const db = await this.ensureInit();

    const rows: Array<{ file_path: string; content: string; embedding: number[] }> = [];
    const stmt = db.prepare('SELECT file_path, content, embedding FROM code_index');
    while (stmt.step()) {
      const row = stmt.getAsObject() as { file_path: string; content: string; embedding: Int8Array };
      const emb = Array.from(row.embedding);
      rows.push({ file_path: row.file_path, content: row.content, embedding: emb });
    }
    stmt.free();

    if (rows.length === 0) return [];
    const queryEmbedding = await this.embedder.embed(query);

    const scored = rows.map(row => {
      const storedVec = new Float32Array(new Uint8Array(row.embedding).buffer);
      const score = this.cosineSimilarity(queryEmbedding, storedVec);
      return { filePath: row.file_path, content: row.content, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.persist(this.db);
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  private async persist(db: SqlJsDatabase): Promise<void> {
    if (this.inMemory) return;
    await mkdir(dirname(this.dbPath), { recursive: true });
    const temporaryPath = `${this.dbPath}.tmp`;
    await writeFile(temporaryPath, db.export(), { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, this.dbPath);
    await chmod(this.dbPath, 0o600);
  }
}

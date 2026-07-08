import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { createHash } from 'node:crypto';

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

export interface CodeIndexResult {
  filePath: string;
  content: string;
  score: number;
}

export class CodeIndexMemory {
  private db: SqlJsDatabase | null = null;
  private embedder: Embedder;
  private initialized = false;

  constructor(dbPath: string, options: { embedder: Embedder }) {
    this.embedder = options.embedder;
  }

  private async ensureInit(): Promise<SqlJsDatabase> {
    if (this.db && this.initialized) return this.db;
    const sql = await initSqlJsOnce();
    this.db = new sql.Database();
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
    const buf = Buffer.from(embedding.buffer);
    db.run('INSERT OR REPLACE INTO code_index (file_path, file_hash, content, embedding) VALUES (?, ?, ?, ?)', [filePath, hash, content, Array.from(buf)]);
  }

  async query(query: string, limit: number): Promise<CodeIndexResult[]> {
    const db = await this.ensureInit();
    const queryEmbedding = await this.embedder.embed(query);

    const rows: Array<{ file_path: string; content: string; embedding: number[] }> = [];
    const stmt = db.prepare('SELECT file_path, content, embedding FROM code_index');
    while (stmt.step()) {
      const row = stmt.getAsObject() as { file_path: string; content: string; embedding: Int8Array };
      const emb = Array.from(row.embedding);
      rows.push({ file_path: row.file_path, content: row.content, embedding: emb });
    }
    stmt.free();

    if (rows.length === 0) return [];

    const scored = rows.map(row => {
      const storedVec = new Float32Array(row.embedding);
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
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
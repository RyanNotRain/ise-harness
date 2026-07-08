import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import type { Memory, MemoryEntry, Decision } from './types.js';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function initSqlJsOnce() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export class SQLiteMemory implements Memory {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private async ensureInit(): Promise<SqlJsDatabase> {
    if (this.db && this.initialized) return this.db;
    const sql = await initSqlJsOnce();
    this.db = new sql.Database();
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        summary TEXT DEFAULT ''
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        context TEXT NOT NULL,
        decision TEXT NOT NULL,
        rationale TEXT NOT NULL,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_entries_session ON entries(session_id, id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id, id)');
    this.initialized = true;
    return this.db;
  }

  async store(sessionId: string, entry: MemoryEntry): Promise<void> {
    const db = await this.ensureInit();
    db.run('INSERT OR IGNORE INTO sessions (id) VALUES (?)', [sessionId]);
    db.run('INSERT INTO entries (session_id, role, content) VALUES (?, ?, ?)', [sessionId, entry.role, entry.content]);
    db.run("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", [sessionId]);
  }

  async retrieve(sessionId: string, limit?: number): Promise<MemoryEntry[]> {
    const db = await this.ensureInit();
    const results: MemoryEntry[] = [];
    const sql = limit
      ? 'SELECT role, content FROM entries WHERE session_id = ? ORDER BY id DESC LIMIT ?'
      : 'SELECT role, content FROM entries WHERE session_id = ? ORDER BY id DESC';
    const params = limit ? [sessionId, limit] : [sessionId];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({ role: row.role as MemoryEntry['role'], content: row.content as string });
    }
    stmt.free();
    return results;
  }

  async clear(sessionId: string): Promise<void> {
    const db = await this.ensureInit();
    db.run('DELETE FROM entries WHERE session_id = ?', [sessionId]);
    db.run('DELETE FROM decisions WHERE session_id = ?', [sessionId]);
    db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  async summarize(sessionId: string): Promise<string> {
    const db = await this.ensureInit();
    const stmt = db.prepare('SELECT summary FROM sessions WHERE id = ?');
    stmt.bind([sessionId]);
    let summary = '';
    if (stmt.step()) {
      summary = (stmt.getAsObject() as { summary: string }).summary || '';
    }
    stmt.free();
    return summary;
  }

  async storeDecision(sessionId: string, decision: Decision): Promise<void> {
    const db = await this.ensureInit();
    db.run('INSERT OR IGNORE INTO sessions (id) VALUES (?)', [sessionId]);
    db.run('INSERT INTO decisions (session_id, context, decision, rationale) VALUES (?, ?, ?, ?)', [sessionId, decision.context, decision.decision, decision.rationale]);
  }

  async retrieveDecisions(sessionId: string, limit?: number): Promise<Decision[]> {
    const db = await this.ensureInit();
    const results: Decision[] = [];
    const sql = limit
      ? 'SELECT context, decision, rationale FROM decisions WHERE session_id = ? ORDER BY id DESC LIMIT ?'
      : 'SELECT context, decision, rationale FROM decisions WHERE session_id = ? ORDER BY id DESC';
    const params = limit ? [sessionId, limit] : [sessionId];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject() as { context: string; decision: string; rationale: string };
      results.push(row);
    }
    stmt.free();
    return results;
  }

  async updateSummary(sessionId: string, summary: string): Promise<void> {
    const db = await this.ensureInit();
    db.run('INSERT OR IGNORE INTO sessions (id) VALUES (?)', [sessionId]);
    db.run("UPDATE sessions SET summary = ?, updated_at = datetime('now') WHERE id = ?", [summary, sessionId]);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
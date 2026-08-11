export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Decision {
  context: string;
  decision: string;
  rationale: string;
}

export interface Memory {
  store(sessionId: string, entry: MemoryEntry): Promise<void>;
  retrieve(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  clear(sessionId: string): Promise<void>;
  summarize(sessionId: string): Promise<string>;
  storeDecision(sessionId: string, decision: Decision): Promise<void>;
  retrieveDecisions(sessionId: string, limit?: number): Promise<Decision[]>;
  updateSummary(sessionId: string, summary: string): Promise<void>;
  close(): Promise<void>;
}

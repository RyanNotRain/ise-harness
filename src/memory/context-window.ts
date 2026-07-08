import type { MemoryEntry } from './types.js';

export interface ContextWindowOptions {
  maxTokens: number;
  compressionThreshold: number;
  keepRecentTurns?: number;
}

export interface AddAndCheckResult {
  compressed: boolean;
  messages: MemoryEntry[];
}

export class ContextWindowMemory {
  private options: Required<ContextWindowOptions>;

  constructor(options: ContextWindowOptions) {
    this.options = {
      keepRecentTurns: 5,
      ...options,
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async addAndCheck(
    messages: MemoryEntry[],
    summarizer: (messages: MemoryEntry[]) => Promise<string>
  ): Promise<AddAndCheckResult> {
    const totalTokens = messages.reduce(
      (sum, m) => sum + this.estimateTokens(m.content),
      0
    );
    const threshold = this.options.maxTokens * this.options.compressionThreshold;

    if (totalTokens <= threshold) {
      return { compressed: false, messages };
    }

    const keep = this.options.keepRecentTurns;
    const compressible = messages.slice(0, -keep);
    const recent = messages.slice(-keep);

    if (compressible.length === 0) {
      return { compressed: false, messages };
    }

    const summary = await summarizer(compressible);
    const result: MemoryEntry[] = [
      { role: 'system', content: `[历史对话摘要: ${summary}]` },
      ...recent,
    ];

    return { compressed: true, messages: result };
  }
}
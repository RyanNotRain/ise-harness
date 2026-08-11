import type { HarnessConfig } from './types.js';

export const defaultConfig: HarnessConfig = {
  workspaceRoot: '.',
  model: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    temperature: 0.1,
  },
  memory: {
    type: 'sqlite',
    path: './ise-memory.db',
    codeIndex: {
      enabled: false,
      excludePatterns: ['node_modules', 'dist', '.git'],
    },
    contextWindow: {
      maxTokens: 128000,
      compressionThreshold: 0.85,
    },
  },
  tools: ['read_file', 'write_file', 'bash', 'grep'],
  guardrails: {
    dangerousCommands: true,
    fileDeletion: true,
    hitlTimeout: 30,
  },
  feedback: {
    validators: ['test_result'],
    maxRetries: 3,
  },
  web: { port: 3210 },
};

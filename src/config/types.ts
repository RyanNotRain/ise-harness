export interface HarnessConfig {
  workspaceRoot: string;
  model: {
    provider: 'openai' | 'anthropic' | 'mock';
    model: string;
    maxTokens: number;
    temperature: number;
    baseURL?: string;
  };
  memory: {
    type: 'sqlite';
    path: string;
    codeIndex: { enabled: boolean; excludePatterns: string[] };
    contextWindow: { maxTokens: number; compressionThreshold: number };
  };
  tools: string[];
  guardrails: {
    dangerousCommands: boolean;
    fileDeletion: boolean;
    hitlTimeout: number;
  };
  feedback: {
    validators: string[];
    maxRetries: number;
  };
  web: { port: number };
}

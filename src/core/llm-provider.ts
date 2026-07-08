import type { ChatMessage, LLMResponse } from './types.js';

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: Record<string, unknown>): Promise<LLMResponse>;
}
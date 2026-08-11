import type { ChatMessage, LLMChatOptions, LLMResponse } from './types.js';

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: LLMChatOptions): Promise<LLMResponse>;
}

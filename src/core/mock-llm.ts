import type { ChatMessage, LLMResponse } from './types.js';
import type { LLMProvider } from './llm-provider.js';

export class MockLLMProvider implements LLMProvider {
  private responses: LLMResponse[];
  private index = 0;
  callHistory: ChatMessage[][] = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(messages: ChatMessage[], _options?: Record<string, unknown>): Promise<LLMResponse> {
    this.callHistory.push([...messages]);
    if (this.index >= this.responses.length) {
      throw new Error('MockLLMProvider: 没有更多响应');
    }
    return this.responses[this.index++];
  }
}
import type { ChatMessage, LLMChatOptions, LLMResponse } from './types.js';
import type { LLMProvider } from './llm-provider.js';

export class MockLLMProvider implements LLMProvider {
  private responses: LLMResponse[];
  private index = 0;
  callHistory: ChatMessage[][] = [];
  optionHistory: LLMChatOptions[] = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(messages: ChatMessage[], options: LLMChatOptions = {}): Promise<LLMResponse> {
    this.callHistory.push([...messages]);
    this.optionHistory.push(options);
    if (this.index >= this.responses.length) {
      throw new Error('MockLLMProvider: 没有更多响应');
    }
    return this.responses[this.index++];
  }
}

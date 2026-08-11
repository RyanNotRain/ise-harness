export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  stopReason?: 'stop' | 'tool_calls' | 'max_tokens';
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMChatOptions {
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

export interface Action {
  type: 'tool_call' | 'text' | 'halt';
  toolCall?: ToolCall;
  content?: string;
}

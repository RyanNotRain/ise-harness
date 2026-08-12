import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../../src/core/openai-provider.js';
import { AnthropicProvider } from '../../../src/core/anthropic-provider.js';

afterEach(() => vi.unstubAllGlobals());

describe('真实 LLM provider 协议适配', () => {
  it('OpenAI 请求应包含工具定义和 tool_call_id', async () => {
    let payload: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      payload = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: '完成' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }), { status: 200 });
    }));
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    await provider.chat([
      { role: 'assistant', content: '', toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.ts' } }] },
      { role: 'tool', content: 'ok', toolCallId: 'call-1' },
    ], { tools: [{ name: 'read_file', description: '读取', parameters: { type: 'object' } }] });
    expect((payload.tools as Array<{ function: { name: string } }>)[0].function.name).toBe('read_file');
    expect((payload.messages as Array<{ tool_call_id?: string }>)[1].tool_call_id).toBe('call-1');
  });

  it('Anthropic 响应中的 tool_use 应解析为 ToolCall', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'tool_use', id: 'tool-1', name: 'grep', input: { pattern: 'TODO' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 2, output_tokens: 3 },
    }), { status: 200 })));
    const provider = new AnthropicProvider({ apiKey: 'test-key' });
    const response = await provider.chat([{ role: 'user', content: '查找 TODO' }], {
      tools: [{ name: 'grep', description: '搜索', parameters: { type: 'object' } }],
    });
    expect(response.stopReason).toBe('tool_calls');
    expect(response.toolCalls).toEqual([{ id: 'tool-1', name: 'grep', arguments: { pattern: 'TODO' } }]);
  });

  it('Anthropic 请求应保留全部 system 上下文与采样配置', async () => {
    let payload: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      payload = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '完成' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 2, output_tokens: 1 },
      }), { status: 200 });
    }));
    const provider = new AnthropicProvider({ apiKey: 'test-key' });

    await provider.chat([
      { role: 'system', content: '系统规则' },
      { role: 'system', content: '按需检索到的代码知识' },
      { role: 'user', content: '检查项目' },
    ], { maxTokens: 1234, temperature: 0.2 });

    expect(payload.system).toBe('系统规则\n\n按需检索到的代码知识');
    expect(payload.max_tokens).toBe(1234);
    expect(payload.temperature).toBe(0.2);
  });
});

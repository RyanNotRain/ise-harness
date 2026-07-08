import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { ReadFile } from '../../../src/tools/read-file.js';

describe('ToolRegistry', () => {
  it('应能注册并查找工具', () => {
    const registry = new ToolRegistry();
    const readFile = new ReadFile();
    registry.register(readFile);
    expect(registry.find('read_file')).toBeDefined();
    expect(registry.find('nonexistent')).toBeUndefined();
  });

  it('应列出所有工具定义', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    const defs = registry.listDefinitions();
    expect(defs.length).toBe(1);
    expect(defs[0].name).toBe('read_file');
    expect(defs[0].description).toBeDefined();
    expect(defs[0].parameters).toBeDefined();
  });

  it('重复注册应抛出错误', () => {
    const registry = new ToolRegistry();
    registry.register(new ReadFile());
    expect(() => registry.register(new ReadFile())).toThrow('已经注册');
  });
});
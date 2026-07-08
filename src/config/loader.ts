import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultConfig } from './defaults.js';
import type { HarnessConfig } from './types.js';

export async function loadConfig(
  searchPaths?: string[],
  overrides?: Partial<HarnessConfig>
): Promise<HarnessConfig> {
  let config: HarnessConfig = JSON.parse(JSON.stringify(defaultConfig));

  if (searchPaths) {
    for (const searchPath of searchPaths) {
      const resolved = resolve(searchPath);
      if (existsSync(resolved)) {
        try {
          const content = await readFile(resolved, 'utf-8');
          const parsed = JSON.parse(content);
          config = deepMerge(config, parsed) as HarnessConfig;
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
  }

  if (overrides) {
    config = deepMerge(config, overrides) as HarnessConfig;
  }

  if (!config.model.apiKey) {
    if (process.env.ISE_API_KEY) {
      config.model.apiKey = process.env.ISE_API_KEY;
    } else if (config.model.provider === 'openai' && process.env.OPENAI_API_KEY) {
      config.model.apiKey = process.env.OPENAI_API_KEY;
    } else if (config.model.provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      config.model.apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }

  return config;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
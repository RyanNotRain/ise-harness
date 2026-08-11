import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultConfig } from './defaults.js';
import type { HarnessConfig } from './types.js';

export async function loadConfig(
  searchPaths?: string[],
  overrides?: Partial<HarnessConfig>
): Promise<HarnessConfig> {
  const environmentFile = resolve('.env');
  const loadEnvironmentFile = (process as NodeJS.Process & {
    loadEnvFile?: (path?: string) => void;
  }).loadEnvFile;
  if (existsSync(environmentFile) && loadEnvironmentFile) {
    loadEnvironmentFile(environmentFile);
  }
  let config = structuredClone(defaultConfig);

  const paths = searchPaths ?? ['ise-harness.json'];
  if (paths) {
    for (const searchPath of paths) {
      const resolved = resolve(searchPath);
      if (existsSync(resolved)) {
        try {
          const content = await readFile(resolved, 'utf-8');
          const parsed: unknown = JSON.parse(content);
          config = deepMerge(config, parsed);
        } catch (error) {
          throw new Error(`无法加载配置文件 ${resolved}: ${(error as Error).message}`);
        }
      }
    }
  }

  if (overrides) {
    config = deepMerge(config, overrides);
  }

  return config;
}

function deepMerge<T>(target: T, source: unknown): T {
  if (!isRecord(target) || !isRecord(source)) return source as T;
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key] ?? {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

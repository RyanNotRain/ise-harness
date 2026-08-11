import { relative, resolve } from 'node:path';

export function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const root = resolve(workspaceRoot);
  const target = resolve(root, requestedPath);
  const relation = relative(root, target);
  if (relation.startsWith('..') || relation === '..') {
    throw new Error(`路径越出工作区边界: ${requestedPath}`);
  }
  return target;
}

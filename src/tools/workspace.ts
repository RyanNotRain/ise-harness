import { existsSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

export function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const root = resolve(workspaceRoot);
  const target = resolve(root, requestedPath);
  assertInside(root, target, requestedPath);

  const realRoot = existsSync(root) ? realpathSync(root) : root;
  let existingAncestor = target;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const realAncestor = existsSync(existingAncestor)
    ? realpathSync(existingAncestor)
    : existingAncestor;
  assertInside(realRoot, realAncestor, requestedPath);
  return target;
}

function assertInside(root: string, target: string, requestedPath: string): void {
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`路径越出工作区边界: ${requestedPath}`);
  }
}

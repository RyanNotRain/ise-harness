# Task 21：SQLiteMemory 并发持久化可靠性

## 背景

这是 2026-08-12 提交前补充验证任务，属于 PLAN Task 16（持久化记忆）的边界加固。任务必须在独立 worktree `codex/task21-memory-concurrency` 中完成，不得改写 2026-07-08 的原始历史。

## 已有 RED 证据

- RED commit：`6699af7`
- 失败测试：`tests/unit/memory/sqlite-memory.test.ts`
- 命令：`./node_modules/.bin/vitest run tests/unit/memory/sqlite-memory.test.ts --reporter=verbose`
- 预期失败：25 个并发 `store()` 共用 `memory.db.tmp`，触发 rename `ENOENT`。

## 要求

1. 不修改或削弱新增失败测试。
2. 只修改 `src/memory/sqlite-memory.ts`，除非编译所必需。
3. 对同一 `SQLiteMemory` 实例的磁盘变更进行排队，保证并发调用不会争用同一临时文件，且某一次失败不会永久毒化后续队列。
4. `store`、`clear`、`storeDecision`、`updateSummary` 都必须经过同一写入队列。
5. `retrieve`、`retrieveDecisions`、`summarize` 在返回前应等待已排队写入完成。
6. `close` 必须等待此前写入完成后再持久化和关闭。
7. 保持 `:memory:`、单条 100KB、单会话 10000 条和现有 API 行为不变。
8. 遵循 RED → GREEN → REFACTOR；只做使测试通过所需的最小实现。

## 验证

```bash
./node_modules/.bin/vitest run tests/unit/memory/sqlite-memory.test.ts --reporter=verbose
npm run lint
npm test
```

## 报告要求

把完整报告写入 `evidence/process-remediation/task-21-implementer-report.md`，包括：

- 修改摘要；
- 根因；
- 运行过的命令和准确结果；
- 自查发现；
- 是否存在未解决问题。

不要修改 `SPEC_PROCESS.md`、`AGENT_LOG.md` 或 `REFLECTION.md`。

# Task 21 Implementer Report

## 修改摘要

- 仅修改 `src/memory/sqlite-memory.ts` 的生产实现。
- 为每个 `SQLiteMemory` 实例增加一条 Promise 写入队列。
- `store`、`clear`、`storeDecision`、`updateSummary` 将数据库变更与 `persist` 作为同一个队列单元执行。
- `retrieve`、`retrieveDecisions`、`summarize` 在读取前等待已排队写入完成。
- `close` 也通过同一队列执行，因此先等待既有写入，再持久化和关闭。
- 队列尾部会吸收上一个操作的拒绝状态，但返回给该操作调用者的 Promise 仍然拒绝：错误不会被隐藏，后续队列也不会被永久毒化。

## 根因

原实现允许同一实例的多个 `store()` 同时调用 `persist()`。所有 `persist()` 共用 `${dbPath}.tmp`：多个调用会交错写入和重命名同一个临时文件，其中一个调用重命名后，其他调用再重命名就会因源文件已不存在而触发 `ENOENT`。只串行化文件写入还不足以建立完整操作顺序，因此本修复串行化整个“SQLite 变更 + 持久化”单元。

## RED → GREEN → REFACTOR

1. RED：先在未修改实现上运行定向测试，稳定复现并发用例在 `rename memory.db.tmp -> memory.db` 处报 `ENOENT`。
2. GREEN：引入实例级共享队列，将所有要求的写入、读取与关闭操作接入相应顺序保证，定向测试转为 8/8 通过。
3. REFACTOR：将公共队列逻辑收敛到 `enqueueWrite()`，保留各 API 原有 SQL、`:memory:` 分支、100KB 限制和 10000 条裁剪行为。

## 运行过的命令和准确结果

### 1. RED 定向测试（修改前）

```bash
./node_modules/.bin/vitest run tests/unit/memory/sqlite-memory.test.ts --reporter=verbose
```

结果：退出码 1；1 个测试文件失败；8 个测试中 7 通过、1 失败。失败用例是“并发写入同一个磁盘数据库时不应丢失条目或发生临时文件冲突”，原因为 `rename` 报 `ENOENT`。

### 2. GREEN 定向测试（修改后）

```bash
./node_modules/.bin/vitest run tests/unit/memory/sqlite-memory.test.ts --reporter=verbose
```

结果：退出码 0；1/1 个测试文件通过；8/8 个测试通过。

### 3. Lint / TypeScript 检查

```bash
npm run lint
```

结果：退出码 0；`tsc --noEmit` 通过，无诊断。

### 4. 全量测试（受限沙箱内）

```bash
npm test
```

结果：退出码 1；18 个测试文件中 17 通过、1 失败；72 个测试中 71 通过、1 失败。唯一失败是 `tests/unit/app/web-server.test.ts`，因沙箱禁止绑定 `0.0.0.0` 而报 `listen EPERM`；本任务的 SQLiteMemory 测试全部通过。

### 5. 全量测试（沙箱外重跑）

```bash
npm test
```

结果：退出码 0；18/18 个测试文件通过；72/72 个测试通过。

## 自查发现

- 修改未触及失败测试、`SPEC_PROCESS.md`、`AGENT_LOG.md` 或 `REFLECTION.md`。
- 队列覆盖 brief 要求的四个写 API 和 `close`，三个读 API 都会等待当时已排队的写入。
- 操作的原始 Promise 保留拒绝结果，只有用于串联后续操作的队列尾会捕获错误，满足“错误可见且队列可继续”。
- 串行化范围是单个 `SQLiteMemory` 实例，与 brief 要求一致。
- 未更改 `persist()` 对 `:memory:` 的早返回、单条 100KB 校验、每会话 10000 条的 SQL 裁剪，以及现有查询顺序和返回结构。

## 未解决问题

无。沙箱内的 WebUI `EPERM` 已通过沙箱外的同一命令证明为执行环境限制，不是产品回归。

## Quality review fix loop

代码质量 reviewer 提出两个 Important：`close()` 可能被更早发起的首次读取越过；原并发测试没有直接覆盖其他写 API、读等待、错误恢复与 close 时序。新鲜 fix subagent 在时限内没有产出改动，控制者中止该 subagent 并由人工根据 reviewer 的复现证据接管；这一干预未记作 subagent 输出。

### 第二次 RED

先增加 5 个确定性测试（`it.each` 展开三个读 API，另有跨 API 顺序与错误恢复）。在 `71ecf6d` 生产实现上运行：13 个记忆测试中 10 个通过、3 个失败；失败均为 `retrieve` / `retrieveDecisions` / `summarize` 已经发起后，`close()` 返回，读操作又将 `db` 重开。

### 第二次 GREEN / REFACTOR

将实例字段 `writeQueue` 收敛为泛型 `operationQueue`：四个写 API、三个读 API 和 `close()` 全部以调用顺序入队。每个公有 Promise 只在自身操作结束时 resolve/reject；队列尾用 `then(..., ...)` 恢复后续操作，但不吞掉当前调用者的错误。没有增加依赖或跨实例锁。

### 新鲜验证

```text
SQLiteMemory 定向：13/13 通过
npm run lint：通过
npm test：18/18 files，77/77 tests 通过
```

### 终审补强

quality reviewer 复审 `87daefc` 后仍保留 1 个 Important：原测试没有把写入稳定阻塞住，无法证明 `close()` 不会提前返回。人工在 `148b5f2` 中加入 `started` / `release` barrier，在释放前断言 `closeSettled === false`，释放后再检查 `db === null`、`initialized === false`。生产代码没有再次改动。定向 13/13、lint 和全量 77/77 重新通过，quality review 最终 `APPROVED`。

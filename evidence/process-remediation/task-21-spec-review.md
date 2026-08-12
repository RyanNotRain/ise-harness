# Task 21 Spec 合规审查

## 审查结论

**APPROVED**

未发现 Critical 或 Important 级别的 spec 偏差、遗漏或超范围修改。

## 审查范围与方法

- 审查基线：RED commit `6699af7`
- 审查对象：实现 commit `71ecf6d`
- 阅读文件：
  - `evidence/process-remediation/task-21-brief.md`
  - `tests/unit/memory/sqlite-memory.test.ts`
  - `src/memory/sqlite-memory.ts`
  - `evidence/process-remediation/task-21-implementer-report.md`
- 差异核查：`git diff 6699af7..71ecf6d`、`git diff --name-status 6699af7..71ecf6d`
- 验证方式：静态逐项核对、在 RED 快照复跑定向测试、在最终提交复跑定向测试、lint 与全量测试。

## 八项要求逐条核对

### 1. 不修改或削弱新增失败测试

符合。

- `6699af7..71ecf6d` 对 `tests/unit/memory/sqlite-memory.test.ts` 的 diff 为空。
- RED 提交新增的并发测试仍以 25 个同实例并发 `store()`、`Promise.all` 必须 resolve、重开数据库后必须有 25 条记录为断言，没有删除、跳过或放宽。
- 在 `6699af7` 快照实际复跑，结果为 8 个测试中 7 通过、并发测试 1 失败，失败为 `rename memory.db.tmp -> memory.db` 的 `ENOENT`，证明该测试在旧实现上确实为 RED。

### 2. 只修改 `src/memory/sqlite-memory.ts`，除非编译所必需

符合。

- `git diff --name-status 6699af7..71ecf6d` 仅列出 `M src/memory/sqlite-memory.ts`。
- 未修改测试，也未触及 `SPEC_PROCESS.md`、`AGENT_LOG.md` 或 `REFLECTION.md`。
- 实现提交没有额外依赖、配置或无关功能改动。

### 3. 同一实例磁盘变更排队，避免临时文件争用；一次失败不永久毒化队列

符合。

- 每个 `SQLiteMemory` 实例新增独立的 `writeQueue`，初值为已完成 Promise。
- `enqueueWrite()` 通过 `this.writeQueue.then(operation)` 串联完整操作，使同一实例不会同时执行多个“数据库变更 + `persist()`”单元，因此不会并发争用 `${dbPath}.tmp`。
- `enqueueWrite()` 把原始 `result` 返回给调用者，故当前操作错误仍然可见；队列尾则赋为 `result.catch(() => undefined)`，故拒绝不会阻止后续操作执行。这同时满足错误传播与队列恢复要求。
- 队列是实例字段，作用域没有错误扩大为跨实例或全局锁，符合 brief 明确限定的“同一实例”。

### 4. 四个写 API 使用同一写入队列

符合。

- `store`
- `clear`
- `storeDecision`
- `updateSummary`

以上四个方法均调用同一个实例方法 `enqueueWrite()`，并把各自的 SQLite 变更和 `persist()` 放在同一队列操作内，没有只排队文件写入而遗漏内存数据库变更。

### 5. 三个读 API 返回前等待已排队写入

符合。

- `retrieve`
- `retrieveDecisions`
- `summarize`

以上三个方法均先执行 `await this.writeQueue`，之后才 `ensureInit()` 和查询，因此调用时已经排入队列的写入会在读结果返回前完成。由于队列尾吸收单次写失败，读方法也不会因历史失败而被永久毒化。

### 6. `close` 等待此前写入，再持久化和关闭

符合。

- `close()` 自身通过同一个 `enqueueWrite()` 入队，因此排在调用前已经排队的写操作之后。
- 队列轮到 `close()` 时，如数据库已打开，会依次 `persist()`、`db.close()`，再清空实例状态。
- `persist()` 完成前不会关闭数据库；持久化失败时也不会错误地继续关闭，且该失败不会阻断未来队列操作。

### 7. 保持边界及现有 API 行为

符合。

- `:memory:` 判断和 `persist()` 的早返回逻辑未改动。
- `store()` 中按 UTF-8 字节数限制单条内容不超过 `100 * 1024` 的校验、错误文本均保留。
- 每会话通过 `OFFSET 10000` 裁剪旧条目的 SQL 未改动。
- 所有公有方法签名、查询 SQL、结果结构、排序、limit 处理、摘要和决策行为均未改动。
- 变更只增加 brief 要求的顺序保证；没有加入跨实例/跨进程锁或改变持久化格式。

### 8. RED → GREEN → REFACTOR，且实现最小

符合。

- RED：`6699af7` 是独立测试提交；本审查复跑确认旧实现稳定失败于目标竞态。
- GREEN：`71ecf6d` 后目标文件 8/8 测试通过，并发写入后重开数据库仍得到 25 条记录。
- REFACTOR：公共排队逻辑收敛为一个小型 `enqueueWrite()`；四个写 API 和 `close()` 只做薄包装，未复制队列恢复逻辑。
- 生产差异限于一个 Promise 队列字段、要求覆盖的方法接线和一个辅助方法；`persist()` 本身以及数据库模型均未重写，属于解决目标竞态所需的最小实现。

## 新鲜验证结果

### RED 快照定向测试

命令：

```bash
./node_modules/.bin/vitest run tests/unit/memory/sqlite-memory.test.ts --reporter=verbose
```

在导出的 `6699af7` 快照运行：退出码 1；1 个测试文件失败；8 个测试中 7 通过、1 失败。唯一失败为并发持久化测试，错误是共享临时文件 rename 的 `ENOENT`。

### 最终提交定向测试

同一命令在 `71ecf6d` 运行：退出码 0；1/1 个测试文件通过；8/8 个测试通过。

### Lint / TypeScript

命令：

```bash
npm run lint
```

退出码 0；`tsc --noEmit` 无诊断。

### 全量测试

命令：

```bash
npm test
```

当前受限审查沙箱内结果：退出码 1；18 个测试文件中 17 通过、1 失败；72 个测试中 71 通过、1 失败。唯一失败为 `tests/unit/app/web-server.test.ts` 尝试监听 `0.0.0.0` 时的 `EPERM`。本任务的 `tests/unit/memory/sqlite-memory.test.ts` 8/8 通过。该失败发生在与本提交没有差异的 WebUI 代码路径，属于当前沙箱网络绑定限制，不构成 Task 21 产品回归。实现者报告还记录了同一全量命令在沙箱外 18/18 文件、72/72 测试通过。

## 遗漏与超范围检查

- 要求覆盖的四个写 API、三个读 API及 `close()` 均无遗漏。
- 队列失败恢复语义没有吞掉当前调用者错误。
- 未修改新增失败测试，未改动禁止文件，未引入跨实例协调、数据库迁移或其他超范围能力。
- 未发现需要阻止批准的未解决问题。

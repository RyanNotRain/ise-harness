# Task 21 代码质量审查

## 结论

**CHANGES REQUESTED**

未发现 Critical；发现 2 项 Important。实现能够修复当前 25 个并发 `store()` 争用同一临时文件的问题，但 `close()` 与已发起读取之间仍有可复现的资源生命周期竞态，而且现有新增测试不足以证明 brief 中大部分并发契约。

## 审查范围

- 阅读 `task-21-brief.md`、`task-21-implementer-report.md`、`task-21-spec-review.md`。
- 审查 `git diff 6699af7..71ecf6d`；生产差异仅涉及 `src/memory/sqlite-memory.ts`。
- 阅读 `src/memory/sqlite-memory.ts` 与 `tests/unit/memory/sqlite-memory.test.ts`。
- 运行定向 SQLiteMemory 测试：1 个文件、8/8 测试通过。
- 使用不修改仓库的定向脚本复现首次读取与 `close()` 的时序问题。

## Findings

### Important 1：`close()` 不等待已发起的读取，可能在返回后由读取重新打开数据库

位置：`src/memory/sqlite-memory.ts:86-88`、`114-116`、`136-138`、`163-171`

三个读方法仅捕获并等待当时的 `writeQueue`，但读取本身没有登记到任何可供 `close()` 等待的队列。首次读取时，`ensureInit()` 至少跨越一个异步边界；若先调用 `retrieve()`、紧接着调用 `close()`，`close()` 的队列操作可能在 `this.db` 仍为 `null` 时直接完成。随后先前已经发起的读取继续执行 `ensureInit()`，创建数据库并把 `this.db` / `initialized` 恢复为打开状态。于是调用者已经成功 `await close()`，实例却仍持有一个打开的 sql.js 数据库。

定向复现（预热全局 SQL 初始化后重复运行）稳定得到：在 `await close()` 之后，`dbOpen: true`、`initialized: true`；读取完成后仍为打开状态。这是资源泄漏和关闭语义错误，在磁盘模式下也可能让调用者在认为关闭完成后删除或移动数据库文件，而旧实例又异步打开它。

建议让 `close()` 与已经开始的读取共享生命周期协调机制，或让读取本身进入同一有序队列；至少必须保证 `close()` 返回时，调用它之前发起的读取已完成且不会再重新初始化实例。需要加入确定性回归测试，覆盖未初始化实例上的 `retrieve()`/`summarize()`/`retrieveDecisions()` 与紧随其后的 `close()`。

### Important 2：新增测试只覆盖并发 `store()`，无法防止对其余队列要求的伪修复

位置：`tests/unit/memory/sqlite-memory.test.ts:77-97`

唯一新增并发测试只执行 25 个 `store()`，随后顺序 `close()` 和重开检查条数。以下 brief 的关键行为都没有测试：

- `clear`、`storeDecision`、`updateSummary` 是否与 `store` 共用同一队列；
- `retrieve`、`retrieveDecisions`、`summarize` 是否等待先前写入；
- `close` 是否等待已经排队的写入；
- 单次写入失败是否向该调用者传播，同时后续队列仍可继续；
- 读取与关闭的生命周期时序。

因此只给 `store()` 加锁、遗漏其他 API 的实现也能让当前全部 8 个测试通过；吞掉写错误或让失败永久毒化队列同样不会被检测。当前测试只能防住最初的共享 `.tmp` 竞态，不能证明 Task 21 所声明的完整并发可靠性。建议用可控的持久化延迟/失败注入编写确定性测试，逐项断言顺序与错误传播，而不是依赖磁盘操作偶然交错。

## 其他质量结论

- `enqueueWrite()` 将原始 `result` 返回调用者，并只在内部队列尾吸收拒绝；从静态逻辑看，当前操作的错误可见且后续写入不会被永久毒化。
- 对四个写 API 的“数据库变更 + persist”整体串行化是正确方向；没有发现写队列自身的死锁环。
- 当前并发 `store()` 定向测试 8/8 通过，说明原始 `.tmp` rename 争用已被修复，但不消除以上生命周期与覆盖问题。

## 初审判定

- Critical：无
- Important：2
- Minor：无

---

## Fix commit `87daefc` 复审

### 结论

**CHANGES REQUESTED**

原 Important 1 已解决；原 Important 2 大部分已解决，但 `close()` 等待已排队写入这一契约的测试仍不能防止伪修复，故保留 1 项 Important。

### 原 Important 1：已解决

实现把 `writeQueue` 泛化为 `operationQueue`，四个写 API、三个读 API 和 `close()` 都在 API 被调用时通过 `enqueueOperation()` 进入同一 FIFO 队列。这样先发起的首次读取必然执行完毕后，后调用的 `close()` 才会持久化、关闭并清空状态，不会再出现 `close()` 返回后旧读取重新初始化数据库的竞态。

新增的三个参数化生命周期测试使用可控 `ensureInit()` 屏障，分别覆盖 `retrieve`、`retrieveDecisions` 和 `summarize`。它们明确断言 `close()` 没有越过读取，并在完成后检查 `db === null`、`initialized === false`，能够防止原问题回归。

泛型 `enqueueOperation<T>()` 返回原始 `result`，同时用成功和失败处理器把内部队列尾恢复成 fulfilled `Promise<void>`；当前调用者仍收到真实拒绝，后续操作不会被毒化。未发现新死锁环。

### 原 Important 2：部分解决，仍有 Important

位置：`tests/unit/memory/sqlite-memory.test.ts` 新增的“`close` 应等待已排队写入，写失败不得毒化后续队列”用例。

新增测试已经确定性覆盖：

- 三个读 API 与 `close()` 的生命周期顺序；
- 四个写 API 共用队列；
- 三个读 API 等待先前写入；
- 写错误向当前调用者传播，且后续队列可以恢复。

但该 `close` 用例在调用 `updateSummary()` 后立即调用 `close()`，没有用屏障让写入保持 pending，也没有检查 `close()` 是否在写入释放前保持未完成、或 close 后实例状态/磁盘结果。若实现错误地让 `close()` 不进入队列，该测试仍可能通过：`close()` 可先关闭当前数据库并 resolve，排队的 `updateSummary()` 随后重新初始化数据库并 resolve；测试只分别断言两个 Promise 成功，不会观察到顺序错误或重新打开状态。

因此测试名所声明的“`close` 应等待已排队写入”尚未被真实验证，仍不能防止这一关键契约的伪修复。建议像读/close 测试一样，在 `persist()` 中设置 started/release 屏障：写入 pending 时调用 `close()`，断言释放前 `close()` 未 settle，释放后两者完成，并断言实例已关闭；磁盘模式下还可重开确认写入已持久化。

### 验证证据

- 已阅读 fix commit `87daefc` 的实现、测试和更新后的 implementer report。
- 接受控制者提供的新鲜验证证据：SQLiteMemory 定向 13/13、全量 77/77。
- 上述剩余 finding 是断言有效性问题；现有通过结果不能排除描述的伪修复。

### 复审最终判定

- Critical：无
- Important：1（`close()` 等待 pending 写入的测试不具备判别力）
- Minor：无

---

## Final fix commit `148b5f2` 终审

### 结论

**APPROVED**

此前剩余的 Important 已解决，未发现剩余 Critical 或 Important。

### 剩余 Important 核验

`close 应等待已排队写入，写失败不得毒化后续队列` 测试现已具备确定性的时序判别力：

- 第一次 `persist()` 注入失败，继续验证错误向原调用者传播且队列不会被毒化；
- 第二次 `persist()` 通过 `started` / `release` barrier 保持 pending，确保 `updateSummary()` 确实处于未完成写入状态；
- 收到 `started` 后才调用 `close()`，并在释放 barrier 前通过 `closeSettled === false` 证明 `close()` 没有提前完成；
- 释放后同时等待写入与关闭成功，最后断言 `db === null`、`initialized === false`，证明 pending 写入完成后实例最终处于关闭状态，而非被后续操作重新打开。

该测试能够识别先前描述的“`close()` 未进入队列、先行返回、写入随后重新初始化数据库”伪修复。结合 `87daefc` 已审查的统一 `operationQueue` 实现，原两项 Important 均已闭环。

### 验证记录复核

更新后的 implementer report 明确记录：

- SQLiteMemory 定向测试：13/13 通过；
- `npm run lint`：通过；
- 全量测试：18/18 files、77/77 tests 通过。

最终提交 `148b5f2` 仅增强上述回归测试，没有改变已批准的生产实现。终审无剩余重要问题。

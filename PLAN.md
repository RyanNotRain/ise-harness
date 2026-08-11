# ise-harness 实现计划

> 状态日期：2026-08-09
> 重点维度：记忆与上下文管理
> 分发：npm 包；界面：内置 WebUI

## 1. 全局约束

1. 不使用现成 agent runner；主循环、治理、反馈、记忆和停机均由本仓库代码实现。
2. 核心机制测试使用 MockLLM 或 mock HTTP，不访问真实 LLM。
3. 新行为先增加失败测试，再最小实现、重构并运行相关测试与全量测试。
4. API key 不进入源码、Git、日志或测试 fixture；加密存储不得有默认主密码。
5. 文件工具不得越出 `workspaceRoot`；危险 shell 动作必须先经过确定性护栏。
6. 每个 task 完成后运行所列验证，并在最终提交后补 commit/MR 链接。

## 2. 模块与数据流

```text
CLI / WebUI
    ↓ load config + credential
Runtime factory
    ↓
Agent loop
    ├→ SQLiteMemory / CodeIndex / ContextWindow
    ├→ LLMProvider(OpenAI / Anthropic / Mock)
    ├→ Guardrails → HITL
    ├→ Tool(workspace bounded)
    └→ Validator → feedback → next LLM turn
```

## 3. 原始开发任务记录

下表保留真实 Git 历史；原开发全部发生在 `main`，没有 worktree/MR，这是流程偏离，详见 `AGENT_LOG.md` 与 `REFLECTION.md`。

| Task | 内容 | 原始 commit | 当前状态 |
|---|---|---|---|
| 1 | 核心类型、MockLLM | `52cbd9f` | 已完成并在整改中扩展 |
| 2 | 工具系统 | `08a6c11`、`6067586` | 已完成并增加工作区围栏 |
| 3 | Agent 循环、LLM provider | `e31d6cf` | 已重构为完整机制闭环 |
| 4 | SQLiteMemory | `9f8bedb`、`8d0af5b` | 已补磁盘持久化 |
| 5 | CodeIndexMemory | `6c4994e`、`5a56097` | 已补目录扫描与持久化 |
| 6 | ContextWindowMemory | `c453316` | 已接入 Agent |
| 7 | 治理与 HITL | `40e9208`、`7085967` | 已接入 Agent 并补实际确认路径 |
| 8 | 反馈校验器 | `fcd6db8`、`955986d` | 已接入 Agent 反馈重试 |
| 9 | 配置 | `7caf22e` | 已修复严格类型和运行时组装 |
| 10 | 凭据与 CLI | `6f9d874` | 已替换不合规内存实现 |
| 11 | 机制演示 | `40192d1` | 已改为证明生产主循环机制 |
| 12–13 | CI、分发、文档 | `b9da021` | 已补构建、打包、WebUI 与文档一致性 |

## 4. 提交前整改任务

以下 task 为最终审查后新增，commit 栏记录本轮整改的实际提交。

### Task 14：主循环组合六类机制

- 目标：让生产 `Agent` 而非测试包装器完成上下文、LLM、治理、工具、反馈、记忆和停机闭环。
- 文件：`src/core/agent.ts`、`src/core/types.ts`、`src/core/llm-provider.ts`、`src/core/mock-llm.ts`。
- 失败测试：
  - 工具 schema 未传给 provider；
  - 危险命令仍执行；
  - 失败测试结果未出现在下一轮调用；
  - 重启会话后没有历史。
- 实现：注入 memory/codeIndex/contextWindow/guardrails/HITL/validators；记录反馈和结构化事件。
- 验证：`npx vitest run tests/unit/core/agent.test.ts tests/demo/`。
- 依赖：原 Task 1–8。
- 状态：完成；commit：`d506627`。

### Task 15：真实供应商工具协议

- 目标：OpenAI 与 Anthropic 能收到工具 schema，并正确交换 tool call/result。
- 文件：`src/core/openai-provider.ts`、`src/core/anthropic-provider.ts`、`tests/unit/core/providers.test.ts`。
- 失败测试：OpenAI payload 缺 `tools/tool_call_id`；Anthropic `tool_use` 不能解析。
- 实现：分别映射两家 API 的 assistant tool call、tool result 和停机原因。
- 验证：`npx vitest run tests/unit/core/providers.test.ts`。
- 依赖：Task 14；可与 Task 16 并行。
- 状态：完成；commit：`d506627`。

### Task 16：持久化记忆与代码索引

- 目标：重点维度必须跨进程工作，而非只在内存中通过测试。
- 文件：`src/memory/sqlite-memory.ts`、`src/memory/code-index.ts`、对应测试。
- 失败测试：实例 A 关闭后，实例 B 无法读取同一路径数据。
- 实现：加载/导出 sql.js 数据库、临时文件原子替换、权限限制、单条 100KB/单会话 10000 条边界；目录扫描与增量索引。
- 验证：`npx vitest run tests/unit/memory/ tests/demo/memory-demo.test.ts`。
- 依赖：无；可与 Task 15、17 并行。
- 状态：完成；commit：`d506627`。

### Task 17：凭据安全闭环

- 目标：满足安全存储、隐藏录入、状态/更新/清除和无明文默认值要求。
- 文件：`src/credential/keychain.ts`、`src/credential/cli.ts`、凭据测试。
- 失败测试：新实例无法读取 key；错误主密码未拒绝；磁盘只保存明文或权限过宽。
- 实现：scrypt + AES-256-GCM、随机 salt/IV、认证 tag、`0600` 文件、TTY 隐藏输入、无默认密码。
- 验证：`npx vitest run tests/unit/credential/credential.test.ts`。
- 依赖：无；可与 Task 15、16 并行。
- 状态：完成；commit：`d506627`。

### Task 18：CLI、WebUI 与运行时组装

- 目标：让获取到包的用户能初始化、配置 key、运行 Agent、建立索引并打开 WebUI。
- 文件：`src/app/*`、`src/cli/index.ts`、`src/config/*`、WebUI 测试。
- 失败测试：CLI 仅打印占位文字；`/health` 不可用；公网接口无访问控制。
- 实现：runtime factory、真实 CLI 命令、内置 HTTP WebUI、Bearer token、Web 模式危险动作默认拒绝。
- 验证：`node dist/cli/index.js --help`；`npx vitest run tests/unit/app/`。
- 依赖：Task 14–17。
- 状态：完成；commit：`d506627`。

### Task 19：npm 分发和 CI

- 目标：tarball 可构建、安装、导入和运行 CLI。
- 文件：`package.json`、`package-lock.json`、`.gitlab-ci.yml`、`.github/workflows/ci.yml`、`src/index.ts`、`LICENSE`。
- 失败验证：`tsc` 报错；tarball 缺 `dist`；全局安装后找不到 CLI。
- 实现：`main/types/exports/files/bin`、prepack 构建、CI 类型检查/测试/打包/全局安装烟雾测试。
- 验证：`npm run lint && npm run build && npm pack`，在临时目录全局或局部安装 tarball并运行 `ise-harness --help`。
- 依赖：Task 18。
- 状态：本地构建和打包预览完成；真实 CI 与 registry 发布待外部执行；commit：`2457e4f`。

### Task 20：规约、过程与提交文档一致性

- 目标：删除“文档说完成、代码未实现”的矛盾，保留真实过程缺陷和整改证据。
- 文件：`SPEC.md`、`PLAN.md`、`README.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md`、`REFLECTION.md`、`DEPLOYMENT.md`。
- 验证：搜索过时技术选型和虚假完成声明；逐项核对两份课程要求。
- 依赖：Task 14–19。
- 状态：本地完成；commit：`4f88b64`。

## 5. 依赖与并行关系

```text
Task 14 主循环
  ├─ Task 15 供应商协议 ─┐
  ├─ Task 16 持久化记忆 ─┼→ Task 18 CLI/WebUI → Task 19 分发/CI
  └─ Task 17 凭据安全 ───┘                         ↓
                                              Task 20 文档
```

- 并行组 A：Task 15、16、17。
- 串行组 B：Task 14 → 18 → 19 → 20。
- 正式重做时每个并行 task 应使用独立 worktree 和 MR；本次整改至少应放入新的 remediation 分支并通过 MR 合入。

## 6. 完成定义

本地完成必须同时满足：

```bash
npm ci
npm run lint
npm test
npm run test:demo
npm run build
npm pack
```

最终提交还必须满足以下外部证据：

- [x] 当前整改已提交到独立分支 `codex/submission-remediation`。
- [ ] 创建 MR；MR 写明 Agent/人工修改范围以及原流程偏离。
- [x] PLAN 中整改任务均已替换为真实 commit hash。
- [ ] GitHub Actions（以及 NJU Git 使用的 GitLab CI）中 `unit-test`、`demo`、`package` 最后一次全部通过。
- [ ] npm tarball 上传为 CI artifact，并按选定策略发布到公开 registry。
- [ ] Render WebUI 部署成功，README/DEPLOYMENT 写入真实 URL、commit 和健康检查时间。
- [ ] 最终仓库与历史扫描确认无真实 key、`.env`、凭据文件和 npm token。

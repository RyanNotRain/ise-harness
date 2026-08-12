# ise-harness 实现计划

> 状态日期：2026-08-12
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

### 原始 Task 1–13 的可执行要点

原始计划曾包含逐步代码样例，后来在整改时被压缩成上表。为满足“每个 task 都能交给单个 agent 执行”的要求，这里保留与最终实现一致的目标、文件、预期行为、失败测试和依赖；原始实现过程是否遵循 TDD，仍以 Git 历史和 `AGENT_LOG.md` 为准。

| Task | 目标与文件 | 失败测试 / 验证 | 实现要点 | 依赖与并行 |
|---|---|---|---|---|
| 1 | 定义模型消息、响应与可注入 MockLLM；`src/core/types.ts`、`llm-provider.ts`、`mock-llm.ts` | 预定义响应不按序返回、耗尽不报错；`tests/unit/core/mock-llm.test.ts` | ESM 类型、调用历史、确定性响应队列 | 无，可与 4、5、7、9、10 并行 |
| 2 | 建立工具接口、注册表及读/写/Bash/Grep；`src/tools/*` | 工具不能注册/查找、重复注册未拒绝、路径逃逸或符号链接逃逸；`tests/unit/tools/*` | JSON Schema、统一 `ToolResult`、文件工具限制在工作区 | 依赖 1 |
| 3 | 实现自研 Agent 循环及 OpenAI/Anthropic 适配；`src/core/agent.ts`、两家 provider | stop/maxTurns/tool call 未正确停机或分发；供应商 payload 丢工具、系统上下文或采样配置；`tests/unit/core/*` | 上下文→LLM→动作→工具→回灌→停机，不使用现成 runner | 依赖 1、2 |
| 4 | 实现持久化会话记忆；`src/memory/types.ts`、`sqlite-memory.ts` | 存取/清理/摘要失败，重开数据库丢记录或 metadata，并发写临时文件冲突；`sqlite-memory.test.ts` | sql.js、原子替换、FIFO 10000、单条 100KB、`0600`、实例内操作队列 | 无，可与 5、7、9、10 并行 |
| 5 | 实现可选代码索引；`src/memory/code-index.ts` | 相同内容重复 embedding、查询为空、目录排除/512KB 上限/重开恢复失败；`code-index.test.ts` | SHA-256 增量判断、Float32 BLOB、余弦排序、可注入 embedder | 无，可与 4、7、9、10 并行 |
| 6 | 实现上下文窗口压缩；`src/memory/context-window.ts` | 阈值内误压缩、超阈值不压缩、最近消息未保留；`context-window.test.ts` | 估算 token、外部摘要函数、保留近期消息 | 依赖 4；可与 2、8 并行 |
| 7 | 实现危险命令、文件删除与 HITL；`src/governance/*` | 危险命令放行、安全命令误拦、确认超时未默认拒绝；`tests/unit/governance/*` | 确定性规则、严重级别、允许/拒绝/超时状态 | 无，可与 4、5、9、10 并行 |
| 8 | 实现测试输出和用户反馈校验器；`src/feedback/*` | pass/fail 误判、失败详情或建议缺失；`test-validator.test.ts` | `supports` 选择适用工具，反馈结构可回灌 | 依赖 1；可与 6 并行 |
| 9 | 实现默认配置与深合并；`src/config/*` | 缺文件不返回默认值、局部覆盖抹掉同级默认值、secret 进入配置对象；`loader.test.ts` | JSON 配置声明行为，秘密只走进程环境/加密存储 | 无，可与 4、5、7、10 并行 |
| 10 | 实现加密凭据和 key CLI；`src/credential/*`、`src/cli/index.ts` | 重开实例丢 key、错误密码可解密、目录/文件权限过宽、状态命令回显明文；`credential.test.ts` | scrypt + AES-256-GCM、随机 salt/IV、TTY 隐藏输入、set/view/update/clear | 无，可与 4、5、7、9 并行 |
| 11 | 提供三项 MockLLM 机制演示；`tests/demo/*` | 护栏未穿过主循环、失败反馈未改变下一步、会话记忆不隔离；`npm run test:demo` | 演示必须确定性、离线、可重复 | 依赖 1–10 |
| 12 | 配置 CI 和 npm 分发；`.gitlab-ci.yml`、`.github/workflows/ci.yml`、`package.json` | 类型/测试失败、tarball 缺入口、全局安装后 CLI 不可运行 | unit-test/demo/package jobs，构建、打包、安装、CLI smoke | 依赖 1–11 |
| 13 | 完成提交文档；`README.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md`、`REFLECTION.md` | 必需章节/链接/限制/声明缺失，文档与命令不一致 | 人工核验真实过程和外部证据，不虚构平台状态 | 依赖 1–12 |

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
- 状态：完成；本地构建、tarball 安装和 CLI 烟雾验证通过，GitHub Actions 全绿，`ise-harness@0.1.0` 已发布到公开 npm registry；commit：`2457e4f`, `6a594b3`, `d564dac`。

### Task 20：规约、过程与提交文档一致性

- 目标：删除“文档说完成、代码未实现”的矛盾，保留真实过程缺陷和整改证据。
- 文件：`SPEC.md`、`PLAN.md`、`README.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md`、`REFLECTION.md`、`DEPLOYMENT.md`。
- 验证：搜索过时技术选型和虚假完成声明；逐项核对两份课程要求。
- 依赖：Task 14–19。
- 状态：本地完成；commit：`4f88b64`。

### Task 21：SQLiteMemory 同实例并发可靠性

- 目标：修复同一个 `SQLiteMemory` 实例并发写盘时争用同一个 `.tmp` 文件的问题，并明确读、写、关闭的调用顺序。
- worktree / 分支：`/private/tmp/ise-harness-memory-concurrency` / `codex/task21-memory-concurrency`。
- 文件：`src/memory/sqlite-memory.ts`、`tests/unit/memory/sqlite-memory.test.ts`、`evidence/process-remediation/`。
- RED：25 个并发 `store()` 共享临时文件，旧实现稳定触发 rename `ENOENT`；commit：`6699af7`。
- GREEN：新鲜实现 subagent 加入实例级队列，定向 8/8；commit：`71ecf6d`。
- 两阶段评审：spec review 首次通过；quality review 提出 2 个 Important。人工接管超时的 fix subagent，补出读/close 生命周期 RED（10/13），统一操作队列后 13/13；commit：`87daefc`。终审要求加强 close 时序断言，再以 barrier 测试关闭该问题；commit：`148b5f2`，最终 `APPROVED`。
- 验证：`npm run lint` 通过；全量 18/18 files、77/77 tests 通过；[PR #7](https://github.com/RyanNotRain/ise-harness/pull/7) 的 `unit-test`、`demo`、`package` 全绿。完整 brief、实现报告和逐轮审查见 [`evidence/process-remediation/`](./evidence/process-remediation/)。
- 范围：只承诺同一实例内的确定顺序；跨进程并发写入与文件锁不在本 task 中。

### Task 22：最终要求逐条审查与一致性修复

- 目标：逐条对照通用要求与 A 类要求，消除代码、安全边界、测试证据和文档声明之间的不一致。
- worktree / 分支：`/private/tmp/ise-final-requirements-audit` / `codex/final-requirements-audit`。
- 文件：`src/app/*`、`src/core/*`、`src/credential/*`、`src/memory/*`、`src/tools/workspace.ts`、对应测试和提交文档。
- RED：符号链接可越出工作区；已有凭据目录仍为 `0755`；模型采样配置未传入；Anthropic 丢失第二条 system 上下文；真实 Web 后端无 token 也能启动；Memory metadata 跨实例丢失。
- GREEN：真实路径边界检查、权限收紧、配置透传、合并 system 上下文、强制 Web 访问令牌、向后兼容的 metadata 列迁移；commit：`8be7006`。
- 特征测试：直接覆盖 100KB、10000 条 FIFO、SQLite/CodeIndex `0600`、索引目录排除、512KB 跳过和磁盘恢复；这些是对已有行为的提交前验证，不冒充原始 TDD。
- 验证：`npm run lint`、18/18 files 与 85/85 tests、7/7 demos、`npm run build` 均通过。
- 依赖：Task 21 与两份课程要求；本 task 完成后才更新最终提交文档与发布版本。

### Task 23：默认安装依赖安全与 0.1.2 发布

- 目标：修复 0.1.1 registry smoke 暴露的生产依赖漏洞，同时保留开箱可用的离线代码索引。
- 文件：`src/memory/code-index.ts`、`src/app/factory.ts`、`src/cli/index.ts`、`package*.json`、CI 与相关文档/测试。
- RED：`@xenova/transformers` 依赖链的 production audit 为 5 high/1 critical；官方后继包实测仍有 4 high；`HashingEmbedder` 测试先因类不存在失败。
- GREEN：自研 signed feature hashing embedding，无模型下载或第三方 embedding 依赖；SDK 仍允许注入高质量 `Embedder`；显式加入 `@types/node` 保证干净安装可构建。
- 验证：完整 `npm audit` 0 漏洞；18/18 files、86/86 tests、7/7 demos、lint/build/pack 通过；CI 加 `npm audit --omit=dev`。
- 依赖：Task 22、0.1.1 registry smoke；发布 0.1.2 后弃用 0.1.1。

## 5. 依赖与并行关系

```text
Task 14 主循环
  ├─ Task 15 供应商协议 ─┐
  ├─ Task 16 持久化记忆 ─┼→ Task 18 CLI/WebUI → Task 19 分发/CI
  └─ Task 17 凭据安全 ───┘                         ↓
                                              Task 20 文档
                                                  ↓
                                    Task 21 独立 worktree / PR
                                                  ↓
                                    Task 22 最终逐条审查 / PR
```

- 并行组 A：Task 15、16、17。
- 串行组 B：Task 14 → 18 → 19 → 20。
- 原始 Task 1–20 没有逐模块 worktree/MR，历史事实不变。Task 21 是提交前补做的一次完整工作流，不倒填旧记录，也不宣称能替代过去每个模块缺失的 PR。
- Task 22 使用独立 worktree、先复现问题再修复，但没有虚构逐问题的新鲜 subagent 或两阶段评审记录。

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
- [x] 已创建 [PR #1](https://github.com/RyanNotRain/ise-harness/pull/1)，写明 Agent/人工修改范围以及原流程偏离。
- [x] PLAN 中整改任务均已替换为真实 commit hash。
- [x] 最终合规审查合并后的 [GitHub Actions #31554563001](https://github.com/RyanNotRain/ise-harness/actions/runs/31554563001) 中，`unit-test`、`demo`、`package` 全部通过；`.gitlab-ci.yml` 保留同等 jobs 供 NJU Git 执行。
- [x] npm tarball 已由 GitHub Actions 上传为短期 artifact。
- [x] [`ise-harness@0.1.0`](https://www.npmjs.com/package/ise-harness) 已发布到公开 registry，并完成公网安装、SDK import 与 CLI 烟雾测试。
- [x] [GitHub Pages MockLLM WebUI](https://ryannotrain.github.io/ise-harness/) 部署成功，README/DEPLOYMENT 已写入真实 URL、commit 和检查时间；`render.yaml` 仅保留为可选真实后端模板。
- [x] 2026-08-11 最终工作区与 Git 历史扫描未发现真实 key、`.env`、凭据文件或 npm token。
- [x] Task 21 在独立 worktree 中留下 RED、GREEN、两阶段 review 与 fix loop；最终质量审查为 `APPROVED`，[PR #7](https://github.com/RyanNotRain/ise-harness/pull/7) CI 全绿。
- [x] Task 22 已由 [PR #8](https://github.com/RyanNotRain/ise-harness/pull/8) 合并，main CI [#31578635146](https://github.com/RyanNotRain/ise-harness/actions/runs/31578635146) 通过；0.1.1 已发布且 registry CLI/SDK smoke 通过，但随即发现旧可选依赖漏洞，因此不作为最终推荐版本。
- [ ] Task 23 通过 PR/main CI，发布 0.1.2，registry 安装 audit/CLI/SDK smoke 全绿，并弃用有漏洞依赖链的 0.1.1。
- [ ] 将同一仓库同步到课程指定的 NJU Git 地址，并确认该平台最后一次 `unit-test` pipeline 为 pass；此项需要课程账号与目标仓库 URL，不能用 GitHub Actions 记录代替或虚构。

# AGENT_LOG.md — 实现过程日志

## 实现概览

- 开发工具：OpenCode + Superpowers
- 工作流：subagent-driven-development（subagent 驱动开发）
- 总耗时：约 2 小时（含 17 次 commit、13 个 task、多轮 review-fix 循环）
- 初版验证：53 tests, 14 files, 0 failures；提交前整改后的最终数字见下方日志

## 逐 Task 日志

| 时间 | Task | 技能 | 关键操作 | Commit | 人工干预 | 教训 |
|------|------|------|---------|--------|---------|------|
| 07-08 14:55 | 项目清空 | — | 删除旧文件，重新开始 | 0fc35d9 | 完全重做 | 之前没有按 Superpowers 流程走，导致 SPEC 和代码脱节 |
| 07-08 15:00 | SPEC | brainstorming | 逐轮追问设计决策，产出 SPEC.md | — | 敲定五个关键选择（记忆为重点、OpenAI+Anthropic、npm 分发、加密文件存储、@xenova/transformers） | 精简设计比面面俱到更有效 |
| 07-08 15:10 | PLAN | writing-plans | 生成 13 个 task 的详细实现计划 | — | 确认了 sq.js 替代 better-sqlite3 | PLAN 的代码示例需要与实际依赖一致 |
| 07-08 15:18 | 环境搭建 | — | npm install 遇到 better-sqlite3 编译失败和 @xenova/transformers 下载超时 | 0fc35d9 | 将 better-sqlite3 替换为 sql.js，@xenova/transformers 改为可选依赖 | 技术选型要在实际环境验证 |
| 07-08 15:25 | Task 1 | subagent | 实现核心类型和 MockLLMProvider | 52cbd9f | 无 | 机械性 task 用 subagent 很高效 |
| 07-08 15:28 | Task 1 review | task-reviewer | 审查通过，发现文件缺少末尾换行 | — | 无 | 审查器比人更仔细 |
| 07-08 15:30 | Task 2 | subagent | 实现工具系统（4 个工具） | 08a6c11 | 无 | — |
| 07-08 15:33 | Task 2 review | task-reviewer | 发现 grep.ts 的 RegExp `g` 标志 bug | — | 无 | 审查器捕捉到了人工容易忽略的状态性 bug |
| 07-08 15:35 | Task 2 fix | subagent | 修复 grep 正则 bug | 6067586 | 无 | 移除 `g` 标志即可，一字符修复 |
| 07-08 15:38 | Task 3 | subagent | 实现 Agent 主循环和两个 LLM 提供者 | e31d6cf | 无 | — |
| 07-08 15:40 | Task 3 review | task-reviewer | 审查通过 | — | 无 | — |
| 07-08 15:42 | Task 4 | subagent | 实现 SQLite 记忆存储（重点维度） | 9f8bedb, 8d0af5b | 无 | sql.js 的异步初始化模式需要额外处理 |
| 07-08 15:44 | Task 4 review | task-reviewer | 审查通过 | — | 无 | dbPath 参数未持久化到文件，但这是 PLAN 的设计 |
| 07-08 15:45 | Task 5 | subagent | 实现代码索引记忆 | 6c4994e | 无 | — |
| 07-08 15:48 | Task 5 review | task-reviewer | 发现 BLOB 序列化 bug（Critical） | — | 无 | Float32Array 从字节数组重建时需要用 Uint8Array 中转 |
| 07-08 15:50 | Task 5 fix | subagent | 修复 BLOB 和 Buffer 序列化 | 5a56097 | 无 | 两个修复点：Buffer.from 加 byteOffset，存储向量用 Uint8Array 重建 |
| 07-08 15:52 | Task 6 | subagent | 实现上下文窗口管理 | c453316 | 无 | — |
| 07-08 15:54 | Task 6 review | task-reviewer | 审查通过 | — | 无 | — |
| 07-08 15:56 | Task 7 | subagent | 实现治理护栏 | 40e9208 | 无 | — |
| 07-08 15:58 | Task 7 review | task-reviewer | 发现 FileDeletionGuard 零测试 + HITL defaultDeny 死参数 | — | 无 | 测试覆盖不完整是常见问题 |
| 07-08 16:00 | Task 7 fix | subagent | 补充 FileDeletionGuard 测试，修复 HITL 超时逻辑 | 7085967 | 无 | 两个 bug 都是代码照抄 PLAN 导致的 |
| 07-08 16:02 | Task 8 | subagent | 实现反馈校验器 | fcd6db8 | 无 | — |
| 07-08 16:04 | Task 8 review | task-reviewer | 发现 Validator 接口 async 不兼容 | — | 无 | 接口设计时要考虑同步/异步混用 |
| 07-08 16:05 | Task 8 fix | subagent | 修复 Validator 接口返回类型 | 955986d | 无 | 改为 `Feedback | Promise<Feedback>` |
| 07-08 16:07 | Task 9 | subagent | 实现配置系统 | 7caf22e | 无 | — |
| 07-08 16:08 | Task 9 review | task-reviewer | 审查通过 | — | 无 | — |
| 07-08 16:10 | Task 10 | subagent | 实现凭据管理与 CLI | 6f9d874 | 无 | FileCredentialStore 用内存 Map，生产需持久化 |
| 07-08 16:11 | Task 10 review | task-reviewer | 审查通过 | — | 无 | hiddenInput 实际不隐藏输入，但目前够用 |
| 07-08 16:13 | Task 11 | subagent | 实现 3 个机制演示脚本 | 40192d1 | 无 | — |
| 07-08 16:15 | Task 11 review | task-reviewer | 审查通过，发现 GuardrailCheck 类型不匹配（来自 PLAN） | — | 无 | PLAN 中的类型定义有瑕疵 |
| 07-08 16:17 | Task 12+13 | subagent | 创建 CI 配置和 5 个文档文件 | b9da021 | 无 | SPEC_PROCESS/AGENT_LOG/REFLECTION 需人工填写 |
| 07-08 17:37 | 全量测试 | — | 运行 npm test | — | 确认 53/53 通过 | 全部通过，无回归 |

## 关键教训

1. **subagent 审查器是真正的质量守门人**：Task 2 的 grep 正则 bug、Task 5 的 BLOB 序列化 bug、Task 7 的零测试问题——这些如果不是审查器发现，人工 review 大概率会漏掉。

2. **PLAN 中的代码只是参考**：Task 4 的 better-sqlite3 vs sql.js 问题、Task 7 的 defaultDeny 死参数——都是 PLAN 代码本身的问题。subagent 会逐字复制 PLAN 的代码，PLAN 有 bug，代码就有 bug。

3. **fix 循环是最耗时的环节**：Task 2、5、7、8 都经历了 review → fix → re-review 的循环。虽然每次 fix 很快（通常一两个字符），但分发 fix subagent、生成 review package、重新审查的流程开销不小。

4. **依赖安装要在设计阶段验证**：better-sqlite3 在 Node v26 上编译失败这件事，如果在 SPEC 阶段就验证，就不会有后续的替换和 PLAN 修改。

## 提交前整改日志

> 说明：以下是 2026-08-09 新的 Codex 会话进行的独立审查与整改，不冒充原开发阶段的 Superpowers subagent。原项目没有 worktree/MR，属于流程偏离；本轮应在提交前放入独立 remediation 分支并创建 MR。

| 时间 | Task | 技能/工具 | 关键 prompt/context | 输出与人工判断 | Commit |
|---|---|---|---|---|---|
| 08-09 15:22 | 独立审查 | 新 Codex 会话；未加载旧对话 | “根据两份目标项目说明文档，审查我的 agent 项目制作” | 发现主循环未组合机制、凭据/记忆不持久、分发失败、WebUI/PR 证据缺失；决定不能只改文档 | `4f88b64` |
| 08-09 15:35 | Task 14–15 | 代码审查、TypeScript、Vitest | 以 A.4-C“移除真实 LLM 后机制仍可验证”为判据 | 将治理/反馈/记忆接入 Agent；补 OpenAI/Anthropic 工具协议和 mock HTTP 测试 | `d506627` |
| 08-09 15:40 | Task 16–17 | TDD 修复循环 | 首轮测试暴露磁盘路径未使用、凭据测试写入真实 home | 改为 sql.js 原子持久化和临时目录测试；凭据改为 scrypt + AES-GCM、无默认密码 | `d506627` |
| 08-09 15:55 | Task 18–19 | build、npm pack、CLI smoke | 用实际 tarball 内容检验 README 的分发声明 | 完成 runtime factory、CLI、WebUI、package exports；`npm run lint` 与 `npm run build` 通过 | `d506627`, `2457e4f` |
| 08-09 16:00 | WebUI 验证 | Vitest | 沙箱内监听端口返回 EPERM，按工具规则在获批的沙箱外仅运行 WebUI 测试 | `/` 与 `/health` 测试通过；确认失败来自沙箱限制而非服务实现 | `d506627` |
| 08-09 16:10 | Task 20 | 文档一致性审查 | 不伪造 MR、CI、registry 或公网 URL | 重写 PLAN/README，修订 SPEC/SPEC_PROCESS，列出必须由所有者完成的外部证据 | `4f88b64` |
| 08-09 16:29 | 分发烟雾测试 | npm pack/install | 在 `/tmp` 新目录安装真实 tarball，不复用仓库源码入口 | SDK ESM import 成功，tarball 内 CLI `--help` 成功；确认 `dist`、类型声明和 LICENSE 均已打包 | `2457e4f` |
| 08-09 16:34 | 全量验证 | Vitest、tsc | 在获批的本地端口权限下运行完整离线测试 | 17 个测试文件、69 个测试全部通过；`npm run lint` 与 `npm run build` 通过 | `d506627`, `2457e4f` |
| 08-11 16:50 | 提交前复验 | npm ci、Vitest、tsc、npm pack | 从锁文件重装依赖后重新执行全部本地完成定义 | 69/69 测试、7/7 机制演示、类型检查、构建与打包全部通过；tarball SHA-1 为 `37865d68f144ae42feb49bafdfab3c0f5dccb599` | `ecc0837` |
| 08-11 17:00 | Task 19 复核 | 逐条回看课程通用要求 | 原配置只有 `.gitlab-ci.yml`，但 §4.8 还要求 GitHub Actions | 新增同等的 `unit-test`、`demo`、`package` jobs 与 tarball artifact | `6a594b3` |
| 08-11 17:05 | 安全与发布预检 | rg、Git history、npm registry | 检查当前文件、完整历史、被跟踪的敏感文件、npm 登录和包名 | 未发现真实凭据；`ise-harness` 包名未被公开占用；当前机器未登录 npm | — |
| 08-11 17:10 | 远程仓库与 PR | GitHub CLI、GitHub Actions | 创建公开仓库，以 `main` 为基线推送独立整改分支，并在 PR 中披露 Agent/人工范围 | [PR #1](https://github.com/RyanNotRain/ise-harness/pull/1) 已创建；两次触发的 `unit-test`、`demo`、`package` 均通过，tarball artifact 已产出 | `8c7e5fa`, [CI](https://github.com/RyanNotRain/ise-harness/actions/runs/31476962636) |
| 08-11 20:25 | npm 公开发布 | npm 2FA、registry 安装 | 首次 publish 暴露 npm 新的强制 2FA 和 bin 规范化要求；先修正元数据，再由项目所有者完成 npm WebAuthn | [`ise-harness@0.1.0`](https://www.npmjs.com/package/ise-harness) 发布成功；SHA-1 `dd11a0dc565801dd044b6909f11e09a3f458f734`；全新目录安装后 CLI 与 SDK 均通过 | `d564dac` |

### 本轮偏离与教训

- 未使用 Superpowers 完成这次整改：`opencode.json` 保留了原 OpenCode 的插件配置，但当前 Codex 会话没有暴露可调用的 Superpowers 技能。日志没有把普通 Codex 操作伪写成技能调用。
- 修复先从审查得到的失败验证开始：类型检查失败、tarball 缺入口、持久化跨实例测试缺失。新增细化测试时，部分实现已在同一整改会话中完成，不能声称每一行都严格留下了独立 RED commit。
- “测试全绿”只有在测试覆盖生产组装路径时才有意义；旧演示在测试专用工具里嵌入护栏，证明不了 Agent 本身安全。

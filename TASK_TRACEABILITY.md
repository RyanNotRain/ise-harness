# Task 1–20 回溯追踪表

这份表是 2026-08-13 根据 Git 历史、当前源码和测试做的事后回溯。它解决的是“一个任务现在对应哪些真实产物、如何验证”，不能补成当时已存在的 worktree 或 PR，也不把后续整改冒充原始 TDD 过程。

原始 Task 1–13 都直接提交在 `main`。Task 14–20 是提交前整改任务，后来由综合整改分支和 PR 评审。表中的 commit 均可用 `git show <hash>` 核验；“现有验证”指当前仓库能执行的测试，不表示这些测试都先于原始实现写成。

| Task | 原目标 | 真实提交 | 当前产物 | 现有验证 | 当时流程状态 |
|---|---|---|---|---|---|
| 1 | 核心类型与 MockLLM | `52cbd9f` | `src/core/types.ts`、`mock-llm.ts` | `tests/unit/core/mock-llm.test.ts` | 直接提交 main，无独立 PR |
| 2 | 文件、Bash、Grep 工具和注册表 | `08a6c11`、`6067586` | `src/tools/` | `tests/unit/tools/` | 直接提交 main，无独立 PR |
| 3 | Agent 主循环与供应商适配 | `e31d6cf` | `src/core/agent.ts`、两家 provider | `tests/unit/core/agent.test.ts`、`providers.test.ts` | 直接提交 main；后续由 Task 14–15 重构 |
| 4 | SQLite 会话记忆 | `9f8bedb`、`8d0af5b` | `src/memory/sqlite-memory.ts` | `tests/unit/memory/sqlite-memory.test.ts` | 直接提交 main；持久化与并发后来补强 |
| 5 | 代码索引与检索 | `6c4994e`、`5a56097` | `src/memory/code-index.ts` | `tests/unit/memory/code-index.test.ts` | 直接提交 main，无独立 PR |
| 6 | 上下文窗口压缩 | `c453316` | `src/memory/context-window.ts` | `tests/unit/memory/context-window.test.ts` | 直接提交 main；后续接入生产主循环 |
| 7 | 危险命令、删除保护与 HITL | `40e9208`、`7085967` | `src/governance/` | `tests/unit/governance/` | 直接提交 main；后续接入生产主循环 |
| 8 | 测试结果与用户反馈校验器 | `fcd6db8`、`955986d` | `src/feedback/` | `tests/unit/feedback/` | 直接提交 main；后续接入反馈循环 |
| 9 | JSON 配置与默认值 | `7caf22e` | `src/config/` | `tests/unit/config/loader.test.ts` | 直接提交 main，无独立 PR |
| 10 | 加密凭据与 CLI | `6f9d874` | `src/credential/`、`src/cli/` | `tests/unit/credential/credential.test.ts` | 直接提交 main；后续替换并补安全边界 |
| 11 | 三项确定性机制演示 | `40192d1` | `tests/demo/` | `npm run test:demo` | 直接提交 main；当前演示已继续补强 |
| 12 | CI 与 npm 分发 | `b9da021` | `.gitlab-ci.yml`、`package.json` | CI `unit-test/demo/package` | 与 Task 13 同一提交，无独立 PR |
| 13 | README 与课程文档 | `b9da021`、`9edfb06`、`b536022` | 根目录 Markdown 文档 | README 契约测试与人工逐项核对 | 与 Task 12 合并提交，无独立 PR |
| 14 | 将六类机制接入生产 Agent 循环 | `d506627` | `src/core/agent.ts`、runtime factory | Agent 与三项 demo 测试 | 与 Task 15–18 同一整改提交；后由 PR #1 评审 |
| 15 | 完成 OpenAI/Anthropic 工具协议 | `d506627` | `src/core/openai-provider.ts`、`anthropic-provider.ts` | `tests/unit/core/providers.test.ts` | 与 Task 14–18 同一整改提交；后由 PR #1 评审 |
| 16 | 磁盘记忆与代码索引持久化 | `d506627` | `src/memory/sqlite-memory.ts`、`code-index.ts` | memory 单测与磁盘重开 demo | 与 Task 14–18 同一整改提交；并发另由 PR #7 补强 |
| 17 | 凭据安全闭环 | `d506627` | 加密存储、隐藏输入、状态/更新/清除 | credential 单测 | 与 Task 14–18 同一整改提交；后由 PR #1 评审 |
| 18 | CLI、Node WebUI 与运行时组装 | `d506627` | `src/app/`、`src/cli/index.ts` | `tests/unit/app/`、CLI smoke | 与 Task 14–18 同一整改提交；后由 PR #1 评审 |
| 19 | 可安装 npm 包与双 CI | `2457e4f`、`6a594b3`、`d564dac` | npm 元数据、GitHub/GitLab CI | 打包、全局安装、CLI smoke | 后续由 PR #1/#2 评审，不是原始独立 worktree |
| 20 | 规约、过程与提交文档一致性 | `4f88b64`、`ecc0837` | `SPEC.md`、`PLAN.md`、过程与提交文档 | 两份课程要求逐项核对 | 后续由 PR #1 评审，不是原始独立 worktree |

## 可以核验的补救过程

- [PR #1](https://github.com/RyanNotRain/ise-harness/pull/1) 是 Task 14–20 的综合整改评审，不拆成七个虚假的旧 PR。
- [PR #7](https://github.com/RyanNotRain/ise-harness/pull/7) 留下了 SQLite 并发问题的真实 RED、GREEN、两阶段评审和 fix loop。
- [PR #13](https://github.com/RyanNotRain/ise-harness/pull/13) 与 [PR #15](https://github.com/RyanNotRain/ise-harness/pull/15) 留下工具协议记忆问题的真实回归测试、实现与 CI。
- 原始缺失项继续在 `PLAN.md`、`AGENT_LOG.md`、`REFLECTION.md` 和 `SUBMISSION_CHECKLIST.md` 中披露。这样可以证明现在的代码与证据链，但不会改写历史。

# 最终提交核对表

> 核对日期：2026-08-13
>
> 对照文件：《AI4SE 期末项目 · 通用要求》《AI4SE Final Project A · Coding Agent Harness》
>
> 判定口径：只把仓库内或公开平台上可复核的事实标为完成，不用补写材料替代不存在的历史。

## 1. 交付物与工程要求

| 要求 | 状态 | 可复核证据 |
|---|---|---|
| SPEC 包含问题、用户故事、模块规约、NFR、架构、数据、凭据/分发、技术、验收、风险 | 满足 | [`SPEC.md`](./SPEC.md) 第 1–11 节 |
| A 类领域与机制设计 | 满足 | `SPEC.md` 第 9 节；覆盖工具、反馈、危险动作、记忆及重点维度 |
| PLAN 每个 task 含目标、文件、实现、失败测试/验证、依赖 | 满足 | [`PLAN.md`](./PLAN.md) Task 1–25 |
| 至少 3 轮 brainstorming、采纳/推翻及反思 | 满足 | [`SPEC_PROCESS.md`](./SPEC_PROCESS.md) 第一、三节 |
| 陌生异类 agent 冷启动 | 补救性满足 | 7 月原始导出缺失；8 月补做的隔离会话、问题与限制见 `SPEC_PROCESS.md` 和 [`evidence/process-remediation/`](./evidence/process-remediation/) |
| 自研 Agent 主循环，不调用现成 runner | 满足 | `src/core/agent.ts`；唯一第三方运行时依赖为 sql.js，默认 embedding 也由仓库代码实现 |
| 六个维度均进入可运行闭环 | 满足 | `src/app/factory.ts` 组装决策、工具、记忆、治理、反馈和配置 |
| MockLLM 确定性单测 | 满足 | `tests/unit/core/mock-llm.test.ts`、`agent.test.ts`，CI 不调用真实供应商 |
| 三项机制演示 | 满足 | `tests/demo/`；`npm run test:demo` 共 8 项断言，记忆演示会关闭并重开磁盘数据库 |
| 重点维度有工程深度 | 满足 | 跨实例 SQLite、metadata、FIFO/大小边界、并发队列、代码索引、增量哈希、上下文压缩 |
| API key 安全录入/状态/更新/清除 | 满足 | `src/credential/`；scrypt + AES-256-GCM、目录 `0700`、文件 `0600`、无默认主密码 |
| 一键测试与 GitHub Actions | 满足 | `npm test`；`.github/workflows/ci.yml` 的 unit-test/demo/package |
| GitLab CI 中存在 `unit-test` job | 配置满足 | [`.gitlab-ci.yml`](./.gitlab-ci.yml)；课程 NJU Git 的实际流水线仍需课程平台权限 |
| npm 分发 | 满足 | [`ise-harness@0.1.4`](https://www.npmjs.com/package/ise-harness/v/0.1.4)；`latest` 正确，公共 registry 冷安装、production audit、CLI 与 SDK smoke 均通过 |
| README 必需章节 | 满足 | 简介、安装/运行/分发、key、安全边界、目录、限制、许可证均在 [`README.md`](./README.md) |
| AGENT_LOG | 满足 | [`AGENT_LOG.md`](./AGENT_LOG.md) 按时间记录技能、context、输出、人工干预、教训 |
| 1500–2500 字反思及 AI 润色标注 | 满足 | [`REFLECTION.md`](./REFLECTION.md)，正文约 2468 个字符，末尾含学生确认声明 |
| 公网 WebUI | 满足 | [GitHub Pages](https://ryannotrain.github.io/ise-harness/)；静态 MockLLM 安全边界见 [`DEPLOYMENT.md`](./DEPLOYMENT.md) |
| 公开 GitHub、提交/PR 历史、无真实凭据 | 满足 | [公开仓库](https://github.com/RyanNotRain/ise-harness)；现有 PR #1–#16；原始 Task 1–20 的真实对应关系见 [`TASK_TRACEABILITY.md`](./TASK_TRACEABILITY.md) |

## 2. 本地最终验证

Task 25 本地复验结果：

```text
npm run lint       PASS
npm test           PASS — 19 files / 102 tests
npm run test:demo PASS — 3 files / 8 tests
npm run build      PASS
npm audit          PASS — 0 vulnerabilities
npm pack           PASS — 135 files；0.1.4 候选 SHA-1 566735697824024a14c39ffda01722f17312108a
```

Task 25 由 [PR #17](https://github.com/RyanNotRain/ise-harness/pull/17) 合入，main [GitHub Actions #31658688505](https://github.com/RyanNotRain/ise-harness/actions/runs/31658688505) 的 `unit-test`、`demo`、`package` 全绿。公共 npm 0.1.4 的 SHA-1 为 `566735697824024a14c39ffda01722f17312108a`，integrity 为 `sha512-6MZVdYxmWU3b9oGt6JYUARRKTwFqJI2QuT3n6qO1z1pwZAZA0d4S6GHOmE1ga+TYMjWcelxrRMEh6KVCVXzcNA==`。空目录冷安装仅新增 2 个包，production audit 为 0，CLI 与 SDK smoke 通过。Pages [#31595587659](https://github.com/RyanNotRain/ise-harness/actions/runs/31595587659) 成功，2026-08-13 公网复查返回 HTTP 200。

## 3. 无法事后改写的两项限制

1. 原始 Task 1–20 并没有做到每个独立功能都使用 worktree、fresh subagent、TDD 两阶段评审和独立 PR。Task 21 留下完整流程样本，Task 22 使用独立 worktree 与 RED/GREEN，Task 25 又增加真实提交追溯矩阵；这些补救都不能把早期历史变成“当时已合规”。
2. 课程最终提交指定 NJU Git 仓库，并要求该平台最后一次 CI/CD 为 pass。当前只有 GitHub 仓库和 `.gitlab-ci.yml`；没有课程 NJU Git 的目标 URL/权限，因此不能虚构该平台的 pipeline 记录。

## 4. 提交者最后操作

在截止前完成并保留截图/链接：

1. 将最终 `main` 同步到课程指定的 NJU Git 仓库。
2. 在 NJU Git 确认最新 commit 对应的 `unit-test` job 和最后一次 pipeline 为 pass。
3. 提交同一个 NJU Git 仓库链接，并同时保留 GitHub、npm、Pages URL 作为外部证据。
4. 打开 Pages 三个场景各运行一次，确认截止前仍可访问。

# ise-harness

`ise-harness` 是一个用 TypeScript 自主实现的 Coding Agent Harness。它把单次 LLM 决策封装为可运行闭环：构建上下文、调用模型、解析工具动作、执行确定性护栏与 HITL、运行工具、解析客观反馈、回灌结果、持久化记忆并判断停机。

本项目的重点维度是**记忆与上下文管理**：磁盘持久化 SQLite 会话记忆、代码库语义索引、按需检索，以及上下文超限后的历史压缩。项目不依赖 LangChain、AutoGen、CrewAI 等现成 agent 主循环。

公开仓库：[RyanNotRain/ise-harness](https://github.com/RyanNotRain/ise-harness)。主体整改见 [PR #1](https://github.com/RyanNotRain/ise-harness/pull/1)，Task 21 的 worktree/TDD/双评审记录见 [PR #7](https://github.com/RyanNotRain/ise-harness/pull/7)。原始 Task 1–20 的真实提交、现有测试和后续修复对应关系整理在 [`TASK_TRACEABILITY.md`](./TASK_TRACEABILITY.md)。

课程要求逐项状态和仍需课程平台权限完成的最后一步见 [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md)。

## 功能与安全边界

- 决策：自研 `Agent.run()` 主循环；支持 OpenAI、Anthropic 和可注入 MockLLM。
- 工具：读文件、写文件和搜索工具拒绝路径或符号链接越出 `workspaceRoot`；Bash 仅把该目录设为 cwd，并不构成文件系统沙箱。
- 记忆：sql.js 数据库原子写盘，进程重启后可恢复；可选本地 embedding 代码索引。
- 治理：危险命令与系统目录删除由确定性代码拦截；CLI 可进入 HITL，超时默认拒绝；Web 模式无交互批准能力，危险动作直接拒绝。
- 反馈：测试命令输出由 `TestResultValidator` 解析，失败详情作为新消息回灌给下一轮 LLM，并受最大重试次数约束。
- 配置：默认值、`ise-harness.json` 和 SDK 构造参数可以深度合并。环境变量不合并进声明式配置对象，只承载秘密与进程参数。

安全边界不是完整操作系统沙箱。Bash 在配置的工作目录中运行，但仍继承当前用户权限；不要在包含生产凭据或关键数据的机器上运行不可信任务。规则匹配只能作为一道防线，危险部署应额外使用容器或低权限系统账户。

## 环境要求

- Node.js 20.12 或更高版本（使用内置 `.env` 加载）
- npm 10 或兼容版本
- OpenAI 或 Anthropic API key
- 代码索引默认使用无外部模型的确定性 hashing embedding；SDK 可注入自定义 `Embedder` 提升语义质量
- 已验证平台：GitHub Actions 的 Ubuntu x64，以及本地 macOS arm64。npm 包由 JavaScript、类型声明和 sql.js WASM 组成，不需要本地原生编译
- Windows 尚未进入 CI；核心运行时预期可用，但 `0700/0600` 权限位、TTY 输入和 shell 行为不能视为已验证

## 获取与分发

本项目选择 npm 包分发。仓库内可从零构建并安装：

```bash
npm ci
npm test
npm run lint
npm pack
npm install --global ./ise-harness-0.1.4.tgz
ise-harness --help
```

公开 npm registry 提供稳定版本；目标机器可执行：

```bash
npm install --global ise-harness
```

每个版本的实际 SHA 和 registry smoke 结果记录在 [`DEPLOYMENT.md`](./DEPLOYMENT.md)；仓库和 CI 不保存 npm token。

## API Key 安全配置

推荐首次运行执行：

```bash
ise-harness key set
```

CLI 会分别读取主密码和 API key，TTY 中均不回显。API key 使用 scrypt 派生密钥和 AES-256-GCM 加密，默认写入 `~/.ise-harness/credentials.enc.json`；目录权限为 `0700`，文件权限为 `0600`。主密码没有默认值，忘记后无法恢复密文。

```bash
ise-harness key view     # 只显示状态
ise-harness key update   # 更新密文
ise-harness key clear    # 清除
```

也可由 `.env` 加载 `ISE_API_KEY` 和 `ISE_MASTER_PASSWORD`，但 `.env` 是明文，且进程环境可能被同权限进程读取；不要在命令行直接 `export` 真实 key。仓库已忽略 `.env`。环境变量还可提供 `ISE_WEB_ACCESS_TOKEN`、`PORT` 和 `LOG_LEVEL`；环境变量不合并进声明式配置对象。云部署应使用平台的 Secret/Environment 管理界面，不要把值写进 `render.yaml`。

仓库提供 `.env.example`，其中只有占位值。复制后务必确认生成的 `.env` 仍被 Git 忽略。

## 初始化与运行

```bash
ise-harness init
ise-harness run "检查当前项目并修复失败测试"
```

`init` 创建 `ise-harness.json` 且不会覆盖已有配置。文件工具会强制检查 `workspaceRoot`；Bash 只以它作为工作目录，仍能按当前用户权限访问绝对路径或工作区外资源。

作为 SDK 使用：

```ts
import {
  Agent,
  MockLLMProvider,
  DangerousCommandGuard,
  TestResultValidator,
} from 'ise-harness';

const agent = new Agent({
  llmProvider: new MockLLMProvider([
    { content: '完成', toolCalls: [], stopReason: 'stop' },
  ]),
  guardrails: [new DangerousCommandGuard()],
  validators: [new TestResultValidator()],
});

const result = await agent.run('检查项目');
console.log(result.haltReason);
```

## WebUI 与部署

课程提交使用 [GitHub Pages 公网 WebUI](https://ryannotrain.github.io/ise-harness/) 托管确定性 MockLLM 演示，页面不收集 API key，也不会执行 shell。它可以交互展示危险命令拦截、测试反馈回灌和跨刷新浏览器演示记忆；完整的真实 LLM、加密凭据、工作区工具与 sql.js 记忆仍由 npm 包在目标机器运行。

GitHub Pages 由 [pages.yml](./.github/workflows/pages.yml) 自动部署，源码位于 [web-demo/](./web-demo/)；[最近一次 Pages 部署](https://github.com/RyanNotRain/ise-harness/actions/runs/31595587659) 已通过。

静态页面使用项目内原生 HTML/CSS/JS 与轻量设计 token，没有调用 Open Design skill。该选择和偏离原因在 `SPEC.md` 中如实记录；页面不把自定义样式描述为 Open Design 产物。

从源码运行 Node WebUI：

```bash
npm ci
npm run build
node dist/cli/index.js key set
# 在已被 Git 忽略的 .env 中单独设置 ISE_WEB_ACCESS_TOKEN=随机长令牌
npm run web
```

若已从 npm 全局安装，可将第三行换成 `ise-harness key set`，最后一行换成 `ise-harness web`。打开 `http://localhost:3210`。API key 与 Web 访问令牌都必须先配置；未设置 `ISE_WEB_ACCESS_TOKEN` 时后端拒绝启动。`GET /health` 用于部署健康检查；`POST /api/run` 要求 `Authorization: Bearer <token>`。

仓库保留 [render.yaml](./render.yaml) 作为可选的真实后端部署模板。若使用云后端，应在平台控制台安全设置 `ISE_API_KEY` 和 `ISE_WEB_ACCESS_TOKEN`，不要提交真实值；课程公开 Pages 演示不需要任何 Secret。

## 机制演示

以下命令完全使用 MockLLM，不需要网络或真实 key：

```bash
npm run test:demo
```

它确定性演示：

1. 危险 shell 动作在 Agent 主循环内被治理护栏拦截；
2. 注入测试失败后，校验器将反馈回灌，MockLLM 的下一步从测试变为修复；
3. 重点维度的磁盘持久化（关闭数据库后重新打开）、会话隔离和清除行为。

## 开发与验证

```bash
npm ci
npm test          # 离线单元测试与机制演示
npm run test:demo
npm run lint      # TypeScript 严格检查
npm run build
npm pack
```

GitHub Actions 与 GitLab CI 都包含 `unit-test`、`demo` 和 `package` job。每次 push 会执行类型检查、离线测试、构建 npm 包、全局安装 tarball，并运行 CLI 烟雾测试；两套 CI 都会保留 npm tarball 作为短期 artifact。

提交前针对记忆并发做了一个独立的 Superpowers/TDD 补充任务。旧实现在 25 个并发 `store()` 时会争用同一个临时文件；该任务留下了单独的 RED、GREEN、spec review、quality review 和两轮 fix commit，过程材料在 [`evidence/process-remediation/`](./evidence/process-remediation/)。之后的 Task 22 又逐条复核课程要求，新增了安全、配置和重点维度边界测试。当前数字以最新 CI 和 `SUBMISSION_CHECKLIST.md` 为准。SQLiteMemory 只保证同一个实例内的调用顺序，不提供跨进程文件锁。

## 目录结构

```text
src/
├── app/          # 运行时组装与 WebUI
├── cli/          # CLI 入口
├── config/       # 声明式配置
├── core/         # 自研 Agent 主循环与 LLM 适配层
├── credential/   # 加密凭据持久化
├── feedback/     # 确定性反馈校验器
├── governance/   # 护栏与 HITL
├── memory/       # 持久化记忆、代码索引、上下文压缩
└── tools/        # 工作区受限工具
tests/
├── unit/         # 确定性单元测试
└── demo/         # 三项课程机制演示
```

## 已知限制

- shell 护栏是确定性规则引擎，不等价于 OS 沙箱；复杂混淆命令仍应由人工拒绝。
- Bash 的 `workspaceRoot` 只是 cwd，不限制绝对路径，也不阻止命令访问工作区外资源。
- WebUI 当前是单机演示界面，没有用户账户和任务队列；公网部署必须配置访问令牌。
- 代码索引默认关闭；启用后使用内置的离线 hashing embedding，不下载模型，但同义词、跨语言等语义检索质量有限。SDK 用户可注入其他 `Embedder`。
- OpenAI/Anthropic 的线上调用不在 CI 中执行，供应商协议通过 mock HTTP 测试验证。
- sql.js 适合课程规模项目；高并发写入应迁移到原生 SQLite 服务。

## 第三方依赖与许可证

- `sql.js`：MIT，用于 SQLite/WASM 存储。
- `TypeScript`：Apache-2.0；`Vitest`：MIT；`tsx`：MIT；`@types/node`：MIT。这些依赖仅用于开发、类型检查和测试。

项目自身使用 [MIT License](./LICENSE)。

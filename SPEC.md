# SPEC.md — ise-harness: Coding Agent Harness

> 文档基线：0.1.x
> 重点维度：记忆与上下文管理

---

## 1. 问题陈述

### 1.1 要解决的问题

LLM 本身只是一个"下一步决策引擎"——它不持有工具、不管理上下文、不记住历史、不自我约束。要让 LLM 可靠地完成编码任务，需要一层工程封装：**Coding Agent Harness**。

ise-harness 是一个面向开发者的 SDK，用于构建自己的编码智能体。它把 LLM 的"思考"封装成可工程化的系统——包括工具的注册与分发、跨会话记忆、上下文窗口管理、危险动作拦截、客观反馈闭环。

### 1.2 目标用户

使用 LLM 构建编码 agent 的开发者。他们需要一套可组合、可测试的 harness 组件，而不是从零搭建 agent 主循环和治理基础设施。

### 1.3 为什么值得做

现有方案（LangChain、AutoGen、CrewAI 等）要么过于重量级，要么将核心机制（治理、反馈）寄托于提示词而非代码。ise-harness 坚持"机制即代码"——所有核心行为在移除 LLM 后仍可通过单元测试验证。

---

## 2. 用户故事

| ID | 故事 | 优先级 |
|----|------|--------|
| US-1 | 作为开发者，我想传入 API key 和模型名称就能创建一个 agent 实例，无需关心底层 LLM 调用细节。 | P0 |
| US-2 | 作为开发者，我想给 agent 注册一组工具（读文件、写文件、执行 shell、搜索内容），这样 agent 能对文件系统进行操作。 | P0 |
| US-3 | 作为开发者，我想让 agent 在两次会话之间记住项目约定和历史决策，这样不用每次重复告诉它。 | P0 |
| US-4 | 作为开发者，我想让 agent 自动索引项目代码并通过语义检索相关知识，这样它能在不超出上下文窗口的情况下理解项目结构。 | P0 |
| US-5 | 作为开发者，我想配置一条护栏规则，当 agent 试图执行危险命令时自动拦截并要求我确认，防止误操作。 | P0 |
| US-6 | 作为开发者，我想让 agent 运行测试并自动解析结果，测试失败时能根据反馈自我修正。 | P1 |
| US-7 | 作为开发者，我想通过配置文件声明 agent 的行为（模型、工具、护栏规则），不需要修改代码。 | P1 |
| US-8 | 作为开发者，我想在测试中使用 mock LLM 替代真实模型，这样 CI 不依赖网络和 API 费用。 | P0 |
| US-9 | 作为开发者，我想让 agent 在上下文窗口接近上限时自动压缩历史，这样长对话不会中断。 | P1 |
| US-10 | 作为开发者，我想用 SQLite 持久化存储 agent 的记忆，这样 agent 重启后仍能访问历史信息。 | P0 |
| US-11 | 作为验收者，我想通过受访问令牌保护的 WebUI 提交任务并查看结果，这样无需安装 CLI 也能体验核心闭环。 | P0 |

---

## 3. 功能规约

### 3.1 核心模块：Agent 主循环（`src/core/`）

**`Agent` 类**
- 输入：`LLMProvider`、工具列表、记忆与代码索引实例、上下文窗口、护栏列表、可选 HITL、校验器列表、事件回调
- 行为：
  1. 收集上下文（系统提示 + 记忆检索 + 当前对话历史）
  2. 调用 LLM 获取下一步动作
  3. 解析 LLM 响应为结构化动作（工具调用 / 文本响应 / 停机）
  4. 分发动作（经护栏检查后执行对应工具）
  5. 收集工具执行结果，回灌到上下文
  6. 运行校验器获取反馈
  7. 判断停机条件：最大轮数 / 任务完成 / 错误
- 输出：执行结果（含对话历史、反馈记录、最终产物）

**`LLMProvider` 接口**
- 定义抽象接口：`chat(messages, options) → ChatResponse`
- 实现 OpenAI 兼容接口，支持 Anthropic 适配
- 支持 Mock 注入用于确定性测试

**`MockLLMProvider`**
- 注入预定义的响应序列，用于确定性测试
- 按序列顺序返回响应，耗尽后抛出错误

### 3.2 记忆模块（`src/memory/`）—— 重点维度

**`Memory` 接口**
- `store(sessionId, entry)` — 写入记忆条目
- `retrieve(sessionId, limit)` — 按时间倒序检索最近的记忆
- `clear(sessionId)` — 清除会话记忆
- `summarize(sessionId)` — 获取会话摘要

#### 3.2.1 `SQLiteMemory`（跨会话记忆）
- 使用 sql.js 的 SQLite 格式存储对话历史；非 `:memory:` 路径在每次写操作后原子导出到磁盘
- 表结构：
  - `sessions`: id, created_at, updated_at, summary
  - `entries`: id, session_id, role, content, tool_calls(JSON，可空), tool_call_id(可空), metadata(JSON，可空), timestamp
  - `decisions`: id, session_id, context, decision, rationale, timestamp
- 边界：单条目最大 100KB，单会话最大 10000 条

#### 3.2.2 `CodeIndexMemory`（代码库知识索引）
- 扫描项目文件，提取文件内容
- 默认使用仓库实现的确定性 hashing embedding；SDK 可注入其他 `Embedder`
- 按用户查询执行语义检索（余弦相似度排序）
- 排除 node_modules、dist、.git 等目录
- 支持增量更新（通过文件哈希判断是否变更）
- `indexDirectory` 扫描工作区，排除 node_modules、dist、.git，跳过超大文件

#### 3.2.3 `ContextWindowMemory`（上下文窗口管理）
- 监控 token 使用量（估算：约 4 字符/token）
- 当使用量超过阈值（默认 85%）时，将旧对话压缩为摘要
- 保留最近 N 轮对话完整内容（默认 5 轮）
- 摘要由用户提供的摘要函数生成（测试中可用 mock）

### 3.3 工具模块（`src/tools/`）

**`Tool` 接口**
- `name: string` — 工具名称
- `description: string` — 工具描述
- `parameters: JSONSchema` — 参数 schema
- `execute(args) → ToolResult` — 执行工具

**内置工具（最小集）：**
- `ReadFile` — 读取文件内容，支持行范围
- `WriteFile` — 写入文件内容
- `Bash` — 执行 shell 命令，返回 stdout/stderr/exit code
- `Grep` — 搜索文件内容

**工具注册与范围：**
- `Agent` 构造时注入工具；`ToolRegistry` 可管理注册、查找和模型工具 schema
- 文件工具将路径解析到 `workspaceRoot`，拒绝 `..` 或绝对路径逃逸
- Bash 固定以 `workspaceRoot` 为 cwd，并在主循环中接受护栏检查

### 3.4 治理模块（`src/governance/`）

**`Guardrail` 接口**
- `check(action) → GuardrailResult` — 检查动作是否安全
- `result.allowed: boolean` — 是否放行
- `result.reason: string` — 拦截原因
- `result.severity: 'info' | 'warn' | 'block'`

**内置护栏：**
- `DangerousCommandGuard` — 匹配危险 shell 命令模式（`rm -rf /`、`dd`、`mkfs`、`fdisk`、`shutdown`、`reboot` 等）
- `FileDeletionGuard` — 拦截删除重要目录的操作（`/etc`、`/usr`、`/bin`、`.git` 等）

**HITL（人机协作）：**
- 当护栏拦截危险动作时，暂停执行
- 向用户展示：动作描述 + 风险等级 + 原因
- 等待用户选择：允许 / 拒绝
- 超时默认拒绝

### 3.5 反馈模块（`src/feedback/`）

**`Validator` 接口**
- `validate(result) → Feedback` — 校验执行结果
- `feedback.passed: boolean` — 是否通过
- `feedback.summary: string` — 摘要
- `feedback.details: string` — 详细反馈
- `feedback.suggestions: string[]` — 修正建议

**内置校验器：**
- `TestResultValidator` — 解析测试输出，判定 pass/fail，提取失败信息
- `UserFeedbackValidator` — 接收用户输入作为反馈

**反馈回灌：**
- 当校验器检测到失败时，将失败信息回灌到 agent 上下文
- agent 可根据反馈决定下一步修正动作
- 最多允许 N 次修正尝试（可配置，默认 3 次）

### 3.6 配置模块（`src/config/`）

**配置来源（优先级从高到低）：**
1. 构造函数参数
2. 配置文件（`ise-harness.json`）
3. 默认值

环境变量只承载 `ISE_API_KEY`、`ISE_MASTER_PASSWORD`、`ISE_WEB_ACCESS_TOKEN`、`PORT` 和 `LOG_LEVEL` 等运行时秘密/进程参数，不合并进可序列化配置对象。

**配置项：**
- `model`: provider、model、baseURL、maxTokens、temperature；API key 禁止写入 JSON 配置
- `memory`: type、path、codeIndex（enabled + excludePatterns）、contextWindow（maxTokens + compressionThreshold）
- `tools`: 启用的工具列表
- `guardrails`: dangerousCommands、fileDeletion、hitlTimeout
- `feedback`: validators、maxRetries
- `web`: port；公网访问令牌仅来自环境变量，不进入配置文件

### 3.7 CLI 与 WebUI（`src/cli/`、`src/app/`）

- `init`：创建默认配置且不覆盖已有文件
- `key set/view/update/clear`：管理加密凭据，状态查询不回显明文
- `run`：加载配置、凭据和完整运行时，执行一次编码任务
- `index`：使用可选本地 embedding 建立代码索引
- `web`：只有配置了 `ISE_WEB_ACCESS_TOKEN` 才允许启动 WebUI；`POST /api/run` 必须携带匹配的 Bearer token
- Web 模式没有交互式 HITL，所有被拦截动作默认拒绝

---

## 4. 非功能性需求

### 4.1 性能
- 主循环不得在单轮中重复初始化数据库或 embedding 模型
- 相同哈希的文件不得重复生成 embedding
- 上下文超过配置阈值时必须压缩旧历史，避免无限增长
- 本项目不承诺固定毫秒指标；性能受设备、WASM 与本地模型影响，验收以不重复初始化/embedding、边界测试和可重复演示为准

### 4.2 安全（凭据威胁模型）

**威胁：** API key 泄露（通过源码、Git 历史、终端日志、环境变量转储）

**对策：**
- Key 通过权限为 `0600` 的加密文件存储（scrypt + AES-256-GCM + 随机 salt/IV + 主密码）
- 环境变量 `.env` 支持（文档说明明文风险）
- 首次运行通过 `key set` 引导用户录入 key 和主密码（TTY 不回显）
- 提供 `key set`（录入）/ `key view`（显示状态，不回显明文）/ `key clear`（清除）命令
- 运行时 key 仅存在于进程内存中，不在日志中输出
- `.env` 加入 `.gitignore`
- 无默认主密码；错误主密码或密文篡改必须拒绝解密
- WebUI 可配置独立访问令牌，避免公网用户滥用服务端 API key

### 4.3 可用性
- 提供 CLI 命令：`ise-harness key`（管理 key）、`ise-harness run`（运行 agent）
- 清晰的错误信息，包含修复建议
- 首次运行引导流程

### 4.4 可观测性
- `AgentRunResult.events` 返回结构化事件；`LOG_LEVEL=debug` 时输出 JSON Lines
- LLM 事件记录轮次、停机原因与供应商返回的 token 消耗
- 工具、护栏、反馈和记忆检索均产生事件，但不记录 API key 或主密码

---

## 5. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     Agent Loop                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐         │
│  │ Context   │→ │ LLM Call │→ │ Action Parser │         │
│  │ Builder   │  │          │  │ (tool/text/   │         │
│  │           │  │          │  │  halt)         │         │
│  └──────────┘  └──────────┘  └──────────────┘         │
│                                    │                    │
│                                    ▼                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐         │
│  │ Feedback  │← │ Executor  │← │ Guardrails    │         │
│  │ Loop      │  │ (Tool)    │  │ + HITL        │         │
│  └──────────┘  └──────────┘  └──────────────┘         │
│       │                                                │
│       ▼                                                │
│  ┌──────────────────────────────────────────────┐     │
│  │          Memory Subsystem (FOCUS)            │     │
│  │  ┌──────────┐ ┌────────────┐ ┌───────────┐  │     │
│  │  │ SQLite   │ │ Code Index │ │ Context    │  │     │
│  │  │ Memory   │ │ (Hashing)  │ │ Window Mgr │  │     │
│  │  └──────────┘ └────────────┘ └───────────┘  │     │
│  └──────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  LLM Provider   │
│  (OpenAI/Claude │
│   /Mock)        │
└─────────────────┘
```

### 外部依赖

| 依赖 | 用途 | 替代方案 |
|------|------|---------|
| sql.js | SQLite/WASM 持久化记忆存储 | 文件系统 JSON |
| OpenAI API / Anthropic API | LLM 调用 | 本地 Ollama |
| Node.js `crypto` | 默认 hashing embedding | 用户注入实现 `Embedder` 接口的适配器 |

---

## 6. 数据模型

### SQLite 记忆存储

```
sessions
├── id: TEXT PRIMARY KEY
├── created_at: TEXT (ISO 8601)
├── updated_at: TEXT (ISO 8601)
└── summary: TEXT (LLM 生成的会话摘要)

entries
├── id: INTEGER PRIMARY KEY AUTOINCREMENT
├── session_id: TEXT → sessions.id
├── role: TEXT ('user' | 'assistant' | 'tool' | 'system')
├── content: TEXT
├── tool_calls: TEXT (JSON，可空；assistant 的结构化工具调用)
├── tool_call_id: TEXT (可空；tool 结果关联 ID)
├── metadata: TEXT (JSON，可空)
└── timestamp: TEXT (ISO 8601)

code_index
├── id: INTEGER PRIMARY KEY AUTOINCREMENT
├── file_path: TEXT
├── file_hash: TEXT (SHA256, 用于增量更新)
├── content: TEXT
├── embedding: BLOB (FLOAT32 向量)
├── updated_at: TEXT (ISO 8601)
└── UNIQUE(file_path)
```

### 配置 Schema

```typescript
interface HarnessConfig {
  workspaceRoot: string;
  model: {
    provider: 'openai' | 'anthropic' | 'mock';
    model: string;
    maxTokens: number;
    temperature: number;
    baseURL?: string;
  };
  memory: {
    type: 'sqlite';
    path: string;
    codeIndex: { enabled: boolean; excludePatterns: string[] };
    contextWindow: { maxTokens: number; compressionThreshold: number };
  };
  tools: string[];
  guardrails: {
    dangerousCommands: boolean;
    fileDeletion: boolean;
    hitlTimeout: number;
  };
  feedback: {
    validators: string[];
    maxRetries: number;
  };
  web: { port: number };
}
```

---

## 7. 凭据与分发设计

### 7.1 API Key 安全存储

**方案：** 权限受控的加密文件 + 主密码（scrypt + AES-256-GCM）

**流程图：**
```
首次运行
  ├─ 检查配置/环境变量 ISE_API_KEY
  │   ├─ 存在 → 使用
  │   └─ 不存在 → 进入下一步
  ├─ 检查 ~/.ise-harness/credentials.enc.json 中是否已有 key
  │   ├─ 存在 → 使用
  │   └─ 不存在 → 提示用户输入（隐藏输入，不回显）
  └─ 存入加密文件 → 完成

用户操作：
  ise-harness key set     → 提示输入新 key（隐藏输入）
  ise-harness key view    → 显示"已配置"/"未配置"（不显示明文）
  ise-harness key clear   → 删除加密文件中的 key
```

### 7.2 分发形态

**方案：** npm 包

- 安装：`npm install -g ise-harness`
- 作为 SDK：`npm install ise-harness --save`
- 提供 CLI 命令 `ise-harness`
- `npm pack` 必须包含 `dist/`、声明文件、CLI 与 LICENSE
- CI 将 tarball 全局安装后运行 `ise-harness --help`
- 课程演示 WebUI 使用 GitHub Pages 部署 `web-demo/` 中的无凭据 MockLLM 静态页面；完整 Node WebUI 可本地运行，`render.yaml` 仅作为可选后端模板
- 公网 URL、部署流水线与最后一次检查记录写入 `DEPLOYMENT.md`

---

## 8. 技术选型与理由

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全、生态丰富、适合 SDK 开发 |
| 运行时 | Node.js 20.12+ | 原生 fetch、内置 `.env` 加载、CI 与部署环境一致 |
| 测试 | Vitest | 快速、兼容 Jest API、ESM 原生支持 |
| 数据库 | sql.js | 无原生编译依赖，可导出标准 SQLite 数据库 |
| 凭据存储 | scrypt + AES-256-GCM 加密文件 | 跨平台、密文认证、无需硬编码默认密码 |
| 本地 Embedding | 自研 signed feature hashing | 无模型下载、确定性、可离线测试；用检索质量换取安全与可复现性 |
| LLM 客户端 | 原生 fetch + 自研协议适配 | 仅使用供应商单次 API，不引入现成 agent runner |
| 分发 | npm | 覆盖开发者 SDK 场景 |
| 部署 | GitHub Pages + 可选 Node WebUI | Pages 免费且不需要银行卡，用无凭据 MockLLM 安全展示机制；真实 LLM 能力由本地 npm 包提供 |
| UI 设计 | 项目内轻量设计 token 与原生 HTML/CSS/JS | 本次静态演示未调用 Open Design skill；这是对课程“强烈推荐”项的公开偏离，而非冒充已使用。页面优先保证可访问性、响应式布局和安全边界说明 |

### 8.1 前端设计说明

项目后期为满足公网 WebUI 交付增加了静态演示页。当前界面没有采用 Open Design 的现成设计系统，也没有触发 Open Design skill；视觉规范由 `web-demo/styles.css` 中的颜色、间距、圆角和字体 token 统一管理。选择轻量原生实现，是为了让 Pages 构建不依赖外部运行时，并确保演示不接收 API key、不执行 shell。若继续迭代，应在设计冻结前引入 Open Design，并把相应 skill 调用与人工修改记录到 `AGENT_LOG.md`。

---

## 9. 领域与机制设计

### 9.1 领域特征与设计影响

| 维度 | Coding 领域特征 | 设计影响 |
|------|----------------|---------|
| 工具 | 读写文件、执行 shell、搜索代码 | 工具集固定，可预定义 |
| 反馈 | 测试结果、lint 错误 = 客观、结构化 | 可编程解析，无需 LLM 判断 |
| 危险动作 | 删除文件、危险 shell 命令 | 模式匹配即可拦截，确定性代码实现 |
| 记忆 | 项目结构、约定、历史决策 | 跨会话 + 代码索引 + 上下文压缩 |

### 9.2 重点维度：记忆与上下文管理

**选择理由：** 记忆是 coding agent 在真实项目中长期使用的核心瓶颈。没有记忆的 agent 每次启动都是"新员工"；有了记忆，agent 才能积累项目知识、理解历史上下文。

**三种记忆机制：**

**SQLiteMemory（跨会话记忆）**
- 代码实现：`Memory` 接口 → `SQLiteMemory` 类
- 核心操作：SQL INSERT/SELECT
- 可测试性：使用 `:memory:` SQLite 数据库，无需真实 LLM
- 单测验证：存一条记录 → 检索 → 断言返回正确

**CodeIndexMemory（代码索引）**
- 代码实现：扫描文件 → 生成 embedding → 存入 SQLite → 语义检索
- 可测试性：使用 mock embedding 函数（返回固定向量），不依赖真实模型
- 单测验证：索引一个虚拟文件 → 查询 → 断言返回相关片段

**ContextWindowMemory（上下文压缩）**
- 代码实现：token 计数 → 超出阈值 → 压缩旧对话
- 可测试性：注入 mock 摘要函数，不依赖真实 LLM
- 单测验证：填充 N 条对话 → 触发压缩 → 断言被压缩为摘要

### 9.3 机制必须是代码，不能是提示词

所有核心机制均在移除真实 LLM 后可通过确定性单元测试验证：

| 机制 | 代码实现 | 单测验证方式 |
|------|---------|-------------|
| 工具分发 | `ToolRegistry` 类 | 注册工具 → 查找 → 断言找到 |
| 护栏拦截 | `DangerousCommandGuard.check()` | 传入 `"rm -rf /"` → 断言 `{ allowed: false }` |
| 反馈解析 | `TestResultValidator.validate()` | 注入 mock 测试输出 → 断言解析为 pass/fail |
| 记忆读写 | `SQLiteMemory.store/retrieve` | 存 100 条 → 检索 → 断言返回正确 |
| 上下文压缩 | `ContextWindowMemory.addAndCheck` | 填充超阈值 → 断言触发压缩 |
| 停机判断 | `Agent.run()` 的 maxTurns 逻辑 | 设置 maxTurns=3 → 断言 3 轮后停止 |

---

## 10. 验收标准

| 功能 | 验收标准 |
|------|---------|
| Agent 主循环 | 通过 mock LLM 验证：给定输入 → 调用 LLM → 解析动作 → 执行工具 → 返回结果 |
| 多 LLM 提供者 | Mock 验证循环；mock HTTP 验证 OpenAI/Anthropic 工具请求与响应协议 |
| SQLite 记忆 | 实例 A 写盘并关闭，实例 B 使用相同路径恢复记录 |
| 代码索引 | 索引一个文件，查询后返回相关片段 |
| 上下文压缩 | 超出阈值后对话被压缩为摘要，断言 token 数减少 |
| 护栏拦截 | 对危险命令返回 block，对安全命令放行 |
| HITL | 拦截时暂停并等待用户输入，超时默认拒绝 |
| 反馈解析 | 解析测试输出，正确判定 pass/fail |
| 配置加载 | 加载 JSON 配置，正确合并默认值 |
| Mock LLM | 替换 MockLLMProvider 后，所有核心测试通过 |
| 凭据管理 | key set → key view（不显示明文）→ key clear 流程完整 |
| 分发 | `npm pack` → 全局安装 tarball → `ise-harness --help` 可运行 |
| WebUI | Pages 公网 URL 返回 200 并可运行三项 MockLLM 演示；本地 Node WebUI 未配置访问令牌时拒绝启动，已配置时 `/health` 返回 200 且未授权 `/api/run` 返回 401 |

---

## 11. 风险与未决问题

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 默认 hashing embedding 语义能力有限 | 同义词或跨语言代码检索不准确 | SDK 用户可注入更高质量 `Embedder`；验收测试使用可控向量 |
| 本地 embedding 质量不足 | 代码检索不准确 | SDK 用户可注入实现 `Embedder` 接口的替代适配器；CLI 暂无外部 embedding 配置项 |
| 上下文窗口压缩丢失关键信息 | agent 忘记重要上下文 | 保留最近 5 轮对话的完整内容，仅压缩更早的历史 |
| 加密文件方案依赖主密码安全性 | 主密码泄露导致 key 泄露 | 无默认密码、隐藏录入、限制文件权限；生产可迁移系统钥匙串 |
| shell 规则不能覆盖所有混淆语法 | 危险动作漏报 | 工作区隔离、默认拒绝 HITL、公网模式禁止批准，并建议容器/低权限用户 |
| 部署文件系统可能是临时的 | 重启后记忆丢失 | 课程演示记录限制；生产部署挂载持久卷或外接数据库 |

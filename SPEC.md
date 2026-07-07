# SPEC.md — ise-harness: Coding Agent Harness

> Version: 0.1.0 (draft)
> Focus Dimension: Memory & Context Management

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

| ID | 故事 | 优先级 | INVEST |
|-----|------|--------|--------|
| US-1 | 作为开发者，我想传入一个 API key 和模型名称就能创建一个 agent 实例，这样我无需关心底层 LLM 调用的细节。 | P0 | ✓ |
| US-2 | 作为开发者，我想给 agent 注册一组工具（读文件、写文件、执行 shell），这样 agent 能对文件系统进行操作。 | P0 | ✓ |
| US-3 | 作为开发者，我想让 agent 在两次会话之间记住项目约定和历史决策，这样我不用每次重复告诉它。 | P0 | ✓ |
| US-4 | 作为开发者，我想让 agent 自动索引项目代码并通过 RAG 检索相关知识，这样它能在不超出上下文窗口的情况下理解项目结构。 | P0 | ✓ |
| US-5 | 作为开发者，我想配置一条护栏规则，当 agent 试图执行危险命令时自动拦截并要求我确认，这样防止误操作。 | P0 | ✓ |
| US-6 | 作为开发者，我想让 agent 运行测试并自动解析结果，测试失败时它能根据反馈自我修正。 | P1 | ✓ |
| US-7 | 作为开发者，我想通过配置文件声明 agent 的行为（模型、工具、护栏规则），而不需要修改代码。 | P1 | ✓ |
| US-8 | 作为开发者，我想在测试中使用 mock LLM 替代真实模型，这样我的 CI 不依赖网络和 API 费用。 | P0 | ✓ |
| US-9 | 作为开发者，我想让 agent 在上下文窗口接近上限时自动压缩历史，这样长对话不会中断。 | P1 | ✓ |
| US-10 | 作为开发者，我想用 SQLite 持久化存储 agent 的记忆，这样 agent 重启后仍能访问历史信息。 | P0 | ✓ |

---

## 3. 功能规约

### 3.1 核心模块：Agent 主循环 (`src/core/`)

**`Agent` 类**
- **输入**: `LLMProvider`、工具列表、记忆实例、护栏列表、校验器列表
- **行为**:
  1. 收集上下文（系统提示 + 记忆检索 + 当前对话历史）
  2. 调用 LLM 获取下一步动作
  3. 解析 LLM 响应为结构化动作（工具调用 / 文本响应 / 停机）
  4. 分发动作（经护栏检查后执行对应工具）
  5. 收集工具执行结果，回灌到上下文
  6. 运行校验器获取反馈
  7. 判断停机条件：最大轮数 / 任务完成 / 错误
- **输出**: 执行结果（含对话历史、反馈记录、最终产物）

**`LLMProvider` 接口**
- 定义抽象接口：`chat(messages, options) → ChatResponse`
- 实现 OpenAI 兼容接口（覆盖 OpenAI、Anthropic、本地模型等）
- 支持流式与非流式

**`MockLLMProvider`**
- 注入预定义的响应序列，用于确定性测试
- 支持按输入内容匹配不同响应

### 3.2 记忆模块 (`src/memory/`)

**`Memory` 接口**
- `store(sessionId, entry)` — 写入记忆条目
- `retrieve(sessionId, query, limit)` — 按语义检索相关记忆
- `summarize(sessionId)` — 压缩历史为摘要
- `clear(sessionId)` — 清除会话记忆

**三种记忆实现：**

**3.2.1 `SQLiteMemory`**（跨会话记忆）
- 使用 SQLite 存储对话历史、决策记录、项目约定
- 表结构：
  - `sessions`: session_id, created_at, summary, metadata
  - `entries`: id, session_id, role, content, timestamp, embedding
  - `decisions`: id, session_id, context, decision, rationale
- 边界：单条目最大 100KB，单会话最大 10000 条

**3.2.2 `CodeIndexMemory`**（代码库知识索引）
- 扫描项目文件，提取关键信息（函数签名、类定义、导出）
- 使用轻量级本地 embedding 生成向量
- 按用户查询执行语义检索
- 排除 node_modules、dist、.git 等目录
- 支持增量更新（仅索引变更文件）

**3.2.3 `ContextWindowMemory`**（上下文窗口管理）
- 监控 token 使用量
- 当接近上限时，将旧对话压缩为摘要
- 摘要由 LLM 生成（也可由用户提供摘要函数）
- 保留最近 N 轮对话完整内容

### 3.3 工具模块 (`src/tools/`)

**`Tool` 接口**
- `name: string` — 工具名称
- `description: string` — 工具描述（供 LLM 选择）
- `parameters: JSONSchema` — 参数 schema
- `execute(args) → ToolResult` — 执行工具

**内置工具（最小集）：**
- `ReadFile` — 读取文件内容，支持行范围
- `WriteFile` — 写入文件内容
- `EditFile` — 精确替换文件内容
- `Bash` — 执行 shell 命令，返回 stdout/stderr/exit code
- `Glob` — 按 glob 模式匹配文件名
- `Grep` — 搜索文件内容
- `RunTest` — 运行测试并解析结果

**工具注册：**
- `agent.registerTool(tool)` — 运行时注册
- 工具列表通过 LLM 的 tool calling 机制暴露

### 3.4 治理模块 (`src/governance/`)

**`Guardrail` 接口**
- `check(action) → GuardrailResult` — 检查动作是否安全
- `result.allowed: boolean` — 是否放行
- `result.reason: string` — 拦截原因
- `result.severity: 'info' | 'warn' | 'block'`

**内置护栏：**
- `DangerousCommandGuard` — 匹配危险 shell 命令模式（`rm -rf /`、`dd`、`mkfs`、`> /dev/sda` 等）
- `FileDeletionGuard` — 拦截删除重要目录的操作
- `NetworkGuard` — 限制对外网络请求

**HITL (Human-in-the-Loop)：**
- 当护栏拦截危险动作时，暂停执行
- 向用户展示：动作描述 + 风险等级 + 预计影响
- 等待用户选择：允许 / 拒绝 / 修改后执行
- 超时默认拒绝

### 3.5 反馈模块 (`src/feedback/`)

**`Validator` 接口**
- `validate(result) → Feedback` — 校验执行结果
- `feedback.passed: boolean` — 是否通过
- `feedback.details: string` — 详细反馈
- `feedback.suggestions: string[]` — 修正建议

**内置校验器：**
- `TestResultValidator` — 解析测试输出（兼容 TAP、JUnit、Vitest），判定 pass/fail，提取失败信息
- `LintValidator` — 运行 lint 并解析结果
- `TypeCheckValidator` — 运行类型检查并解析结果
- `UserFeedbackValidator` — 接收用户输入作为反馈

**反馈回灌：**
- 当校验器检测到失败时，将失败信息回灌到 agent 上下文
- agent 可根据反馈决定下一步修正动作
- 最多允许 N 次修正尝试（可配置，默认 3 次）

### 3.6 配置模块 (`src/config/`)

**配置来源（优先级从高到低）：**
1. 构造函数参数
2. 配置文件（ise-harness.yaml / ise-harness.json）
3. 环境变量
4. 默认值

**配置项：**
```yaml
model:
  provider: openai  # openai | anthropic | local
  model: gpt-4
  api_key: "${OPENAI_API_KEY}"  # 从环境变量读取
  max_tokens: 4096

memory:
  type: sqlite
  path: ./ise-memory.db
  code_index:
    enabled: true
    exclude_patterns: ["node_modules", "dist", ".git"]
  context_window:
    max_tokens: 128000
    compression_threshold: 0.85  # 超过 85% 时触发压缩

tools:
  enabled: [read_file, write_file, edit_file, bash, glob, grep, run_test]

guardrails:
  dangerous_commands: true
  file_deletion: true
  network_access: false
  hitl_timeout: 30  # 秒

feedback:
  validators: [test_result, lint, type_check, user]
  max_retries: 3
```

---

## 4. 非功能性需求

### 4.1 性能
- 单次 LLM 调用延迟取决于上游 API，harness 本身开销 < 50ms
- 记忆检索延迟 < 100ms（SQLite 本地查询）
- 代码索引首次构建时间：1000 文件 < 30 秒
- 增量索引 < 2 秒

### 4.2 安全（凭据威胁模型）
- **威胁**: API key 泄露（通过源码、Git 历史、终端日志、环境变量转储）
- **对策**:
  - Key 通过系统钥匙串（macOS Keychain）或加密文件存储
  - 环境变量 `.env` 支持（文档说明明文风险）
  - 首次运行引导用户录入 key（隐藏输入，不回显）
  - 提供 `key view`（显示是否已配置，不回显明文）/ `key update` / `key clear` 命令
  - 运行时 key 仅存在于进程内存中，不在日志中输出
  - `.env` 加入 `.gitignore`，CI 中通过 CI secrets 注入

### 4.3 可用性
- 提供 CLI 交互命令：`ise-harness init`（初始化项目配置）、`ise-harness key`（管理 key）、`ise-harness run`（运行 agent）
- 清晰的错误信息，包含修复建议
- 首次运行引导流程

### 4.4 可观测性
- 结构化日志（JSON Lines），支持 `LOG_LEVEL=debug`
- 每步 LLM 调用记录 token 消耗
- 护栏拦截记录（动作、原因、用户决策）
- 记忆操作记录（检索、存储、压缩）

---

## 5. 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    Agent Loop                        │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Context  │→ │ LLM Call │→ │ Action Parser     │  │
│  │ Builder  │  │          │  │ (Tool Call / Text) │  │
│  └─────────┘  └──────────┘  └───────────────────┘  │
│                                  │                  │
│                                  ▼                  │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Feedback │← │ Executor  │← │ Guardrails         │  │
│  │ Loop     │  │ (Tool)    │  │ (HITL if block)    │  │
│  └─────────┘  └──────────┘  └───────────────────┘  │
│       │                                            │
│       ▼                                            │
│  ┌─────────────────────────────────────────────┐   │
│  │        Memory Subsystem                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │ SQLite   │ │ Code     │ │ Context    │  │   │
│  │  │ Memory   │ │ Index    │ │ Window Mgr │  │   │
│  │  └──────────┘ └──────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  LLM Provider   │
│  (OpenAI/Claude │
│   /Local/Mock)  │
└─────────────────┘
```

### 外部依赖
| 依赖 | 用途 | 替代方案 |
|------|------|---------|
| SQLite (better-sqlite3) | 持久化记忆存储 | 文件系统 JSON |
| OpenAI API | LLM 调用 | Anthropic API, 本地 Ollama |
| keytar | macOS Keychain 访问 | 加密文件 + 主密码 |
| @xenova/transformers | 本地 embedding 生成 | OpenAI embedding API |

---

## 6. 数据模型

### SQLite 记忆存储

```
sessions
├── id: TEXT PRIMARY KEY
├── created_at: TEXT (ISO 8601)
├── updated_at: TEXT (ISO 8601)
├── summary: TEXT (LLM 生成的会话摘要)
└── metadata: TEXT (JSON)

entries
├── id: INTEGER PRIMARY KEY AUTOINCREMENT
├── session_id: TEXT → sessions.id
├── role: TEXT ('user' | 'assistant' | 'tool' | 'system')
├── content: TEXT
├── timestamp: TEXT (ISO 8601)
├── token_count: INTEGER
├── embedding: BLOB (FLOAT32 向量, 可选)
└── metadata: TEXT (JSON)

decisions
├── id: INTEGER PRIMARY KEY AUTOINCREMENT
├── session_id: TEXT → sessions.id
├── context: TEXT (决策背景)
├── decision: TEXT (决策内容)
├── rationale: TEXT (决策理由)
└── timestamp: TEXT (ISO 8601)

code_index
├── id: INTEGER PRIMARY KEY AUTOINCREMENT
├── file_path: TEXT
├── file_hash: TEXT (SHA256, 用于增量更新)
├── content_type: TEXT ('function' | 'class' | 'export' | 'file')
├── content: TEXT
├── embedding: BLOB (FLOAT32 向量)
├── updated_at: TEXT (ISO 8601)
└── UNIQUE(file_path, content_type)
```

### 配置 Schema

```typescript
interface HarnessConfig {
  model: {
    provider: 'openai' | 'anthropic' | 'local' | 'mock';
    model: string;
    apiKey?: string;
    maxTokens: number;
    temperature: number;
  };
  memory: {
    type: 'sqlite' | 'file';
    path: string;
    codeIndex: { enabled: boolean; excludePatterns: string[] };
    contextWindow: { maxTokens: number; compressionThreshold: number };
  };
  tools: string[];
  guardrails: {
    dangerousCommands: boolean;
    fileDeletion: boolean;
    networkAccess: boolean;
    hitlTimeout: number;
  };
  feedback: {
    validators: string[];
    maxRetries: number;
  };
}
```

---

## 7. 凭据与分发设计

### 7.1 API Key 安全存储

**方案选择：** macOS Keychain (keytar) + 环境变量回退

**流程图：**
```
首次运行
  ├─ 检查环境变量 ISE_API_KEY
  │   ├─ 存在 → 使用并存入 keychain
  │   └─ 不存在 → 进入下一步
  ├─ 检查 keychain 中是否已有 key
  │   ├─ 存在 → 使用
  │   └─ 不存在 → 提示用户输入（隐藏输入，不回显）
  └─ 存入 keychain → 完成

用户操作：
  ise-harness key set     → 提示输入新 key（隐藏输入）
  ise-harness key view    → 显示 "已配置" / "未配置"（不显示明文）
  ise-harness key clear   → 删除 keychain 中的 key
  ise-harness key update  → 覆盖旧 key
```

### 7.2 分发形态

**方案选择：** npm 包 + Docker 镜像

**npm 包：**
- 安装：`npm install -g ise-harness`
- 作为 SDK 使用时：`npm install ise-harness --save`
- 提供 CLI 命令 `ise-harness`

**Docker 镜像：**
- `docker pull ghcr.io/ise-harness/ise-harness:latest`
- 运行：`docker run -v $(pwd):/workspace -e ISE_API_KEY=xxx ise-harness`
- 已知限制：macOS Keychain 不可用，需通过环境变量或加密文件提供 key

---

## 8. 技术选型与理由

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全、生态丰富、适合 SDK 开发 |
| 运行时 | Node.js 18+ | 广泛的兼容性、LTS 支持 |
| 测试 | Vitest | 快速、兼容 Jest API、ESM 原生支持 |
| 数据库 | better-sqlite3 | 同步 API、零配置、高性能 |
| Keychain | keytar | 跨平台钥匙串访问 |
| 本地 Embedding | @xenova/transformers | 纯 JS 实现、无需 Python、本地运行 |
| LLM 客户端 | openai npm 包 | 兼容 OpenAI 与 Anthropic 接口 |
| 分发 | npm + Docker | 覆盖开发者库与部署场景 |

---

## 9. 领域与机制设计（Harness 重点）

### 9.1 领域：Coding Agent

coding 领域的独特特征决定了 harness 各机制的设计：

| 维度 | Coding 领域特征 | 设计影响 |
|------|----------------|---------|
| 工具 | 读写文件、执行 shell、运行测试 | 工具集固定，可预定义 |
| 反馈 | 测试结果、lint 错误、编译错误 = 客观、结构化 | 可编程解析，无需 LLM 判断 |
| 危险动作 | 删除文件、危险 shell 命令 | 模式匹配即可拦截，可代码实现 |
| 记忆 | 项目结构、约定、历史决策 | 跨会话 + 代码索引 + 上下文压缩 |

### 9.2 重点维度：记忆与上下文管理

**选择理由：** 记忆是 coding agent 在真实项目中长期使用的核心瓶颈。没有记忆的 agent 每次启动都是"新员工"；有了记忆，agent 才能积累项目知识、理解历史上下文。记忆的工程实现（存储、检索、压缩、索引）天然由代码组成，便于单元测试。

**机制实现方案：**

**3.2.1 SQLiteMemory（跨会话记忆）**
- 代码实现：`Memory` 接口 → `SQLiteMemory` 类
- 核心操作：SQL INSERT/SELECT + 向量相似度搜索
- 可测试性：替换为 `:memory:` SQLite 数据库，无需真实 LLM
- 单测验证：存一条记录 → 检索 → 断言返回

**3.2.2 CodeIndexMemory（代码索引）**
- 代码实现：扫描文件 → 提取代码块 → 生成 embedding → 存入 SQLite
- 可测试性：使用 mock embedding 函数（返回固定向量），不依赖真实模型
- 单测验证：索引一个虚拟文件 → 查询 → 断言返回相关片段

**3.2.3 ContextWindowMemory（上下文压缩）**
- 代码实现：token 计数 → 超出阈值 → 压缩旧对话
- 可测试性：注入 mock LLM（返回固定摘要），不依赖真实模型
- 单测验证：填充 N 条对话 → 触发压缩 → 断言对话被压缩为摘要

### 9.3 其他维度的代码实现

**治理护栏：**
- 代码实现：`Guardrail` 接口 → 模式匹配函数
- 单测验证：`dangerousCommandGuard.check("rm -rf /")` → `{ allowed: false }`
- 无需 LLM，纯确定性代码

**反馈闭环：**
- 代码实现：`Validator` 接口 → 解析测试输出
- 单测验证：注入 mock 测试输出 → 断言解析结果为 pass/fail
- 不依赖真实测试运行

---

## 10. 验收标准

| 功能 | 验收标准 |
|------|---------|
| Agent 主循环 | 通过 mock LLM 验证：给定输入 → 调用 LLM → 解析动作 → 执行工具 → 返回结果 |
| 多 LLM 提供者 | 切换 OpenAI / Anthropic / Mock 后，同一测试用例通过 |
| SQLite 记忆 | 存 100 条记录后检索，断言返回正确结果 |
| 代码索引 | 索引一个 10 文件项目，查询后返回相关片段 |
| 上下文压缩 | 超出阈值后对话被压缩为摘要，断言 token 数减少 |
| 护栏拦截 | 对危险命令返回 block，对安全命令放行 |
| HITL | 拦截时暂停并等待用户输入，超时默认拒绝 |
| 反馈解析 | 解析 TAP 格式测试输出，正确判定 pass/fail |
| 配置加载 | 加载 YAML 配置，正确合并默认值 |
| Mock LLM | 替换 MockLLMProvider 后，所有核心测试通过 |
| 凭据管理 | key set → key view（不显示明文）→ key clear 流程完整 |
| 分发 | `npm install` 后 `ise-harness --help` 可运行 |
| 容器 | `docker build` + `docker run` 可启动 |

---

## 11. 风险与未决问题

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| better-sqlite3 需要原生编译 | 安装失败 | 提供 prebuilt 二进制或 fallback 到 JSON 文件存储 |
| @xenova/transformers 体积大 | 打包体积增大 | 作为可选依赖，用户可选择不启用代码索引 |
| macOS keytar 在 Linux 下不可用 | 凭据管理降级 | 回退到加密文件 + 主密码 |
| 本地 embedding 质量不足 | 代码检索不准确 | 支持用户配置外部 embedding API |
| 上下文窗口压缩丢失关键信息 | agent 忘记重要上下文 | 保留最近 N 轮对话的完整内容，仅压缩更早的历史 |
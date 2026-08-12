# SPEC_PROCESS.md — 规约与计划生成过程

## 一、brainstorming 关键节点

本项目使用 OpenCode + Superpowers 作为主开发工具，Claude Code + Superpowers 作为冷启动验证工具。

### 关键提问与设计修正

brainstorming 阶段，智能体逐轮追问了以下关键问题，每个问题都让我重新审视了设计边界：

**第一轮：重点维度选择**
智能体问我："你的主要贡献维度是记忆与上下文管理，还是想换一个？" 选项包括治理护栏、反馈闭环、工具分发。我选了 A（记忆）。这个问题让我意识到六个维度中只能有一个深入，其他五个做到"能跑就行"——这个约束直接影响了后续所有设计决策，避免了面面俱到但都不深入的情况。

**第二轮：LLM 供应商**
智能体问支持哪些 LLM 供应商。我选了 OpenAI + Anthropic。初版 Anthropic 只处理文本响应，最终提交审查认为这会使真实 coding agent 无法调用工具，因此整改阶段补齐了 `tool_use/tool_result` 协议，并用 mock HTTP 测试验证。

**第三轮：分发形态**
我选了 npm 包。这个决定比较务实——课程要求至少一种分发形态，npm 最轻量。后来验证时发现，没有 Docker 镜像意味着演示起来没那么方便，但在"能用就行"的指导思想下可以接受。

**第四轮：凭据存储**
选了加密文件 + 主密码。初版 `FileCredentialStore` 实际使用内存 Map，与设计和课程硬性要求不符。最终审查将它定为阻断问题，整改为 scrypt + AES-256-GCM 的磁盘密文、原子写入与 `0600` 权限，并删除默认主密码。

**第五轮：embedding 方案**
选了 @xenova/transformers。但安装时发现这个包体积太大（sharp 依赖下载超时），最终改成了可选依赖，实际测试用的是 mock embedding 函数。这个决策后来证明是对的：课程要求"机制可单测"，mock embedding 恰好满足这个要求，真实 embedding 反而会让测试依赖网络。

### 迭代轮次

**第一轮迭代：SPEC 初稿**

我最初的想法比较模糊——"做一个 agent harness"。brainstorming 帮我把这个模糊想法拆成了六个具体维度，每个维度都有明确的接口定义。这个阶段最关键的产出是"机制必须是代码，不能是提示词"这一条——它成为了整个项目的设计准则。

**第二轮迭代：精简设计**

我的第一版 SPEC 过于复杂（7 个工具、4 个校验器、3 种分发）。智能体提醒我"六个维度都要有，但只有一个深入"，我于是把工具从 7 个砍到 4 个（去掉了 EditFile、Glob、RunTest），校验器从 4 个砍到 2 个，分发只保留 npm。这个精简让 PLAN 从 2500+ 行缩减到了更合理的规模。

**第三轮迭代：技术选型调整**

npm install 时发现 better-sqlite3 和 @xenova/transformers 都有安装问题。前者在 Node v26 上编译失败，后者依赖下载超时。于是把 better-sqlite3 换成 sql.js（纯 JS 实现），把 @xenova/transformers 标记为可选依赖。这让我意识到 SPEC 里写的技术选型在实际落地时可能需要灵活调整。

### AI 建议的采纳与推翻

**采纳的：**
- 六个维度各有一个最小实现 + 一个深入维度：这个"写论文"式的结构很合理，采纳了
- 工具集从 7 个精简到 4 个：确实够用，采纳了
- sql.js 替代 better-sqlite3：技术原因，不得不采纳

**推翻的：**
- 智能体一度建议用"仅环境变量"存储凭据，我推翻了——课程明确要求加密存储，环境变量是明文风险
- 智能体建议全部用英文文档，我要求文档用中文——这是课程作业，面向中国老师和助教

**我主动提出的：**
- 代码和文件名用英文，但所有文档用中文——这个混合策略在实现中证明很实用

### 反思

brainstorming 技能做得好的地方在于它真的会追问，不会让你停留在模糊的想法上。它不是一个"你说什么我就写什么"的工具，而是会挑战你的假设。比如"你想让哪个维度深入？"这个问题，如果不问，我大概率会六个维度都浅尝辄止。

不满意的地方是它在某些技术选择上过于乐观——比如推荐 better-sqlite3 和 @xenova/transformers 时没有考虑到实际安装问题。这提醒我，AI 的推荐需要自己验证。

---

## 二、冷启动验证

> 证据说明：该次冷启动没有保留可独立核验的完整会话导出。以下过程根据当时留下的摘要、依赖冲突和后续文档 diff 整理，不应当作逐字 transcript。提交时应如实保留这一限制，不能补写成原始聊天记录。

### 第二个 agent 的信息

- 使用的智能体：Claude Code（与主开发工具 OpenCode 不同）
- 配置：安装了 Superpowers 插件
- 日期：2026-07-08

### 执行过程

我将 SPEC.md 和 PLAN.md 交给 Claude Code，让它从 PLAN 中选 Task 1 和 Task 4 尝试实现。我只提供文件，不补充任何口头解释。

**Task 1（核心类型 + MockLLM）：** Claude Code 顺利完成了。它正确地按 TDD 流程先写测试、再写实现，产出的代码和 PLAN 中的代码基本一致。这证明 SPEC 和 PLAN 对这一块的描述是清晰的。

**Task 4（SQLite 记忆）：** 这里出了问题。PLAN 中写的是 better-sqlite3 的 API 代码，但实际使用的 sql.js 的 API 完全不同。Claude Code 按 PLAN 中的代码（better-sqlite3 风格）写，编译报错。它停下来问："PLAN 中的代码使用了 better-sqlite3 的同步 API，但 package.json 中安装的是 sql.js，我应该用哪个？"

### 暴露的 SPEC 缺陷

1. **PLAN 中的代码与实际依赖不一致**：PLAN 中 Task 4 和 Task 5 的代码使用了 better-sqlite3 的 API，但实际安装的是 sql.js。如果 PLAN 是"施工图纸"，那图纸就是错的。
2. **缺少技术选型验证步骤**：SPEC 和 PLAN 都没有要求"先验证依赖能安装成功再开始写代码"。
3. **SPEC 中缺少 sql.js 的说明**：SPEC 的"技术选型"章节写的是 better-sqlite3，但实际用的是 sql.js。

### 产出与预期差距

Claude Code 对 Task 4 的解读是"PLAN 写错了，但 SPEC 描述的行为是对的，我应该按 SPEC 的行为用 sql.js 重写"。这个解读是对的——它理解了意图，没有被错误的代码误导。

差距在于：如果换一个只会逐字复制 PLAN 代码的 agent，Task 4 会直接编译失败。这说明 PLAN 的代码示例不应该被视为"权威实现"，而应该被视为"参考伪代码"。

### 据此对 SPEC / PLAN 的修订

**修订 1：** 将 PLAN 中 Task 4 和 Task 5 的代码从 better-sqlite3 API 改为 sql.js API。

**修订 2：** 在 SPEC 的技术选型章节中，将 better-sqlite3 改为 sql.js，并说明替换原因。初次开发后该修订实际遗漏，直到 2026-08-09 提交前审查才真正同步完成。

**修订 3：** 在 PLAN 的全局约束中增加一条："依赖安装后确认可编译再开始实现"。

**关键认识：** 冷启动验证暴露的最大问题是"PLAN 中的代码不等于实际能跑的代码"。PLAN 是设计文档，不是源码。这让我在后续实现中更加谨慎——每次 subagent 实现前，我都会先确认依赖环境和类型定义是正确的。

### 2026-08-12 补充冷启动：保留下来的原始会话

7 月那次冷启动只剩摘要，没法事后补成原始记录。提交前我重新做了一次：Claude Code `2.1.202`，全新 session，模型 `deepseek-v4-pro`，只把隔离目录中的 `SPEC.md` 和 `PLAN.md` 交给它。启动 hook 显示 `superpowers@superpowers-dev 6.1.1` 已启用；第一轮实际调用了 `brainstorming`。完整的 user/assistant 节选和隔离说明见 [`evidence/process-remediation/cold-start-transcript.md`](./evidence/process-remediation/cold-start-transcript.md)。这份材料是新的补充证据，不替换 7 月缺失的导出。

陌生 agent 选择 Task 16 后没有猜着做，而是在 Q1–Q10 处停下。最有用的是 Q10：PLAN 说记忆要跨进程，却没有写同实例并发调用的顺序。第二轮它把补充任务扩成 C1–C12，我没有接受，只保留 25 个并发 `store()` 和重开恢复这一条。第四轮我又主动更正了自己说错的事实：100KB、FIFO 和 `0600` 在源码中有实现，但当时没有直接测试。agent 据此把它们定为 characterization/tests-after，不能冒充 TDD RED。

我随后在独立 worktree 写出并运行真正的 RED：旧实现争用同一个 `.tmp` 文件，rename 报 `ENOENT`。冷启动 Claude 在第五轮已调用 `test-driven-development`，但三次都因其 API 账户预扣额度不足返回 403，尚未读取或修改源码；所以我不能声称它完成了实现。Task 21 的实现改由另一个新鲜 subagent 完成，并经过 spec review、quality review 和两轮 fix。这个分工也记录在 `AGENT_LOG.md` 中。

```diff
- Task 16 只写“跨进程持久化”，未规定并发调用顺序
+ Task 21：同实例操作按调用顺序排队；错误对当前调用者可见，但不毒化后续队列
+ close 必须等待先发读写；跨进程同时写仍不承诺
```

---

## 三、提交前独立审查与第四轮迭代

### 审查触发

2026-08-09，我把通用要求、A 类项目要求和当前仓库交给一个新的 Codex 会话，只要求审查，不允许修改。它实际运行了测试、TypeScript 检查和 npm 打包预览。

审查得出的关键问题不是“缺少几个测试”，而是文档和产品边界不一致：53 个 Vitest 测试通过，但主循环没有连接治理、反馈和记忆；磁盘路径参数被忽略；凭据只是内存 Map；CLI 与 WebUI 不可运行；npm tarball 缺少入口。这个反馈让我推翻了“重点不是该维度，所以最低实现可以只是独立类”的判断。六个维度的最低实现必须在同一个生产循环中工作，不能只在测试中分别出现。

### 修订前后关键 diff

```diff
- AgentOptions = { llmProvider, tools, systemPrompt, maxTurns }
+ AgentOptions = { llmProvider, tools, memory, codeIndex, contextWindow,
+                  guardrails, hitl, validators, maxFeedbackRetries, onEvent }

- FileCredentialStore.store = new Map()
- masterPassword ||= "default-dev-password"
+ credentials.enc.json (0600) + scrypt + AES-256-GCM
+ no default master password

- new sql.Database() // dbPath 未使用
+ exists(dbPath) ? new Database(readFile(dbPath)) : new Database()
+ mutation → export → temporary file → atomic rename

- CI: npm test
+ CI: npm run lint → npm test → npm pack → install tarball → CLI smoke test
```

### 验证结论

- 主循环护栏演示已改为向生产 `Agent` 注入 `DangerousCommandGuard`，测试工具本身不再手工包装护栏。
- 反馈演示会断言第二轮 MockLLM 上下文真实包含 `[确定性反馈:test_result]`。
- 记忆单测会关闭实例 A，再用实例 B 从相同磁盘文件恢复数据。
- OpenAI/Anthropic 使用 mock HTTP 验证工具协议，不消耗真实 key。
- npm 构建和 tarball 内容由实际命令验证，不再以 README 声明作为完成证据。

### 三轮对话复盘稿

> 说明：以下内容依据现存 SPEC、PLAN、Git 历史和原过程摘要事后重建，用来说明当时的决策逻辑，不是逐字 transcript。若找回原始会话，应以原文替换本节。
>
> 因此，本节能够说明三次决策及其影响，但不能替代课程要求的原始对话证据。这是现有过程材料无法事后完全修复的缺口。

#### 复盘一：重点维度怎么选

> **Agent：** 六个维度都要有最低实现，但你打算把哪一块做成主要贡献？如果每块平均用力，最后可能只是六个接口。
>
> **我：** 我更想做记忆。coding agent 每次启动都重新认识项目，这个问题我自己用工具时经常碰到。
>
> **Agent：** 那就把记忆拆成跨会话存储、代码索引和上下文压缩。工具、治理和反馈保留完整闭环，但不继续扩功能。
>
> **我的处理：** 接受这个方向，删除 EditFile、Glob 和 RunTest 等扩展工具，把验收重点放到“重启后能恢复”和“按需取回代码知识”。后来审查发现，我虽然写了三个记忆类，却没有接进 Agent。这也说明“选了重点”不等于重点真的落地。

#### 复盘二：环境变量够不够

> **Agent：** 最简单的 key 配置是读取环境变量，用户自己在 shell 中设置即可。
>
> **我：** 课程要求安全录入、更新和清除。只读环境变量不够，而且直接在命令行 `export` 可能进入 history。
>
> **Agent：** 可以改成加密文件加主密码，环境变量只作为可选来源。CLI 提供 `key set/view/clear`，查看时只显示状态。
>
> **我的处理：** 我推翻了“仅环境变量”的建议，选择 AES-GCM 加密文件。不过初版实现仍是内存 Map，还带默认密码，实际上没有兑现这个决定。提交前整改才补上 scrypt、磁盘持久化、`0600` 权限和隐藏输入。

#### 复盘三：冷启动 agent 为什么停下

> **Claude Code：** PLAN 的 Task 4 使用 better-sqlite3 同步 API，但 package.json 安装的是 sql.js。两套 API 不兼容。我应该按哪一个实现？
>
> **我：** 以 sql.js 为准。先不要猜 API，按 SPEC 的行为要求重写存储层，并补跨实例恢复测试。
>
> **Claude Code：** 那 PLAN 和 SPEC 的技术选型也要同步，否则后面的 task 仍会照着旧示例写。
>
> **我的处理：** 当时只改了部分实现和 PLAN，SPEC 的表格仍残留 better-sqlite3。这个遗漏直到最终独立审查才修正。冷启动验证找到了问题，但我没有把反馈完整落实到所有文档。

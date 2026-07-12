# REFLECTION.md — 反思报告

> ⚠️ **注意：** 此文件由 AI 生成初稿。课程要求反思报告必须由学生本人撰写。请将此文件作为参考框架，用自己的语言、自己的经历重新撰写。可以使用 AI 辅助润色，但核心内容和观点需要是你自己的。

---

## 1. Superpowers 技能评估

我把 Superpowers 的七个技能都走了一遍，说说哪些真的有用，哪些形式大于实质。

**brainstorming 是最有价值的技能。** 它不像普通的"你说需求我写代码"模式，而是会逐轮追问。比如它问我"哪个维度深入？"，这个问题如果不问，我肯定会六个维度都浅浅做一下，最后哪个都不深。它迫使我在动手之前把设计想清楚，这个价值怎么强调都不过分。但它的局限性也很明显：它推荐技术选型时过于乐观，不会去验证"这个依赖在我机器上能装吗"——这导致后续的 better-sqlite3 编译失败问题。

**writing-plans 的实用性取决于 spec 质量。** 如果 spec 写得清楚，plan 就清楚；spec 模糊，plan 就跟着模糊。PLAN 中的代码示例其实是把双刃剑——一方面它给 subagent 提供了明确的实现方向，另一方面 subagent 会逐字复制，连 bug 一起复制。Task 7 的 HITL defaultDeny 死参数、Task 11 的 GuardrailCheck 类型不匹配，都是 PLAN 自带的问题。

**subagent-driven-development 是效率最高的实现方式。** 13 个 task，每个派一个新鲜 subagent，controller 负责审查和调度。这个过程让我感觉像是"架构师 + 审查者"的角色，而不是"码农"。但 subagent 有个致命弱点：它不会质疑 PLAN。如果 PLAN 写错了，subagent 不会说"这个设计有问题"，它只会忠实地执行错误的指令。

**test-driven-development 在 AI 协作下是放大器，不是阻碍。** 很多人觉得"AI 写代码已经够快了，写测试是浪费时间"，但我的体验正好相反。Task 2 的 grep 正则 bug、Task 5 的 BLOB 序列化 bug——这些都是在测试中暴露的。如果没有 TDD，这些 bug 会一直潜伏到集成阶段才被发现。但 TDD 在 AI 协作下有个别扭的地方：subagent 写的测试经常是"为了通过而通过"的测试，比如 Task 5 的 mock embedding 测试，它只验证了"查询返回了结果"，但没验证结果的正确性——因为 mock embedding 对所有输入返回相同向量，cosine similarity 总是非零。

**requesting-code-review 和 finishing-a-development-branch 我这次没用到。** 因为所有 task 都在 main 分支上完成，没有用 git worktree 做分支隔离。这是一个偷懒的地方——课程要求"每个 worktree 对应一个 PR"，但我选择了在 main 上直接推进。如果重做，我会用 worktree 隔离每个独立模块。

**总的来说：** brainstorming 和 subagent-driven-development 是 Superpowers 最大的价值所在。TDD 在 AI 协作下依然重要，但测试质量需要人工把关。writing-plans 有用但需要人工验证代码正确性。git worktree 我这次没用好，有点遗憾。

---

## 2. TDD 在 AI 协作中的体验

说实话，我刚开始是抵触的。"AI 写代码够快了，为什么还要先写测试？"但实际跑下来，TDD 在 AI 协作中至少有三个好处。

**第一，测试是 subagent 的"护栏"。** 没有测试，subagent 可能会写出任何东西——它不知道什么是"正确"。有了测试，subagent 就有了明确的目标：让测试变绿。这个约束比任何提示词都有效。

**第二，测试是审查器的"证据"。** task-reviewer 审查代码时，测试结果是它判断"代码能不能用"的最直接证据。如果测试覆盖了关键行为，审查器就能快速判断 spec 合规。

**第三，测试是回归的"安全网"。** Task 5 的 BLOB 序列化修复后，我重新跑了全量测试——53 个测试全部通过。这意味着修复没有破坏任何已有功能。如果没有测试，我根本不知道修复是否引入了新 bug。

但 TDD 在 AI 协作下也有问题。最突出的是 **subagent 写的测试质量参差不齐**。Task 5 的 code-index 测试就是用 mock embedding 做的——所有输入返回相同向量，cosine similarity 总是非零，所以"查询返回了结果"这个测试永远通过，但结果的正确性完全没有验证。这其实是"为了通过而通过"的测试，不是真正的行为验证。

另一个问题是 **TDD 的节奏和 subagent 的节奏不匹配**。TDD 的标准节奏是 RED → GREEN → REFACTOR，但 subagent 经常在 RED 阶段就停了——因为代码还没写，编译都过不了，测试当然跑不了。subagent 在 RED 阶段需要一些"脚手架"（比如类型定义、接口声明）才能让测试跑起来，但 TDD 的"先写测试"隐含了"测试能跑"的前提。

---

## 3. Subagent 驱动开发体验

subagent-driven-development 是这次作业中最让我印象深刻的体验。我以前写代码都是自己一行一行敲，这次是"指挥 subagent 写代码，我来审查"。

**效果好的方面：**

每个 subagent 都是"新鲜"的——它只看自己的 task，不会被其他 task 的上下文干扰。这让 subagent 非常专注，不会写出"因为我知道后面要做什么所以这里先预留"的代码。每个 task 的产出都是自包含的、可独立验证的。

审查器是另一个惊喜。Task 2 的 grep 正则 bug（`RegExp.test()` 的 `g` 标志状态性问题），Task 5 的 BLOB 序列化 bug——这些 bug 我一个都没发现，但审查器全抓住了。审查器不会疲劳、不会"差不多就行了"，它真的会逐行对比代码和 spec。

**效果不好的方面：**

最大的问题是 subagent 不会质疑 PLAN。Task 7 的 HITL defaultDeny 死参数、Task 5 的 dbPath 参数未使用——这些问题是 PLAN 自带的，但 subagent 不会说"等一下，这个设计不对"，它只会忠实地实现。这导致了一个反馈循环：PLAN 有 bug → subagent 照抄 → 审查器发现 → fix subagent 修复 → 但 PLAN 没改，下一个 subagent 还会犯同样的错。

另一个问题是 fix 循环的开销。每次 fix 都需要：生成 review package → 分发 fix subagent → 等待修复 → 重新审查。虽然单次 fix 很快，但如果一个 task 有多个 review 发现的问题，分发一个 fix subagent 一次性修完比逐条修高效得多。

**task 颗粒度：** 我最满意的颗粒度是 Task 1-3（核心模块）和 Task 4-6（记忆子系统）。每个 task 2-5 分钟，产出 1-3 个文件，有明确的测试。如果 task 太大（比如把 Task 4-6 合并成一个），subagent 容易迷失；如果太小（比如把每个工具单独做一个 task），审查开销会超过实现开销。

---

## 4. SPEC / PLAN 质量对实现的影响

这个项目给了我一个最直接的教训：**SPEC 和 PLAN 的质量直接决定了 subagent 的产出质量。**

**正面案例：** Task 1（核心类型）的 SPEC 描述非常清晰——"ChatMessage 有 role、content、toolCalls 字段"——subagent 一次就做对了，没有 fix 循环。

**反面案例：** Task 4（SQLite 记忆）的 PLAN 代码用的是 better-sqlite3 的 API，但实际安装的是 sql.js。subagent 按 PLAN 的代码写，编译报错。这个问题的根源是"技术选型在 SPEC 阶段没有验证"——SPEC 写了 better-sqlite3，PLAN 照抄了，但没有人去跑 `npm install` 验证。如果我在 SPEC 写完后就装一下依赖，这个问题根本不会发生。

**另一个反面案例：** Task 7 的 HITLHandler 的 defaultDeny 参数——PLAN 的代码中定义了 `this.options.defaultDeny`，但 timeout 回调里硬编码了 `approved: false`。subagent 照抄了这段代码，导致 defaultDeny 参数完全无效。这是在审查阶段才发现的。如果 PLAN 的代码更"自检"一些（比如代码注释标明"注意：这里应该用 defaultDeny"），subagent 就不会犯这个错。

**核心认识：** PLAN 不是"施工图纸"，它是"设计草图"。subagent 会逐字复制 PLAN 的代码，所以 PLAN 的代码质量直接等于 subagent 的产出质量。但 PLAN 本身是由 AI 生成的，所以这形成了一个"AI 生成设计 → AI 按设计实现 → AI 审查实现"的循环。这个循环里，人工介入的点是设计决策和审查判断——也就是"做什么"和"做对了吗"。

---

## 5. 最有效的 prompt / context 策略

经过 13 个 task 的反复调试，我总结了几条有效的策略：

**1. "先读 brief，再看代码"这个顺序很重要。** 我每次都让 subagent 先读 task brief（从 PLAN 提取的单一 task 描述），再给它上下文。如果反过来——先给一大堆上下文再给 brief——subagent 会被上下文淹没，找不到重点。

**2. 全局约束要简短。** 我的全局约束只有 5 条（TDD、ES module、无网络依赖、无 agent 框架、中英文分工），subagent 能记住。如果约束太长（比如 20 条），subagent 会忽略大部分。

**3. "实现 brief 里写的，不要多写"是最有效的指令。** 我给每个 subagent 的第一条指令就是"Implement exactly what the task brief specifies"。这避免了 subagent 的"过度工程化"倾向——比如自动加错误处理、自动加日志、自动加配置选项。

**4. 审查器的 prompt 要指向具体文件。** 不要给审查器说"检查所有代码质量"，要说"检查 diff 中的 spec 合规性"。审查器在"找问题"方面很强，但在"判断什么算问题"方面需要明确的边界。

**5. 不要在 dispatch 里塞太多上下文。** 我最初给 Task 4 的 dispatch 里塞了前面 3 个 task 的完成状态，结果 subagent 花了大量时间读那些毫不相关的上下文。后来我改成只给"前置 task 已完成，你现在依赖的接口是 XXX"，subagent 的启动速度明显快了很多。

---

## 6. 凭据与分发的工程思考

凭据管理和分发这两个要求，一开始我觉得是"形式主义"——"不就是别把 key 写死在代码里吗，这有什么好做的？"但真正实现后，我发现这两个要求迫使我想清楚了很多原来会忽略的问题。

**为什么不能把 key 写死在代码里？** 不是"不安全"这么简单。实际原因是：代码会被 git 记录、会被复制粘贴、会被分享给同事、会被上传到云端。一旦 key 进入代码，它就"永生了"——你可以删掉它，但 git 历史里永远有。所以凭据管理不是"加密一下"的问题，而是"从源头杜绝 key 进入代码"的问题。

**为什么加密文件比环境变量好？** 环境变量看起来方便——`export API_KEY=xxx` 一行搞定。但环境变量有两个致命问题：一是它会进入 shell history（`history` 命令能看到），二是它会被 `ps aux` 或其他进程暴露。加密文件虽然麻烦一点，但至少不会不小心泄露。

**为什么分发这么重要？** 因为如果别人没法跑你的代码，你的代码就是废的。Docker 镜像、npm 包、二进制文件——这些不是"花活"，而是让项目能被他人使用的唯一方式。我在这个项目里选了 npm 包，但说实话做得不够好——`ise-harness` CLI 命令需要 `npm run build` 后才能用，而很多用户不知道要先 build。

**一个没解决好的问题：** FileCredentialStore 用的是内存 Map，重启就丢失。生产环境需要加文件持久化逻辑，但这块我没做——因为觉得"够用了"。如果重做，我会让 FileCredentialStore 在构造函数中接收一个文件路径，set/get 时读写文件。

---

## 7. 如果重做会改变什么

**1. 先验证依赖再写 SPEC。** 我会在 SPEC 写完后立刻跑 `npm install`，确认所有依赖能装。如果 better-sqlite3 在 Node v26 上编译失败，我应该在 SPEC 阶段就发现，而不是在实现阶段。

**2. 用 git worktree 隔离每个模块。** 这次所有 task 都在 main 分支上完成，commit 历史是线性的。如果重做，我会为记忆子系统（Task 4-6）开一个 worktree，为治理 + 反馈（Task 7-8）开另一个——这样并行开发，互不干扰。

**3. PLAN 的代码要标注"这是参考伪代码"。** PLAN 里的代码示例太像"权威实现"了，subagent 会逐字复制。如果重做，我会在 PLAN 开头加一句"以下代码仅供参考，实际实现以 SPEC 行为描述为准"。

**4. 审查器发现问题后，同步修改 PLAN。** 这次 Task 7 的 defaultDeny 死参数被 fix 了，但 PLAN 没改——如果下一个类似 task 也用到了 HITLHandler，同样的 bug 会再次出现。

**5. 加入集成测试。** 当前所有测试都是单元测试，没有端到端集成测试。比如"护栏拦截 → HITL 等待 → 用户确认 → agent 继续"这个流程，目前只在 demo 脚本里演示了，没有被测试覆盖。

---

## 8. 对 Superpowers 方法论的批判

Superpowers 的核心理念是"用代码替代提示词"——护栏是代码（不是提示词说"不要删文件"）、反馈是代码（不是让 LLM 自己检查）、记忆是代码（不是让 LLM 自己记住）。这个理念我完全认同。但 Superpowers 的假设和我的项目现实之间，有几个地方对不上。

**假设一：spec 是完美的。** Superpowers 的流程假设 brainstorming 产出的 spec 是"正确的"、"完整的"、可以被直接翻译成 PLAN 的。但现实中，spec 经常有遗漏（比如忘了验证依赖兼容性）、有模糊（比如"工具应该支持超时"这句话可以有三种实现方式）、有冲突（比如"最小可行"和"功能完整"之间的取舍）。spec 不是一次写完就定稿的文档，它需要持续迭代。

**假设二：subagent 能理解 spec 的意图。** Superpowers 的设计是"subagent 读 spec，按 spec 实现"。但实际中，subagent 经常把 spec 当成"逐字执行的指令"而不是"需要理解的意图"。Task 7 的 defaultDeny 死参数就是一个例子——spec 的意图是"超时时根据配置决定允许或拒绝"，但 PLAN 的代码实现是"超时时总是拒绝"。subagent 没有理解意图，它只复制了代码。

**假设三：review 循环能解决所有问题。** Superpowers 的设计是"实现 → 审查 → fix → 再审查 → 通过"。这个循环确实能解决很多问题（Task 2 的 grep bug、Task 5 的 BLOB bug），但它解决不了"设计层面的问题"——比如"FileCredentialStore 应该持久化到文件"这个设计决策，审查器不会提出，因为它不在 spec 的范围内。

**假设四：TDD 在 AI 协作下和人工协作一样有效。** TDD 对人工开发者来说是"先想清楚要什么，再写代码"。但对 AI 来说，TDD 的"先写测试"阶段存在一个鸡生蛋蛋生鸡问题：测试需要引用还未实现的模块，编译失败。解决方法是先写类型定义和接口声明——但这又回到了"先实现再测试"的循环。Superpowers 没有明确处理这个问题。

**总的来说：** Superpowers 是一套很好的方法论，但它的假设太理想化了。它假设 spec 是完美的、subagent 能理解意图、review 能解决所有问题、TDD 在 AI 协作下自然流畅。在真实项目中，这些假设经常不成立。但这不是说 Superpowers 没用——恰恰相反，它提供了一个结构化的框架，让"AI 协作"这件事从"盲人摸象"变成了"有章可循"。知道它的假设在哪些地方不成立，本身就是一种进步。
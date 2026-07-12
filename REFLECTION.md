# REFLECTION.md — 反思报告

## 1. Superpowers 技能评估

Superpowers 七个技能，我全走了一遍。说说哪些真的帮到我了，哪些纯属流程负担。

**brainstorming 是唯一让我觉得"这玩意儿真有脑子"的技能。**

它不会你说什么它就写什么。比如我问它"帮我做个 coding agent harness"，它没直接写代码，而是反过来问我"你想让哪个维度做深？"这个问题把我问住了。我本来想的是六个维度都做，但仔细一想，每个都做等于每个都不深。它逼我在动手之前把重点想清楚，这个价值很大。

但它也有蠢的地方。推技术选型的时候完全不看现实——推了 better-sqlite3，结果 Node v26 上装都装不上。推了 @xenova/transformers，下载超时。它像个"理论派架构师"，推荐的东西听起来都对，但落到你机器上就不是那回事了。

**writing-plans 属于"有用但别全信"的技能。**

它产出的 PLAN 很详细，每个 task 该写什么文件、什么接口、什么测试，一清二楚。问题是 PLAN 里的代码示例，subagent 会当圣旨执行。Task 7 的 HITLHandler 有个 defaultDeny 参数，PLAN 的代码里写了这个参数，但 timeout 回调里没用它——直接硬编码了 `approved: false`。subagent 照抄了，bug 就这么进了代码。审查阶段才发现。

这让我意识到一个事：PLAN 不是施工图纸，它是设计草图。你不能指望 subagent 去质疑草图——它只会照抄。

**subagent-driven-development 是效率最高的环节。**

13 个 task，派 13 个 subagent，每个只干一件事。Controller 负责审查和调度。感觉自己像个包工头——活不是我干的，但好不好我得把关。

这种模式让我发现了一个有趣的现象：subagent 比我想象的"笨"，但也比我想象的"可靠"。笨在它不会质疑你给它的设计，错的设计它就照错执行；可靠在它不会偷懒，不会"差不多就行了"，你让它写什么它就写什么。

**test-driven-development 在 AI 协作下不是阻碍，是放大器。**

来这个课之前我觉得 TDD 很烦——"我都知道要实现什么了，先写测试不是浪费时间吗？" 但这次跑下来，我发现测试在 AI 协作里起的作用和人工写代码时完全不一样。

人工写代码时，测试是"验证我的想法对不对"。AI 写代码时，测试是"告诉 AI 什么是对的"。这两个角色完全不同。Task 2 的 grep 正则 bug、Task 5 的 BLOB 序列化 bug，都是测试暴露的。没有测试，这些 bug 会一直潜伏。

但坦白说，subagent 写的测试经常质量不行。Task 5 的 code-index 测试，mock embedding 对所有输入返回相同向量，cosine similarity 算出来永远非零，所以"查询返回了结果"这个测试永远通过。但结果是错的。这是一个"为了通过而通过"的测试，不是真正的行为验证。

**requesting-code-review 和 finishing-a-development-branch 我没用上。**

因为所有 task 都在 main 分支上直接推了，没开 worktree。课程要求每个 worktree 一个 PR，我偷懒了。如果重做我会用——但现在回头看，这个技能更像"流程合规"而非"技术必需"，对于单人项目来说分支隔离的意义没有团队项目那么大。

**总结一下：** brainstorming 和 subagent-driven-development 是真正有价值的。TDD 在 AI 协作下依然必要，但测试质量得人工把关。writing-plans 有用但不能全信。git worktree 对单人项目意义有限。

---

## 2. TDD 在 AI 协作中的体验

说实话，来这个课之前我是 TDD 的怀疑者。我写过不少代码，从来没先写测试再写实现。觉得那是"教条主义"——脑子里的逻辑都清楚了，为什么还要先写测试？

这次被逼着走了 13 个 task 的 TDD，感受完全变了。

**测试是 subagent 的"说明书"。**

subagent 不懂你的项目，不知道什么叫"正确"。你给它一个 prompt 说"实现一个 Agent 类"，它能给你写出几十种不同的实现。但如果你先给它测试——"这个 Agent 类应该能 halt、能执行工具调用、能限 maxTurns"——它就知道目标了。测试比任何 prompt 都精确。

**测试是审查器的"证据"。**

task-reviewer 审代码的时候，它不会跑你的代码去验证行为。它看的是：测试跑过了吗？测试覆盖了 spec 要求的场景吗？如果测试全绿，审查器就倾向于 approve。如果测试没覆盖某个场景，审查器就会挂"Important"。

**测试是回归的安全网。**

Task 5 的 BLOB 序列化修复后，我跑了全量测试——53 个全绿。这一瞬间我就知道：修复没引入新 bug。如果没有测试，我只能靠"感觉"——感觉没破坏什么，但谁知道呢。

**但 TDD 在 AI 协作下有两个别扭的地方。**

第一个：RED 阶段经常跑不起来。因为测试引用的模块还没写，编译就失败了。subagent 在 RED 阶段需要先建类型定义和接口声明，才能让测试"编译通过但断言失败"。这个"先建类型"的步骤，严格来说不算"先写测试"，但你不做这一步测试根本跑不了。

第二个：subagent 写的测试质量不稳定。好的测试（比如 Task 1 的 mock-llm 测试）确实验证了行为；差的测试（比如 Task 5 的 code-index 测试）只是"为了通过而通过"。这跟 TDD 方法本身无关，跟 subagent 的判断力有关。审查器能发现 spec 合规问题，但很难发现"测试逻辑有漏洞"这种更微妙的问题。

---

## 3. Subagent 驱动开发体验

这是我第一次用"派 subagent 干活"的方式写代码。以前写代码都是自己一行一行敲，这次是"你写，我审"。

**好的地方：**

每个 subagent 都是"新鲜"的。它只看自己的 task，脑子里没有前一个 task 的包袱。这有一个意外的好处：如果两个 task 之间有接口不兼容，subagent 会直接报错，而不是"我猜对方想要什么所以改成这样"——后者在人工开发者中很常见。

审查器的质量让我意外。Task 2 的 grep 正则 bug，就是 `RegExp.test()` 加 `g` 标志导致的状态性 bug。这个 bug 我人工看代码大概率会漏掉——因为 `g` 标志在单行匹配时确实"看起来"不影响结果。但审查器抓住了——它对比了 spec 中的代码和实现中的代码，发现实现用了 `g` 标志，而 spec 没有明确说要用。

Task 5 的 BLOB 序列化 bug 也是。`new Float32Array(row.embedding)` 把字节数组当浮点值重建了，导致向量完全错误。这个 bug 我绝对发现不了——谁会想到 Float32Array 的构造函数和 Uint8Array 的 buffer 属性之间有这种微妙的语义差异？审查器不仅发现了，还给出了正确的修复方案。

**不好的地方：**

subagent 不会质疑 PLAN。这是最大的问题。Task 7 的 defaultDeny 死参数、Task 5 的 dbPath 没用——这些是 PLAN 的设计问题，但 subagent 不会说"这个设计有问题"。它只会忠实地执行。这形成了一个危险的正反馈：PLAN 有 bug → subagent 照抄 → 审查器发现 → fix subagent 修 → 但 PLAN 没改，下一个 subagent 可能还会犯。

fix 循环的开销也不小。每次 fix 都要：生成 review package → 派 fix subagent → 等修复 → 重新审查。虽然单次 fix 很快（通常改一两行代码），但流程上的开销固定。后来我学乖了——如果一个 task 有多个 review 发现的问题，我会一次性全丢给 fix subagent，而不是逐条修。

**task 颗粒度这个事：**

我试过几种颗粒度。太大的 task（比如把 Task 4-6 合并成一个"记忆子系统"），subagent 容易迷失。太小的 task（比如把每个工具单独做一个 task），审查开销远超实现开销。最舒服的颗粒度是"一个 task 2-5 分钟，产出 1-3 个文件，有明确测试"。

---

## 4. SPEC / PLAN 质量对实现的影响

这个项目给我上了一课：SPEC 和 PLAN 写得好不好，直接决定了 subagent 写得好不好。

**好的例子：** Task 1 的 SPEC 写得很清楚——"ChatMessage 有 role、content、toolCalls 三个字段"。subagent 一次就做对了，没有 fix 循环。

**坏的例子：** Task 4 的 PLAN 代码用的是 better-sqlite3 的 API，但 package.json 里装的是 sql.js。subagent 照抄 PLAN 的代码，编译报错。这个问题的根源是：SPEC 写了 better-sqlite3，PLAN 照抄了，但没人去跑 `npm install` 验证。如果 SPEC 写完就装一下依赖，这个问题根本不会发生。

**另一个坏例子：** Task 7 的 HITLHandler。PLAN 的代码里定义了 `this.options.defaultDeny`，但 timeout 回调里硬编码了 `approved: false`。subagent 照抄了这段代码，导致 defaultDeny 参数完全无效。审查阶段才发现。

**核心认识：** PLAN 是 subagent 的"唯一信息来源"。subagent 不会去读 SPEC，不会去理解项目背景，它只看 PLAN 里给它的 task brief。所以 PLAN 的代码质量直接等于 subagent 的产出质量。但 PLAN 本身是 AI 生成的，所以这形成了一个"AI 生成设计 → AI 实现设计 → AI 审查实现"的循环。人在这个循环里的角色是：做设计决策（"做什么"），和审查判断（"做对了吗"）。

---

## 5. 最有效的 prompt / context 策略

跑了 13 个 task，我总结了几条经验。

**一、先给 brief，再给上下文。** 我每次 dispatch 都让 subagent 先读 task brief，再给它上下文。如果顺序反过来——先给一大堆上下文再给 brief——subagent 会被淹没，不知道自己该干嘛。

**二、全局约束控制在 5 条以内。** 我的约束是：TDD、ES module、无网络依赖、无 agent 框架、中英文分工。5 条，subagent 记得住。如果写 20 条，它大概率会忽略后半部分。

**三、"只实现 brief 里写的，别多写"是最有用的指令。** 每个 dispatch 我都在开头写"Implement exactly what the task brief specifies"。这避免了 subagent 的"我觉得应该加个错误处理"、"我觉得应该加个配置项"——这些"好心"但多余的东西。

**四、审查器需要明确的边界。** 不要跟审查器说"检查所有代码质量"，要说"检查 diff 中的 spec 合规性"。审查器找问题的能力很强，但判断"什么算问题"需要边界——给它边界，它就能精准工作。

**五、dispatch 别塞太多背景。** 我最初给 Task 4 的 dispatch 里写了前面 3 个 task 的完成状态，结果 subagent 花了很多时间读那些毫不相关的上下文。后来改成"前置 task 已完成，你依赖的接口是 XXX"，subagent 启动快了很多。

---

## 6. 凭据与分发的工程思考

凭据管理和分发，课程要求里写得很清楚——不能硬编码 key、要有至少一种分发形态。一开始我觉得这俩是"走过场"，但真做起来发现不是。

**为什么不能把 key 写死在代码里？** 不是"不安全"三个字能概括的。代码会被 git 记录、会被复制粘贴、会被分享。一旦 key 进了 git history，你就永远清不掉了——删文件没用，`git log` 里还有。所以凭据管理的问题不是"怎么加密"，而是"怎么从源头防止 key 进入代码"。

**为什么加密文件比环境变量靠谱？** 环境变量看起来方便，一行 `export` 搞定。但问题是你用 `export` 的时候它进了 shell history，`history` 命令就能看到。而且环境变量在进程间是透明的，别的进程能读到。加密文件麻烦一点，但至少不会不小心泄露。

**分发这块我做得不够好。** 选了 npm 包，但 `ise-harness` 命令需要先 `npm run build` 才能用——很多用户不知道要 build。README 里写了安装步骤，但不够"傻瓜式"。

**一个没做好的事：** FileCredentialStore 用的是内存 Map，关了进程 key 就丢了。生产环境肯定要持久化到文件，但这块我没做。原因很简单——"够用了"。但这个"够用"其实是个借口，主要是懒。

---

## 7. 如果重做会改变什么

**第一，先验证依赖再写 SPEC。** SPEC 写完立刻跑 `npm install`。如果 better-sqlite3 装不上，我应该在 SPEC 阶段换方案，而不是实现到一半才发现。

**第二，用 git worktree。** 这次全在 main 上推，commit 是线性的。如果重做，记忆子系统（Task 4-6）一个 worktree，治理+反馈（Task 7-8）一个 worktree，并行推进。

**第三，PLAN 的代码要加注释。** 在 PLAN 开头加一句"以下代码是参考伪代码，实际实现以 SPEC 行为描述为准"。subagent 可能还是不会看这句，但至少给审查器一个判断依据。

**第四，审查器发现问题后，同步改 PLAN。** Task 7 的 defaultDeny 被 fix 了，但 PLAN 没改——如果后面有类似 task 用到 HITLHandler，同一个 bug 会再出现。

**第五，加集成测试。** 目前全是单元测试。像"护栏拦截 → HITL 等待 → 用户确认 → agent 继续"这个流程，只在 demo 里演示了，没有被测试覆盖。如果重做我会加至少一个端到端测试。

---

## 8. 对 Superpowers 方法论的批判

Superpowers 的核心理念是"用代码替代提示词"——护栏是代码（不是"请勿删文件"的提示词），反馈是代码（不是让 LLM 自己检查），记忆是代码（不是让 LLM 自己记住）。这个理念我认同。但 Superpowers 有四个假设，和我的项目现实对不上。

**假设一：spec 是完美的。** Superpowers 的流程假设 brainstorming 产出的 spec 是"正确且完整"的。但现实中 spec 经常有遗漏（比如忘了验证依赖兼容性）、有模糊（比如"工具应支持超时"可以有三种实现）、有隐性冲突（比如"最小可行"和"功能完整"之间的取舍）。spec 不是写完就定稿的东西，它需要迭代。但 Superpowers 没有给 spec 迭代留空间——brainstorming 之后就是 writing-plans，写完了就定了。

**假设二：subagent 能理解 spec 的意图。** 实际是 subagent 只理解 spec 的字面意思。Task 7 的 defaultDeny 死参数就是例子——spec 的意图是"超时时根据配置决定"，但 PLAN 的代码实现是"超时时总是拒绝"。subagent 没理解意图，它只复制了代码。Superpowers 没有处理"意图 vs 实现"这个 gap。

**假设三：review 能解决所有问题。** review 确实能解决很多问题（grep bug、BLOB bug），但解决不了"设计层面的问题"。比如"FileCredentialStore 应该持久化到文件"——审查器不会提，因为这不在 spec 范围里。review 是"spec 合规检查"，不是"设计评审"。

**假设四：TDD 在 AI 协作下和人工协作一样自然。** TDD 对人是"先想清楚要什么，再写代码"。但对 AI，TDD 的"先写测试"有一个鸡生蛋蛋生鸡问题：测试引用了还没写的模块，编译失败。解决方法是先写类型定义和接口——但这又回到了"先实现再测试"。Superpowers 没有明确处理这个矛盾。

**总的来说：** Superpowers 是一套好方法论，但它的假设太理想化了。它假设 spec 是完美的、subagent 能理解意图、review 能解决一切、TDD 自然流畅。在真实项目中，这些假设经常不成立。

但这不是说 Superpowers 没用。恰恰相反，它给了我一个结构化的框架，让"和 AI 协作写代码"这件事从"瞎蒙"变成了"有章可循"。知道它的假设在哪不成立，本身就是一种进步。我觉得这门课的核心不是教你用 Superpowers，而是让你在用完之后，能看出来它哪里好、哪里不好，然后形成自己的判断。
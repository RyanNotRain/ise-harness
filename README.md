# ise-harness

Coding Agent Harness SDK — 将 LLM 封装为可靠编码智能体的工程层。

**重点维度：记忆与上下文管理**（跨会话记忆、代码库知识索引、上下文窗口管理）。

## 安装

npm install ise-harness

## 快速开始

import { Agent, OpenAIProvider } from 'ise-harness';

const agent = new Agent({
  llmProvider: new OpenAIProvider({ apiKey: 'sk-...' }),
  tools: [/* 注册工具 */],
});

const result = await agent.run('创建一个 TypeScript 项目');

## CLI 命令

ise-harness key set      # 录入 key（隐藏输入）
ise-harness key view     # 查看是否已配置（不显示明文）
ise-harness key clear    # 清除 key
ise-harness run "你的任务"  # 运行 agent

## API Key 安全配置

1. 加密文件存储（默认）：使用 ise-harness key set 录入，key 以 AES-256-GCM 加密存储
2. 环境变量：设置 ISE_API_KEY 环境变量（注意：明文风险）
3. 主密码：设置 ISE_MASTER_PASSWORD 环境变量增强加密安全性

## 开发

npm install
npm test
npm run test:demo
npm run build
npm run lint

## 目录结构

src/
├── core/          # Agent 主循环、LLM 抽象层
├── memory/        # 记忆子系统（重点）
├── tools/         # 工具定义与注册
├── governance/    # 护栏、HITL
├── feedback/      # 校验器、反馈回灌
├── config/        # 配置系统
├── credential/    # 凭据加密存储
└── cli/           # CLI 入口

## 已知限制

- sql.js 需要 WASM 支持，部分环境可能受限
- 加密文件存储依赖主密码安全性
- 仅支持 macOS / Linux，Windows 未经测试

## 许可证

MIT
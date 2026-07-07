# AGENTS.md — Coding Agent Harness (iSE Project)

## Project Overview
Build a **Coding Agent Harness** — the engineering layer that turns an LLM into a reliable coding agent.
Focus dimension: **Memory & Context Management** (跨会话记忆、代码库知识索引、上下文窗口管理).

## Tech Stack
- Language: TypeScript (Node.js)
- LLM Provider: OpenAI-compatible API (abstraction layer supports swapping)
- Testing: Vitest
- Distribution: Docker / npm package

## Key Constraints
1. **TDD first**: RED → GREEN → REFACTOR. Never write implementation before tests.
2. **Mock LLM for tests**: All core mechanism tests must work without a real LLM.
3. **No secrets in code**: API keys via system keychain or .env (documented).
4. **Workspace isolation**: git worktrees for parallel development.

## Directory Structure
```
ise/
├── src/
│   ├── core/          # Agent main loop, LLM abstraction
│   ├── memory/        # Memory/context subsystem (FOCUS)
│   ├── tools/         # Tool definitions and dispatcher
│   ├── governance/    # Guardrails, HITL
│   ├── feedback/      # Validator/sensor subsystem
│   └── config/        # Configuration system
├── tests/
│   ├── unit/          # Mock-LLM unit tests
│   └── demo/          # Mechanism demonstration scripts
├── SPEC.md
├── PLAN.md
├── SPEC_PROCESS.md
├── AGENT_LOG.md
├── REFLECTION.md
├── Dockerfile
├── .gitlab-ci.yml
└── README.md
```

## Workflow (Superpowers-aligned)
1. brainstorming → SPEC.md
2. writing-plans → PLAN.md
3. using-git-worktrees → isolated branches
4. subagent-driven-development → one task per session
5. test-driven-development → RED-GREEN-REFACTOR
6. requesting-code-review → spec compliance + code quality
7. finishing-a-development-branch → merge/PR decision

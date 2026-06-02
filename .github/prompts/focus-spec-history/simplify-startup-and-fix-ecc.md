> task-id: simplify-startup-and-fix-ecc
> created: 2026-06-02
> status: confirmed
> confirmed: 2026-06-02T15:30:00+08:00

## 1. 场景还原

用户报告两个问题：

**问题 A：启动流程复杂**
- 当前 `pmcp start` 在终端输出大量上下文（context.md、recent-5.md、summary-10.md、todos.md、dev-rules.md）
- 用户需要等待 AI 解析所有内容后才能选择角色
- 理想流程：用户在终端执行命令 → 命令输出精简状态 → AI 接管后续流程

**问题 B：ECC 检测失效**
- `~/.claude/rules/ecc/` 目录存在（13个文件）
- `~/.claude/agents/` 目录存在（64个 agent 文件）
- 但 `pmcp start` 输出显示 `[4/4] Skill 选择`（独立模式），而不是 `ECC 已检测 → 自动进入需求阶段`
- 代码路径：`cli.ts:408` 的 `if (bootstrapResult.hasEcc)` 判断为 false

## 2. 核心业务边界

**IN（肯定在范围内）：**

IN: src/cli.ts
IN: src/prompts-loader.ts
IN: .github/prompts/context.md
IN: .github/prompts/plans/**

- `src/cli.ts` — start 命令的输出精简
- `src/prompts-loader.ts` — bootstrap 函数的 ECC 检测逻辑
- `.github/prompts/context.md` — 生成逻辑（可选精简）
- `.github/prompts/plans/` — 架构设计文档
- 输出格式优化 — 减少冗余信息，突出关键状态

**OUT（肯定不在范围内）：**

- 不改 Hook 系统（session-start.cjs、pre-tool-use.cjs 等）
- 不改 Hard Gate 门控逻辑
- 不改 Skill 系统本身
- 不改 MCP Server 的工具定义
- 不改 adapters 目录

## 3. 禁止触碰黑名单

- `.claude/settings.json` 的 hook 注册结构 — 不动
- `.prompts-mcp/pre-tool-use.cjs` — 门控逻辑不动
- `.prompts-mcp/session-start.cjs` — SessionStart hook 不动
- `task-state.json` 的 stage 字段结构 — 不动
- `focus-spec.md` 的 4 章格式 — 不动

## 4. 核心测试断言清单

1. **ECC 检测修复**：`pmcp start` 输出中出现 `ECC 已检测 → 自动进入需求阶段`（而非 `Skill 选择`）
2. **ECC 生命周期引导**：输出中包含 `spec-pending → confirmed → task-planning → ...` 流程图
3. **启动流程精简**：`pmcp start` 输出行数 < 100 行（当前约 300+ 行）
4. **关键信息保留**：输出中包含 Hard Gate 状态、当前阶段、下一步操作
5. **角色列表正确**：ECC 模式下只显示 7 个角色（analyst/backend/frontend + architect/review/backend-java/database-handler）
6. **构建通过**：`npm run build` 无错误
7. **测试通过**：`npm test` 无失败
8. **bootstrap 正常**：`pmcp start` 后 AI 能正确加载上下文并进入对应阶段

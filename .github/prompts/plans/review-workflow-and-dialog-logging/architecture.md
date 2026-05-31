# 架构设计：Review 工作流 + 对话级日志

> task-id: review-workflow-and-dialog-logging
> architect phase output

---

## 问题 A：Review 工作流集成

### 现状

- `skills/review.md` 存在且定义完善
- 但 dev-rules.md 和 session-start.sh 中没有将 review 作为开发流程的一环
- 缺少 "开发提交 PR → review 审核 → 测试合并" 的协作定义

### 设计

改动范围仅限文档层，不涉及代码：

**1. dev-rules.md — 新增 §5 开发工作流**

```
§5 开发工作流（角色协作顺序）

Phase 1: 需求预检 → analyst 角色，输出 focus-spec.md，人类签字确认
Phase 2: 架构设计 → architect 角色，输出 plans/<task-id>/ 架构文档
Phase 3: 编码实现 → backend/frontend 角色，实现代码
Phase 4: 代码审查 → review 角色，输出审核报告
Phase 5: 测试合并 → review 确认通过后，由开发角色执行 git merge

PR 流程（单人开发模式）：
- 开发完成后，backend/frontend 在 commit message 中标记 "PR: ready for review"
- 切换到 review 角色，review 读取 diff 并输出审核报告
- review 通过 → 标记 "review: approved" → 开发角色执行合并
- review 不通过 → 标记问题清单 → 开发角色修复后重新提交
```

**2. session-start.sh — bootstrap 输出补充**

在角色选择列表后增加流程提示，让用户知道完整开发周期。

### 断言验证

```
assertFileContains("dev-rules.md", "Phase 4: 代码审查")
assertFileContains("dev-rules.md", "review 角色")
assertFileContains("dev-rules.md", "PR: ready for review")
```

---

## 问题 B：对话级日志系统

### 现状分析

```
PostToolUse (每个工具调用)
  → normalize-log.sh (过滤只读工具，提取 tool/target/summary)
  → auto-log.sh (追加到 JSONL)
  → process-logs.sh (JSONL → recent-5.md + summary-10.md)
```

**问题**：记录粒度是单个工具调用。一条 `git add && git commit` 就是一个 Event，10 条窗口瞬间被 Bash 命令填满。压缩后的 carry-forward 也只是 "Files modified: X; Commands: Y" — 没有任何对话语义。

### 目标状态

用户说"记录每次对话我做了什么"，本质是：

```
用户输入: "我发现两个问题..."
  → [中间工具调用不记录到日志]
  → 对话结束时生成一条摘要:
    "用户提出 review 流程缺失 + 日志需改为对话级两个需求。
     输出了 focus-spec.md 契约文档。"
```

### 架构决策

**ADR-001: 引入 UserPromptSubmit hook 捕获用户消息**

- Claude Code 的 `UserPromptSubmit` 事件在用户提交消息时触发
- stdin 包含 `{ "prompt": "用户输入的文本", "session_id": "...", ... }`
- 用此 hook 将用户消息写入临时文件，作为对话摘要的起点

**ADR-002: 取消逐条工具日志，改为 session 级摘要**

- 删除 PostToolUse 中的 `normalize-log.sh` 调用（不再逐条记录工具调用）
- 保留 JSONL 目录结构（兼容性），但不再写入新数据
- SessionEnd 时读取用户消息 + git diff，生成一条对话摘要

**ADR-003: 对话摘要格式**

每条对话摘要 = 一个结构化条目：

```markdown
## Dialog-NNN

- **Time**: 2026-05-25 10:10
- **User**: 发现两个问题 review 流程缺失 + 日志记录需改为对话级...
- **Outcome**: 输出 focus-spec.md 契约，签字确认
- **Files**: .github/prompts/focus-spec.md, .github/prompts/dev-rules.md
```

- `User`: 用户首条消息的前 200 字符
- `Outcome`: session 结束时从 git diff + 用户消息推断（启发式，非 LLM）
- `Files`: 本次 session 中 git diff 涉及的文件列表

**ADR-004: Outcome 启发式生成规则**

不依赖 LLM 调用（保持纯本地、零延迟）：

```
if 用户消息包含"bug"/"fix"/"修复":
  outcome = "修复: " + 修改的文件列表前3个
elif 用户消息包含"feat"/"新增"/"添加":
  outcome = "新增: " + 修改的文件列表前3个
elif 用户消息包含"refactor"/"重构":
  outcome = "重构: " + 修改的文件列表前3个
elif 有文件修改:
  outcome = "修改了 " + count + " 个文件: " + 文件列表前3个
else:
  outcome = "对话（无文件修改）"
```

### 新数据流

```
UserPromptSubmit
  → adapters/claude-code/capture-prompt.sh
  → 写入 logs/sessions/<session-id>.prompts.jsonl
  （每行: {"time":"...","prompt":"用户消息前500字"}）

SessionEnd
  → adapters/claude-code/session-end.sh
  → hooks/session-end.sh
    → hooks/generate-dialog-summary.sh  (新增)
      读取 logs/sessions/<session-id>.prompts.jsonl
      读取 git diff --name-only (本次 session 修改的文件)
      生成对话摘要条目
      追加到 logs/dialogs/YYYY-MM-DD.dialogs.jsonl
      更新 .github/prompts/recent-5.md
      更新 .github/prompts/summary-10.md
    → git auto-commit
```

### 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `adapters/claude-code/capture-prompt.sh` | UserPromptSubmit adapter，捕获用户消息 |
| 新增 | `hooks/generate-dialog-summary.sh` | 共享层，生成对话摘要 |
| 修改 | `.claude/settings.json` | 添加 UserPromptSubmit hook，移除 PostToolUse 中的 normalize-log |
| 修改 | `.github/prompts/dev-rules.md` | 新增 §5 开发工作流 |
| 保留 | `adapters/claude-code/normalize-log.sh` | 不删除（可能未来调试用），但不再被 hook 调用 |
| 保留 | `hooks/auto-log.sh` | 不删除，但不再被调用 |
| 保留 | `hooks/process-logs.sh` | 不删除（处理旧 JSONL 数据的兼容路径） |

### recent-5.md 新格式

```markdown
# Recent Dialogs (auto-managed by hooks)

> Auto-generated from session summaries. Do not edit manually.
> Showing last 5 dialog sessions.

## Dialog-003

- **Time**: 2026-05-25 10:10
- **User**: 发现两个问题 review 目前缺失...动态日志里记忆全是命令行...
- **Outcome**: 输出 focus-spec.md 契约文档，签字确认
- **Files**: .github/prompts/focus-spec.md

## Dialog-002

- **Time**: 2026-05-25 09:55
- **User**: pmcp start
- **Outcome**: 项目 bootstrap 完成，无文件修改
- **Files**: (none)
```

### summary-10.md 新格式

```markdown
# Dialog Summary (Stateful)

> Auto-managed rolling window. Every 10 dialogs generates a summary with carry-forward.

## W-0001

- Window progress: 3/10

### Carry Forward

Carry-forward from W-0001:
- Dialogs: 3 sessions
- Key topics: review workflow design, dialog logging redesign, project bootstrap
- Files touched: .github/prompts/focus-spec.md, .github/prompts/dev-rules.md
```

### 断言验证

```
assertFileExists("adapters/claude-code/capture-prompt.sh")
assertFileExists("hooks/generate-dialog-summary.sh")
assertJsonField("settings.json", "hooks.UserPromptSubmit")
assertFileNotContains("settings.json", "normalize-log.sh")  // 不再被 hook 调用
assertRecent5Contains("Dialog-")           // 新格式
assertRecent5NotContains("Event-")         // 旧格式消失
assertRecent5Contains("User:")             // 包含用户消息
assertRecent5Contains("Outcome:")          // 包含对话结果
```

---

## 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| UserPromptSubmit 超时阻塞用户输入 | 高 | timeout 设为 5s，脚本只做文件写入 |
| git diff 在 session 中间无法获取完整变更 | 中 | 用 `git diff HEAD` 而非 `git diff --cached` |
| 旧 JSONL 数据丢失 | 低 | 保留旧文件，仅停用写入路径 |
| 启发式 outcome 不准确 | 低 | 记录用户原文，人类可自行判断 |

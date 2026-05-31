> task-id: review-workflow-and-dialog-logging
> created: 2026-05-25T10:10:00+08:00
> status: confirmed

## 1. 场景还原

用户发现两个结构性问题：

**问题 A — Review 流程缺失**：项目角色体系中 analyst → architect → backend/frontend 已存在，但 review 角色没有被嵌入开发工作流。正确流程应为：需求(analyst) → 架构(architect) → 开发(backend/frontend) → 提交 PR → review 审核 → 测试合并。目前 review.md 技能文件存在，但没有在 session-start 流程和 dev-rules 中体现为开发环节的一环。

**问题 B — 动态日志记录的是工具调用而非对话内容**：当前 `normalize-log.sh` 通过 PostToolUse hook 捕获 Bash/Write/Edit 等工具调用，生成的 recent-5.md 和 summary-10.md 全是 `git add`、`git commit`、`npx pmcp start` 这类工具噪音。用户想要的是记录每次对话的**用户意图和解决过程** — 例如"用户提出 X 需求 → 分析后发现 Y 问题 → 用 Z 方案解决"。工具调用只是实现细节，不是对话记忆。目标是通过对话级日志拉高跨 session 的上下文连贯性。

## 2. 核心业务边界

IN: .github/prompts/dev-rules.md
IN: .github/prompts/session-start.sh
IN: .github/prompts/focus-spec.md
IN: .github/prompts/plans/**
IN: .github/prompts/recent-5.md
IN: .github/prompts/summary-10.md
IN: adapters/**
IN: hooks/**
IN: .claude/settings.json

**IN（肯定在范围内）：**

问题 A：
- 在 dev-rules.md 中补充 review 环节的定义（何时触发、职责边界）
- 在 session-start bootstrap 流程中，review 作为开发后环节被提及
- review 接收 PR 并输出审核报告的流程规范
- 开发提交 PR → review 接住 PR → 审核通过后合并的协作模式

问题 B：
- 重新设计日志捕获层：从工具调用级 → 对话级
- 捕获用户消息（UserPromptSubmit hook）作为对话起点
- session 结束时生成对话摘要（本次对话做了什么、解决了什么问题），替代逐条工具调用记录
- recent-5.md 改为展示最近 5 次对话摘要（而非工具事件）
- summary-10.md 改为按对话维度做滚动压缩
- 保持 adapter/shared 两层架构不变

**OUT（肯定不在范围内）：**
- 不修改 review.md 技能文件本身的内容（已足够完善）
- 不实现真正的 Git PR 工作流（本项目是单人开发，PR 是概念性的）
- 不修改 session-end.sh 的 git 自动提交逻辑
- 不触碰 MCP server 核心代码（src/）
- 不实现多 adapter 支持（只改 claude-code adapter + shared hooks）

## 3. 禁止触碰黑名单

- 禁止修改 `src/` 下的 TypeScript 源码（本次改动仅涉及 hooks 和 prompts 层）
- 禁止在日志中捕获 Read/Glob/Grep 等只读工具调用（保持现有过滤策略）
- 禁止让日志系统依赖外部服务（必须纯本地文件）
- 禁止破坏 adapter/shared 两层分离架构（claude-code 特有逻辑必须在 adapters/ 下）

## 4. 核心测试断言清单

问题 A：
```
assertFileContains("dev-rules.md", "review")  // dev-rules 包含 review 环节定义
assertFileContains("dev-rules.md", "PR")       // 定义了 PR 提交-审核-合并流程
assertFileContains("session-start.sh", "review")  // bootstrap 流程提及 review 环节
```

问题 B：
```
assertHookCaptures("UserPromptSubmit")          // 能捕获用户输入消息
assertRecent5Contains("dialog summary")          // recent-5 展示对话摘要而非工具事件
assertRecent5NotContains("git add")              // recent-5 不再包含 Bash 工具调用
assertSummary10Contains("conversation")          // summary-10 按对话维度压缩
assertJsonlContains("user_message")              // JSONL 记录包含用户消息字段
assertAdapterLayerSeparated()                    // claude-code 特有逻辑仍在 adapters/ 下
```

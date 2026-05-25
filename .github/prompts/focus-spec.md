> task-id: observability-and-archive
> created: 2026-05-25T11:50:00Z
> status: confirmed

## 1. 场景还原

用户对系统运行状态感知度低，不知道日志压缩是否正常工作。同时新需求会直接覆盖未完成的 focus-spec，导致进度丢失。需要：
- 启动时显示系统健康摘要（C）
- 提供手动检查命令 `pmcp status`（B）
- 新任务前自动归档旧 focus-spec（A）

## 2. 核心业务边界

IN: src/cli.ts（添加 status 命令）
IN: src/prompts-loader.ts（添加状态加载逻辑）
IN: adapters/claude-code/session-start.sh（添加启动摘要）
IN: .prompts-mcp/adapters/claude-code/session-start.sh（同上）
IN: hooks/process-logs.sh（添加归档逻辑）
IN: .github/prompts/focus-spec-history（归档目录）
OUT: src/index.ts
OUT: 数据库相关文件

## 3. 禁止触碰黑名单

- 禁止删除 PreToolUse hook（scope 校验是唯一硬防线）
- 禁止修改 task-state.json schema
- 禁止删除 SessionStart 补处理逻辑

## 4. 核心测试断言清单

- assertEqual(pmcp status exit code, 0)
- assertStringContains(pmcp status output, "Window")
- assertStringContains(pmcp status output, "Event-")
- assertFileExists(.github/prompts/focus-spec-history/)
- assertEqual(pmcp new-requirement 归档旧文件数, 1)
- assertStringContains(session-start 输出, "最近事件")

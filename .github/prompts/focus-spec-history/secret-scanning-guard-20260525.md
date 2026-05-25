> task-id: secret-scanning-guard
> created: 2026-05-25T15:00:00Z
> status: confirmed

## 1. 场景还原

项目当前没有敏感信息防护。session-end 自动提交使用 `--no-verify` 绕过 git hooks，手动提交也没有 pre-commit 检查。需要建立两层防护：
- 层 1：PostToolUse 写入时预警
- 层 2：Git pre-commit 提交时硬拦截
- 去掉 session-end 的 `--no-verify`，让自动提交也走检查
- 将 Git 提交纪律写入开发规范
- 加固 Hard Gate 输出，防止 AI 跳过预检直接工作

## 2. 核心业务边界

IN: hooks/scan-secrets.sh
IN: .git/hooks/pre-commit
IN: hooks/session-end.sh
IN: .claude/settings.json
IN: .prompts-mcp/hooks/scan-secrets.sh
IN: .prompts-mcp/hooks/post-write-scan.sh
IN: .prompts-mcp/pre-tool-use.cjs
IN: .github/prompts/dev-rules.md
IN: src/prompts-loader.ts
OUT: src/index.ts
OUT: src/cli.ts

## 3. 禁止触碰黑名单

- 禁止删除 PreToolUse hook（scope 校验是唯一硬防线）
- 禁止修改 task-state.json schema
- 禁止删除 SessionStart 补处理逻辑

## 4. 核心测试断言清单

- assertExitCode(hooks/scan-secrets.sh "API_KEY=sk-test123", 1)
- assertExitCode(hooks/scan-secrets.sh "normal code", 0)
- assertStringContains(scan-secrets output "API_KEY")
- assertFileExists(.git/hooks/pre-commit)
- assertNotStringContains(hooks/session-end.sh, "--no-verify")

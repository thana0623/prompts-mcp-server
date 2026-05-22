> task-id: verify-hard-gate-full-chain
> created: 2026-05-22T00:00:00Z
> status: pending-confirmation

## 1. 场景还原

在新 Claude Code 会话中，task-state.json 为 spec-pending，focus-spec.md 未签字。AI 尝试 Write/Edit 任意业务文件时，PreToolUse hook 应返回 exit 2 阻止操作，stderr 提示 "focus-spec has not been confirmed"。用户在终端输入 `y` 签字后，同一 Write 操作应被放行。

## 2. 核心业务边界

IN:  验证 PreToolUse hook 在新会话中实际拦截 Write/Edit
IN:  验证 focus-spec.md 和 task-state.json 例外路径放行
IN:  验证用户输入 y 签字后 hook 放行
IN:  验证 stage 切换到 confirmed 后正常放行
OUT: 不修改 hook 逻辑代码
OUT: 不修改 settings.json 的 hook 配置

## 3. 禁止触碰黑名单

- 禁止绕过 PreToolUse hook 直接修改文件
- 禁止删除或修改 task-state.json 的 stage 字段（除非是签字流程的正常状态变更）

## 4. 核心测试断言清单

- assertHookBlocks("Write", "/src/test.ts", "spec-pending") → exit 2
- assertHookAllows("Write", ".github/prompts/focus-spec.md", "spec-pending") → exit 0
- assertHookAllows("Write", ".github/prompts/task-state.json", "spec-pending") → exit 0
- assertHookAllows("Write", "/src/test.ts", "confirmed") → exit 0
- assertCompilePass()

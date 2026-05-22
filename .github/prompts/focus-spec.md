> task-id: fix-esm-pre-tool-use
> created: 2026-05-22T00:00:00Z
> status: completed
> completed: 2026-05-22T00:00:00Z
> resolution: pre-tool-use.js → .cjs, 全部 5 条断言通过, 待新会话验证 PreToolUse 完整链路

## 1. 场景还原

开发者在当前项目（prompts-mcp-server）中启动 Claude Code 会话，PreToolUse hook 触发 `pre-tool-use.js` 时，Node.js 因 `package.json` 声明 `"type": "module"` 而以 ES Module 模式加载该脚本，导致 `require()` 报错 `ReferenceError: require is not defined in ES module scope`。需要修复此冲突，使 PreToolUse hook 能正常执行并拦截非法 Write/Edit。

## 2. 核心业务边界

IN:  将 `pre-tool-use.js` 重命名为 `pre-tool-use.cjs`，更新 `pre-tool-use.sh` 中的引用路径，确保 Node.js 以 CommonJS 模式加载
IN:   在新会话中验证 PreToolUse hook 生效：spec-pending 状态下 Write 被阻止，用户签字后放行
IN:   验证 focus-spec.md 和 task-state.json 例外路径正常放行
OUT: 不修改 hook 的业务逻辑（检查 stage、exit 0/2 的规则不变）
OUT: 不修改 `package.json` 的 `"type": "module"` 声明

## 3. 禁止触碰黑名单

- 禁止修改 `pre-tool-use.js` 中的 require() 为 import（应通过重命名为 .cjs 解决，而非改写模块语法）
- 禁止删除或弱化 PreToolUse hook 的 stage 检查逻辑
- 禁止修改 `package.json`

## 4. 核心测试断言清单

- assertTrue(fileExists(".prompts-mcp/pre-tool-use.cjs"))
- assertFalse(fileExists(".prompts-mcp/pre-tool-use.js"))
- assertContains("pre-tool-use.cjs", readFile(".prompts-mcp/pre-tool-use.sh"))
- assertEquals(0, runNode(".prompts-mcp/pre-tool-use.cjs"))  // CommonJS 加载成功，无 require 报错
- assertCompilePass()

> task-id: hard-gate-scope-check-new-requirement
> created: 2026-05-23T00:00:00Z
> status: confirmed

## 1. 场景还原

用户已签字进入 confirmed 阶段，正在按 focus-spec 开发。开发过程中出现新需求或需求延伸，当前系统无任何代码级检测机制，所有 Write/Edit 均被放行，Hard Gate 形同虚设。

需要：
- PreToolUse hook 在 confirmed 阶段增加文件范围校验（从 focus-spec.md 的 IN 行提取允许路径）
- 新增 `pmcp new-requirement` 命令，显式重置状态机回 spec-pending
- 超范围文件写入被阻止，提示用户明确归属（新需求 / 延伸扩展）

## 2. 核心业务边界

IN: .prompts-mcp/pre-tool-use.cjs
IN: src/cli.ts
IN: .github/prompts/focus-spec.md
IN: .github/prompts/dev-rules.md
OUT: 不修改 MCP Server（src/index.ts）的工具实现
OUT: 不修改 hooks/ 目录下的共享脚本
OUT: 不修改 adapters/ 目录
OUT: 不引入新的 npm 依赖

## 3. 禁止触碰黑名单

- 禁止将 pre-tool-use.cjs 改为 .js（ES Module 冲突已解决，不要回退）
- 禁止在 hook 中使用 `require('child_process')` 执行外部命令
- 禁止修改 task-state.json 的 schema（stage/history 结构不变）
- 禁止删除 spec-pending 阶段的 focus-spec.md / task-state.json 例外放行

## 4. 核心测试断言清单

### 4.1 范围校验 — 超范围阻止

```
前置：stage=confirmed, focus-spec IN: src/api/**, src/models/**
操作：Write src/frontend/Button.tsx
断言：exit 2, stderr 包含 "不在当前 focus-spec 范围内"
```

### 4.2 范围校验 — 范围内放行

```
前置：stage=confirmed, focus-spec IN: src/api/**, src/models/**
操作：Write src/api/users.ts
断言：exit 0
```

### 4.3 范围校验 — 目录级通配

```
前置：stage=confirmed, focus-spec IN: src/api/**
操作：Write src/api/v2/deep/nested.ts
断言：exit 0
```

### 4.4 Fast-Track 无限制

```
前置：stage=confirmed, focus-spec IN: *（Fast-Track 模式）
操作：Write any/path/file.ts
断言：exit 0
```

### 4.5 spec-pending 保持原有行为

```
前置：stage=spec-pending
操作：Write src/test.ts
断言：exit 2（与当前行为一致，不受新逻辑影响）
```

### 4.6 例外文件始终放行

```
前置：stage=spec-pending
操作：Write .github/prompts/focus-spec.md
断言：exit 0（与当前行为一致）
```

### 4.7 new-requirement 重置状态

```
前置：stage=confirmed
操作：执行 pmcp new-requirement
断言：task-state.json stage 变为 spec-pending
断言：task-state.json history 最后一条 stage 为 spec-pending
```

### 4.8 重置后拦截生效

```
前置：刚执行完 pmcp new-requirement（stage=spec-pending）
操作：Write src/anything.ts
断言：exit 2
```

### 4.9 IN 行解析 — 无 IN 行时阻止所有

```
前置：stage=confirmed, focus-spec 无 IN 行
操作：Write src/test.ts
断言：exit 2
```

### 4.10 IN 行解析 — 多路径匹配

```
前置：stage=confirmed, focus-spec IN: src/api/**, src/utils/**
操作：Edit src/utils/helper.ts
断言：exit 0
```

### 4.11 TypeScript 编译

```
assertCompilePass()
```

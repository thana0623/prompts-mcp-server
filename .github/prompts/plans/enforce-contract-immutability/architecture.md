# Architecture: Enforce Contract Immutability

## 问题分析

当前 pre-tool-use.cjs 第 39 行：
```js
if (file.includes('focus-spec.md') || file.includes('task-state.json')) {
  process.exit(0);  // 任何阶段都放行
}
```

导致 stage=confirmed 时，AI 可以直接修改已签字的 focus-spec.md，契约形同虚设。

## 状态机设计

```
spec-pending ──(用户签字)──→ confirmed
                                   │
                                   ├──(AI 尝试改 focus-spec)──→ BLOCKED
                                   │
                                   ├──(用户说"需求变更")──→ change-requested
                                   │                              │
                                   │                              ├──→ AI 修改 focus-spec
                                   │                              └──→ pending-confirmation
                                   │                                        │
                                   │                                        └──(用户签字)──→ confirmed (新 hash)
                                   │
                                   └──(session 启动 hash 校验失败)──→ spec-pending
```

## 组件变更

### 1. pre-tool-use.cjs — 写保护 + 完整性校验

```
阶段 1: 工具过滤
  非 Write/Edit → 放行

阶段 2: focus-spec.md 写入判断
  stage=spec-pending        → 放行（analyst 正在写）
  stage=change-requested    → 放行（用户已授权变更）
  stage=confirmed           → 拦截！契约已锁定

阶段 3: task-state.json 写入判断
  始终放行

阶段 4: 其他文件写入判断
  stage=spec-pending → 拦截
  stage=confirmed → hash 校验
    hash 匹配 → 按 IN 范围检查放行
    hash 不匹配 → 回退到 spec-pending，提示"契约被篡改"
  stage=change-requested → 放行

阶段 5: IN 范围检查（已有逻辑，不变）
```

### 2. task-state.json — 新增 contractHash

签字时写入 SHA256，变更流程中由 analyst 重新计算。

### 3. session-start.sh — 启动校验

stage=confirmed 时校验 hash，不匹配则回退到 spec-pending。

### 4. 需求变更流程（用户驱动）

触发词："需求变更"/"改需求"/"change requirement"
流程：confirmed → change-requested → 编辑 → pending-confirmation → 签字 → confirmed

## 文件变更清单

| 文件 | 变更类型 |
|------|---------|
| `.prompts-mcp/pre-tool-use.cjs` | 修改 |
| `.github/prompts/task-state.json` | 修改 |
| `adapters/claude-code/session-start.sh` | 修改 |
| `src/__tests__/pre-tool-use.test.ts` | 修改 |

## 不变部分

- focus-spec.md 4 章格式
- hooks/ 共享脚本
- ECC 规则文件
- IN 范围检查逻辑

# 架构设计文档

> task-id: simplify-startup-and-fix-ecc
> created: 2026-06-02
> status: confirmed

## 问题分析

### 问题 A：ECC 检测失效

**现象：**
- `~/.claude/rules/ecc/` 目录存在（13个文件）
- `~/.claude/agents/` 目录存在（64个 agent 文件）
- 但 `pmcp start` 输出显示 `[4/4] Skill 选择`（独立模式）

**根因：**
```
cli.ts:404  → bootstrapResult = bootstrap()
cli.ts:408  → if (bootstrapResult.hasEcc) → false

prompts-loader.ts:213 → hasEcc = fs.existsSync(path.join(homeDir, '.claude', 'rules', 'ecc'))
```

**假设：**
1. `bootstrap()` 函数在 cli.ts 中调用时，`homeDir` 变量取值不同
2. 或者 `cli.ts` 中 import 的 `bootstrap` 函数有缓存问题

### 问题 B：启动流程复杂

**当前输出：** 约 300+ 行
- context.md 完整内容
- recent-5.md 完整内容
- summary-10.md 完整内容
- todos.md 完整内容
- dev-rules.md 完整内容
- Skills 列表

**目标输出：** < 100 行
- Hard Gate 状态（1行）
- 当前阶段（1行）
- 下一步操作（1行）
- 角色列表（精简）

## 架构决策

### ADR-001: ECC 检测逻辑修复

| 维度 | 决策 |
|------|------|
| 问题 | `bootstrap()` 返回的 `hasEcc` 为 false，但 ECC 目录存在 |
| 方案 | 在 `cli.ts` 中直接检测 ECC，不依赖 `bootstrap()` 返回值 |
| 理由 | 最小改动，避免修改 `prompts-loader.ts` 的 `bootstrap` 函数签名 |
| 风险 | 低 — 只是增加一个独立检测点 |
| 实现 | `const hasEcc = fs.existsSync(path.join(homeDir, '.claude', 'rules', 'ecc'))` |

### ADR-002: 启动流程精简

| 维度 | 决策 |
|------|------|
| 问题 | `formatBootstrap()` 输出 300+ 行，包含大量上下文 |
| 方案 | 新增 `formatBootstrapCompact()` 函数，只输出关键状态 |
| 理由 | 保持 `formatBootstrap()` 不变（session-start.cjs 仍需要完整输出），CLI 用精简版 |
| 风险 | 低 — 新增函数，不影响现有逻辑 |
| 实现 | 在 `prompts-loader.ts` 中新增函数，cli.ts 调用精简版 |

## 模块边界

```
src/
  cli.ts                    # 修改：ECC 检测 + 精简输出
  prompts-loader.ts         # 修改：新增 formatBootstrapCompact()
```

**依赖关系：**
```
cli.ts
  ├── import { bootstrap, formatBootstrap, formatBootstrapCompact } from './prompts-loader.js'
  └── 直接检测 ECC 目录（不依赖 bootstrap 返回值）
```

## 实现计划

### Step 1: 修复 ECC 检测

在 `cli.ts` 的 Step 4 之前，直接检测 ECC：

```typescript
// Step 3.5: ECC 检测（独立于 bootstrap）
const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
const hasEcc = fs.existsSync(path.join(homeDir, '.claude', 'rules', 'ecc'));
```

### Step 2: 新增精简输出函数

在 `prompts-loader.ts` 中新增：

```typescript
export function formatBootstrapCompact(result: BootstrapResult): string {
  // 只输出：Hard Gate 状态、当前阶段、下一步操作
  // 不输出：context.md、recent-5.md、summary-10.md、todos.md、dev-rules.md
}
```

### Step 3: 修改 cli.ts 输出

```typescript
// Step 3: 加载上下文
console.log('\n[3/4] 加载上下文...\n');
const bootstrapResult = bootstrap();
console.log(formatBootstrapCompact(bootstrapResult));  // 使用精简版

// Step 4: 角色选择 / ECC 自动进入需求
if (hasEcc) {  // 使用直接检测结果
  // ECC 模式
} else {
  // 独立模式
}
```

## 断言清单映射

| 断言 | 实现验证点 |
|------|-----------|
| ECC 检测修复 | `pmcp start` 输出中出现 `ECC 已检测 → 自动进入需求阶段` |
| ECC 生命周期引导 | 输出中包含 `spec-pending → confirmed → task-planning → ...` 流程图 |
| 启动流程精简 | `pmcp start` 输出行数 < 100 行 |
| 关键信息保留 | 输出中包含 Hard Gate 状态、当前阶段、下一步操作 |
| 角色列表正确 | ECC 模式下只显示 7 个角色 |
| 构建通过 | `npm run build` 无错误 |
| 测试通过 | `npm test` 无失败 |
| bootstrap 正常 | `pmcp start` 后 AI 能正确加载上下文 |

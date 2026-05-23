# v2 Architecture Reference

> 状态：参考方向，非当前实施计划
> 日期：2026-05-22
> 基于：v1.0.1 全源码分析

---

## 当前系统三层建模

### Execution Layer（存在，完整）

- `pre-tool-use.cjs` — stdin → read state → exit 0/2
- `normalize-log.sh` → `auto-log.sh` — stdin → transform → append JSONL
- `session-start.sh` → `bootstrap()` — read files → format output
- `session-end.sh` → `process-logs.sh` → git commit
- MCP Server — 19 tools via stdio transport
- CLI — `pmcp start / setup / bootstrap / check / plan / ...`
- `initPrompts()` — scan project → generate files
- `bootstrap()` — read 10+ files → format output

### Policy Layer（名义存在，实际是文本）

- **Hard Gate**：唯一可执行策略 — `pre-tool-use.cjs` 第 34-43 行，15 行硬编码 if-statement，二值状态机
- **其余所有"策略"都是 markdown**，AI 自愿遵守：
  - `dev-rules.md` → AI 读取，零程序化执行
  - `focus-spec.md` → AI 读取，零断言自动验证
  - Skill definitions → AI 读取为角色 prompt，零权限约束
  - Rules (`add_rule`) → 存为 .md 文件，零合规检查
  - `check_requirements()` → 检查文本是否"描述了"目标，不验证可行性

### Memory Layer（存在，但不可检索）

- `task-state.json` — `{ stage, taskId, history[] }`
- `log-state.json` — `{ nextEntryId, windowId, ... }`
- `logs/dialogs/YYYY-MM-DD.jsonl` — 追加写入，无索引
- `recent-5.md` / `summary-10.md` — bash 脚本单向压缩生成
- `context.md` — 项目快照
- `modules/*.md` — 模块历史 markdown 表格
- `todos.md` — 待办
- `~/.pmcp/skills/` — Skill 定义 + 学习记录

### Control Plane（完全缺失）

- 无观察 API、无控制 API、无恢复机制、无健康检查、无多项目管理
- 唯一干预方式：人类手动编辑 JSON 文件

---

## 成熟度判断

### MVP — demo-quality

核心闭环（init → gate → work → log → commit）功能正常，但：

- PreToolUse hook 错误处理 `catch { exit 0 }` — 安全门控失败时静默放行（fail-open）
- task-state.json 无完整性校验 — 任何人直接编辑文件即可绕过门控
- 关键路径零测试覆盖 — gate/hooks/MCP tool handlers 无自动化测试
- 无并发安全 — 两 session 写同一 JSONL 会损坏

### 非 Production Ready

生产就绪硬门槛全部未满足：

- fail-close 安全模型
- 状态完整性校验
- 并发安全
- 关键路径测试
- 失败恢复
- 可观测性

### 系统类型：Single-Agent Runtime

管理一个 Claude Code 会话。不协调多 agent，不跨项目运行，不提供服务保证。是 agent 的附属品，不是独立 infrastructure。

---

## 根因归因

### 根因 1：Policy is prose, not code

所有规则、角色、约束以自然语言存在 markdown。系统依赖 AI 阅读并"遵守"它们。Hard Gate 是唯一例外（15 行硬编码 if），但不可配置。Skill 系统本质是 prompt injection，不是访问控制。

### 根因 2：Memory is a file dump, not a database

JSONL 追加写入，无索引，无查询语言，无 schema。唯一消费者是 bash 脚本（生成 markdown 摘要）。recent-5/summary-10 是单向压缩，原始细节不可恢复。系统积累数据但没有积累知识。

### 根因 3：No control plane

所有状态转换是人或 AI 编辑文件。系统无自省能力——无法观测自身状态、无法自动恢复、无法跨项目管理。Hook 失败无重试，状态损坏无恢复。

---

## v2 架构

### 总览

```
                              CONTROL PLANE (new)
                         ┌──────────────────────────┐
                         │  health  │ state  │ recov │
                         │  check   │ mgr    │ engine│
                         │  ─────── │ ────── │ ───── │
                         │  multi-project dashboard  │
                         └───────────┬──────────────┘
                                     │ MCP + local HTTP
                                     │
                              POLICY ENGINE (new)
                         ┌──────────────────────────┐
                         │  rule evaluator          │
                         │  risk assessor           │
                         │  capability resolver     │
                         │  compliance tracker      │
                         │                          │
                         │  Policy Store:            │
                         │  .pmcp/policies/*.json   │
                         └───────────┬──────────────┘
                                     │
                              EXECUTION LAYER
                         ┌──────────────────────────┐
                         │  Gate Chain L0→L1→L2→L3  │
                         │  Hook Runner             │
                         │  MCP Server              │
                         │  CLI                     │
                         └───────────┬──────────────┘
                                     │
                              EVENT STORE (upgraded)
                         ┌──────────────────────────┐
                         │  append API  │ query eng  │
                         │  index (sqlite)          │
                         │  compaction manager      │
                         │                          │
                         │  .pmcp/events.db         │
                         └──────────────────────────┘
```

### Policy Engine — Skill 系统升级为 policy-driven

当前：Skill = markdown 文件，`select_skill()` 返回文本，AI 读取后"扮演"角色。

v2：每个 Skill 携带可执行的 capability manifest + risk profile，Policy Engine 在每次操作前评估。

Skill 定义从 markdown 迁移为结构化 JSON：

```json
{
  "name": "frontend",
  "version": "2.1.0",
  "capabilities": {
    "write": {
      "allowed": ["src/components/**", "src/pages/**", "src/styles/**"],
      "denied": ["src/api/**", "src/auth/**", "**/*.env*"]
    },
    "bash": {
      "allowed": ["npm test", "npm run build", "npm run lint"],
      "denied": ["rm -rf", "git push --force"]
    }
  },
  "riskProfile": {
    "defaultRisk": 1,
    "escalationRules": [
      { "pattern": "src/api/**", "escalateTo": 2 },
      { "pattern": "**/*.test.*", "reduceTo": 0 }
    ]
  },
  "identity": "企业级高级前端UI工程师...",
  "guidelines": "组件化开发，保持 UI 风格一致...",
  "learnings": [
    {
      "version": "2.1.0",
      "date": "2026-05-22",
      "topic": "form-validation",
      "insight": "..."
    }
  ]
}
```

Policy 合并规则：Core < Project < User < Session。高优先级覆盖低优先级，冲突取最严格。

Skill 切换：操作超出当前 Skill capability 边界时，Policy Engine 返回 `warn + suggest-switch`，不直接阻止。

### Multi-Level Gate Chain — Hard Gate 升级

当前：二值状态机，一个 if-statement，所有操作同等对待。

v2：四级闸门链。

```
Operation: tool=Write, file=src/auth/login.ts, skill=backend

  Gate L0: Integrity Check
  ─────────────────────────────────────
  校验 task-state.json hash
  校验 policy 文件未被篡改
  → Fail: exit 2 "State integrity violation"

  Gate L1: Risk Classification
  ─────────────────────────────────────
  匹配文件路径到 risk profile:
    src/auth/**  → risk 3

  Risk 0 (docs/css/tests):  auto-approve
  Risk 1 (components):     requires focus-spec signed
  Risk 2 (api/routes):     requires focus-spec + test plan
  Risk 3 (auth/schema/env):requires focus-spec + human commit

  Gate L2: Capability Check
  ─────────────────────────────────────
  查询当前 Skill capability manifest
  backend skill 写 auth → warn + suggest-switch

  Gate L3: State Consistency
  ─────────────────────────────────────
  检查未提交变更、测试状态、并发 session
```

Risk profile 从硬编码迁移为可配置文件 `.pmcp/policies/risk-profile.json`。

### Event Store — 日志升级为可检索系统

当前：JSONL 追加 → bash 脚本生成 markdown。不可查询。

v2：SQLite 作为事件存储。

```
Schema:

events
  id, timestamp, session_id, event_type, tool_name,
  file_path, gate_result, skill, risk_level, detail(JSON),
  prev_event_id (causal chain FK)

sessions
  id, started, ended, skill, project

state_transitions
  id, timestamp, from_stage, to_stage, triggered_by, reason

compaction_runs
  id, run_at, events_before, events_after, strategy
```

新增 MCP 工具：`query_events`、`get_session_timeline`、`get_module_history`、`search_events`、`get_stats`。

Compaction：30 天 → 摘要压缩，90 天 → 归档到 `~/.pmcp/archive/`。

recent-5 / summary-10 变为 SQL View，不再生成 markdown。

### Control Plane — 观察、干预、恢复

| 组件 | 功能 | 接口 |
|------|------|------|
| Health Checker | event store 可写、policy store 一致、hook 配置有效、stuck session 检测 | MCP: `system_health()` |
| State Manager | 读取任意项目 stage、强制状态转换（带审计）、覆盖门控（带理由）、列出活跃 session | MCP: `get_state()`, `force_transition()`, `override_gate()`, `list_sessions()` |
| Recovery Engine | 检测失败、重试、回滚、升级 | 自动触发，MCP: `recovery_status()` |
| Multi-Project | Dashboard CLI | `pmcp dashboard` |

Recovery 流程：

```
Hook 失败 (non-zero exit)
  → 写入 error event
  → 同输入重试一次
  → 仍失败 → 匹配已知错误模式
    → 匹配 → 自动修复
    → 未匹配 → 升级：阻止后续操作，通知用户

状态损坏 (hash mismatch)
  → 写入 corruption event
  → 从 .pmcp/backups/ 恢复
  → 无备份 → 升级：人工介入
```

每次 task-state.json 变更自动备份（保留最近 20 版本）。

### 跨项目复用

```
全局 (~/.pmcp/)
  policies/
    risk-profile.default.json    ← npm 包分发，版本锁定
    risk-profile.custom.json     ← 用户自定义，跨项目生效
  skills/
    core/                        ← 随 npm 更新
    custom/                      ← 用户创建，语义化版本
  archive/                       ← 90 天以上归档

项目 (.pmcp/)
  policies/
    risk-profile.json            ← 项目覆盖配置
  events.db                      ← 本地事件存储
  backups/                       ← 自动状态备份
```

同步命令：`pmcp policy pull/push`、`pmcp skill pull/push`。

---

## 实施分期

| Phase | 内容 | 依赖 | 预估 |
|-------|------|------|------|
| **P1: Event Store** | SQLite 替换 JSONL、结构化 schema、query API（4 个新 MCP 工具）、compaction | 无 | 2-3 周 |
| **P2: Policy Engine** | Rule evaluator、risk profile 配置、capability manifest、Skill 从 .md 迁移到 .json | P1 | 2-3 周 |
| **P3: Multi-Level Gate** | Gate chain L0→L3、policy-driven 决策、gate decision 写入 event store | P2 | 1-2 周 |
| **P4: Control Plane** | Health checker、state manager、recovery engine（retry + rollback + escalate） | P2 | 2 周 |
| **P5: Cross-Project** | Dashboard CLI、跨项目查询、global policy sync | P4 | 1-2 周 |

P1 必须先做——没有 event store，policy engine 没有数据源，control plane 没有观测对象。

---

## v1 → v2 核心变化

| 维度 | v1 | v2 |
|------|----|----|
| Policy | markdown 文本，AI 自愿遵守 | 可执行 rule engine，程序化执行 |
| Gate | 二值 hardcoded if | 四级闸门链，risk profile 可配置 |
| Skill | prompt 模板 | capability manifest + 权限边界 |
| Memory | 追加 JSONL，不可检索 | SQLite event store，可查询 |
| 摘要 | bash 生成 markdown | SQL View，实时聚合 |
| 控制 | 无，手动编辑文件 | control plane API + auto-recovery |
| 多项目 | 独立孤岛 | 全局 policy sync + dashboard |
| 错误处理 | fail-open | fail-close + retry + rollback + escalate |

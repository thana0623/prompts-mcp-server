# pmcp-server

[![npm version](https://img.shields.io/npm/v/pmcp-server.svg)](https://www.npmjs.com/package/pmcp-server)
[![license](https://img.shields.io/npm/l/pmcp-server.svg)](https://github.com/thana0623/prompts-mcp-server/blob/master/LICENSE)

AI 无关的上下文生命周期基础设施：Hook 驱动日志 + Hard Gate 需求门控 + MCP 上下文管理 + 角色技能系统。

核心设计：**脚本管状态，AI 管语义**。不依赖 AI 主动调用日志工具。

---

## 目录

- [快速开始](#快速开始)
- [全流程报告](#全流程报告)
- [操作难度评估](#操作难度评估)
- [架构设计](#架构设计)
- [Hard Gate 需求门控](#hard-gate-需求门控)
- [Skill 角色系统](#skill-角色系统)
- [ECC 集成](#ecc-集成)
- [支持的 AI 助手](#支持的-ai-助手)
- [CLI 命令参考](#cli-命令参考)
- [MCP 工具参考](#mcp-工具参考)
- [开发](#开发)

---

## 快速开始

### 1. 安装（一次性）

```bash
npm install -g pmcp-server
```

### 2. 注册为全局命令（一次性）

```bash
pmcp register
```

这会在 `~/.claude/CLAUDE.md` 中注册 `pmcp` 为已知全局工具。之后在任何项目中输入 `pmcp start`，Claude Code 将直接执行。

> 移除：`pmcp unregister`

### 3. 一键启动（每个项目一次）

```bash
cd /your/project
pmcp start
```

自动完成：
- 生成 `.github/prompts/` 上下文文件体系
- 复制 hooks + adapter 到 `.prompts-mcp/`
- 生成 `.claude/settings.json`（SessionStart / PostToolUse / SessionEnd hooks）
- 初始化全局 Skill 仓库 `~/.pmcp/skills/`
- 加载全部上下文
- 检测 ECC（如已安装，展示 ECC 能力引导）
- 提示选择角色（Skill）

### 4. 日常使用

直接用 Claude Code 打开项目。SessionStart hook 自动加载上下文，PostToolUse hook 自动记录日志，SessionEnd hook 自动处理日志并 git commit。**全程无需手动操作。**

---

## 全流程报告

### 总体流程概览

```
┌──────────────────────────────────────────────────────────────┐
│                    一次性安装 & 注册                           │
│  npm install -g pmcp-server  →  pmcp register                │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│                    项目初始化（pmcp start）                     │
│                                                              │
│  Step 1  检测项目 → 生成 .github/prompts/ 上下文文件            │
│  Step 2  初始化全局 Skill 仓库 ~/.pmcp/skills/                 │
│  Step 3  加载全部上下文（context + recent + summary + todos）    │
│  Step 3.5 检测 ECC → 展示能力引导（如已安装）                    │
│  Step 4  提示用户选择 Skill 角色                               │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│                    Session 生命周期（全自动）                    │
│                                                              │
│  ┌─ SessionStart ──────────────────────────────────────────┐ │
│  │  session-start.sh → bootstrap → 加载全部上下文            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           ↓                                   │
│  ┌─ Hard Gate 检查 ────────────────────────────────────────┐ │
│  │  PreToolUse hook 拦截 Write/Edit                          │ │
│  │  focus-spec.md 未签字 → exit 2 阻止                       │ │
│  │  用户输入 y 签字 → stage=confirmed → 放行                  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           ↓                                   │
│  ┌─ 开发过程 ──────────────────────────────────────────────┐ │
│  │  AI 以选定 Skill 角色工作                                 │ │
│  │  遵循 dev-rules.md 规范                                   │ │
│  │  PostToolUse hook → normalize-log.sh → auto-log.sh       │ │
│  │  → 每次工具调用自动写入 logs/dialogs/YYYY-MM-DD.jsonl     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           ↓                                   │
│  ┌─ SessionEnd ────────────────────────────────────────────┐ │
│  │  session-end.sh → process-logs.sh                        │ │
│  │  → 更新 recent-5.md（最近 5 条事件）                       │ │
│  │  → 更新 summary-10.md（滚动窗口摘要）                      │ │
│  │  → git commit 所有变更                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 各阶段详细说明

#### 阶段 0：安装与注册

| 步骤 | 操作 | 说明 |
|------|------|------|
| 安装 | `npm install -g pmcp-server` | 全局安装 CLI + MCP Server |
| 注册 | `pmcp register` | 写入 `~/.claude/CLAUDE.md`，使 AI 识别 `pmcp` 为已知命令 |

#### 阶段 1：项目初始化

| 步骤 | 触发方式 | 产出物 |
|------|---------|--------|
| 扫描项目 | `initPrompts()` | 检测语言、框架、构建工具 |
| 生成上下文 | 自动 | `.github/prompts/context.md` |
| 生成规范 | 自动 | `.github/prompts/dev-rules.md` |
| 生成待办 | 自动 | `.github/prompts/todos.md` |
| 生成日志 | 自动 | `.github/prompts/recent-5.md`、`summary-10.md` |
| 复制 hooks | 自动 | `.prompts-mcp/hooks/`（核心脚本） |
| 复制 adapter | 自动 | `.prompts-mcp/adapters/<assistant>/`（适配器） |
| 生成配置 | 自动 | `.claude/settings.json`（Hook 配置） |
| 初始化 Skill | 自动 | `~/.pmcp/skills/core/` + `~/.pmcp/skills/custom/` |

#### 阶段 2：ECC 检测（可选）

如检测到 ECC 已安装（`~/.claude/rules/ecc/` 存在），展示精简版 ECC 能力引导，包括可用命令和 PMCP + ECC 分工说明。未安装则跳过此步骤。

#### 阶段 3：角色选择

启动后根据 ECC 是否安装展示不同角色列表：

**ECC 模式（角色由 ECC agents 统一管理）：**

| 角色 | 类型 | 职责 |
|------|------|------|
| analyst | PMCP | 需求分析、场景还原、边界枚举、输出 focus-spec.md |
| backend | PMCP | API 设计、数据库、服务端架构 |
| frontend | PMCP | 企业级前端 UI 开发 |
| architect | ECC | 架构一致性、模块边界、API 规范 |
| review | ECC | 代码审查、架构一致性检测 |
| backend-java | ECC | SpringBoot 后端开发 |
| database-handler | ECC | 数据库操作、数据清洗 |

**独立模式（PMCP Skills 全部可用）：**

| # | Skill | 职责 |
|---|-------|------|
| 1 | analyst | 需求分析、场景还原、边界枚举、输出 focus-spec.md |
| 2 | architect | 架构一致性、模块边界、API 规范 |
| 3 | backend-java | SpringBoot 后端开发 |
| 4 | backend | API 设计、数据库、服务端架构 |
| 5 | frontend | 企业级前端 UI 开发 |
| 6 | review | 代码审查、架构一致性检测 |
| 7 | database-handler | 数据库操作、Excel 数据清洗 |

#### 阶段 4：Hard Gate 需求门控

这是项目的核心安全机制。在 AI 执行任何 Write/Edit 操作之前，PreToolUse hook 检查 `task-state.json` 的 `stage` 字段：

```
stage=spec-pending
  ├── Write/Edit focus-spec.md     → exit 0（例外放行）
  ├── Write/Edit task-state.json   → exit 0（例外放行）
  └── Write/Edit 其他业务文件       → exit 2（阻止 + stderr 提示）

stage=confirmed
  └── 所有操作                      → exit 0（正常放行）
```

用户通过在终端输入 `y` 或 `approve` 签字确认 focus-spec.md，状态机从 `spec-pending` 切换到 `confirmed`。

#### 阶段 5：自动日志

每次 AI 调用工具（Write、Edit、Bash 等），PostToolUse hook 自动触发：

```
Claude Code 原生格式
  → adapters/claude-code/normalize-log.sh（格式转换）
  → hooks/auto-log.sh（写入 JSONL）
  → logs/dialogs/YYYY-MM-DD.jsonl
```

#### 阶段 6：会话结束

SessionEnd hook 触发：
1. `process-logs.sh` 解析 JSONL → 更新 `recent-5.md`（最近 5 条）+ `summary-10.md`（每 10 条生成滚动摘要）
2. `git commit` 提交所有变更

### 文件体系总览

```
your-project/
  .pmcp-root                          # 项目根目录标记
  .prompts-mcp/
    hooks/                            # 共享核心脚本（助手无关）
      auto-log.sh                     # 标准化 JSON → JSONL
      process-logs.sh                 # JSONL → recent-5 + summary-10
      session-end.sh                  # 处理日志 + git commit
    adapters/
      claude-code/                    # Claude Code 适配器
        normalize-log.sh              # Claude Code 格式 → 标准化 JSON
        session-start.sh              # SessionStart hook
        session-end.sh                # SessionEnd hook
    pre-tool-use.cjs                  # Hard Gate 拦截脚本
    mcp-server-path                   # MCP server 入口路径
  .claude/
    settings.json                     # Hook 配置
  .github/prompts/
    context.md                        # 项目上下文总览
    dev-rules.md                      # 开发规范
    focus-spec.md                     # 需求规格（Hard Gate 检查）
    task-state.json                   # 状态机（spec-pending / confirmed）
    recent-5.md                       # 最近 5 条事件
    summary-10.md                     # 滚动窗口摘要
    todos.md                          # 待办事项
    log-state.json                    # 日志状态
    skills/                           # 项目级 Skill 定义
    modules/                          # 模块变更记录
  logs/dialogs/
    YYYY-MM-DD.jsonl                  # 每日工具调用日志
```

---

## 操作难度评估

### 用户视角

| 操作 | 频率 | 难度 | 说明 |
|------|------|------|------|
| 全局安装 | 一次 | ★☆☆☆☆ | 一条 `npm install -g` 命令 |
| 注册命令 | 一次 | ★☆☆☆☆ | 一条 `pmcp register` 命令 |
| 项目初始化 | 每项目一次 | ★☆☆☆☆ | 一条 `pmcp start` 命令，全自动 |
| 选择 Skill | 每次会话 | ★☆☆☆☆ | 输入编号或名称即可 |
| 需求签字 | 每次新需求 | ★☆☆☆☆ | 在终端输入 `y` 确认 |
| 日常开发 | 每天 | ★☆☆☆☆ | 无需任何操作，全自动 |

**总结：对最终用户而言，操作难度极低。** 三条命令完成全部设置，之后零操作。

### 开发者视角（理解本项目源码）

| 模块 | 复杂度 | 说明 |
|------|--------|------|
| CLI（`src/cli.ts`） | ★★★☆☆ | 1200 行，命令路由 + 初始化流程，逻辑直白 |
| MCP Server（`src/index.ts`） | ★★★☆☆ | 1020 行，19 个 MCP 工具实现，模板化程度高 |
| PreToolUse Hook（`pre-tool-use.cjs`） | ★★☆☆☆ | 50 行，单文件纯函数，stdin → 检查 → exit |
| Hooks（bash） | ★★★☆☆ | 3 个 shell 脚本，JSON 管道处理 |
| Adapters | ★★☆☆☆ | 每个助手 2-3 个薄适配脚本 |
| Skills 系统 | ★★★☆☆ | 文件系统 + frontmatter 解析 |
| Context 生成 | ★★★☆☆ | 项目扫描 + 模板生成 |

### 关键技术决策

| 决策 | 理由 |
|------|------|
| **脚本管状态，AI 管语义** | Hook 脚本负责状态检查/日志写入（确定性），AI 负责语义理解（非确定性），边界清晰 |
| **Adapter 模式** | 核心 hooks 与 AI 助手解耦，新增助手只需写薄适配层 |
| **文件系统即数据库** | 所有状态持久化到 markdown/json 文件，零依赖，可 git 追踪 |
| **Hard Gate 在 hook 层而非 AI 层** | AI 可以被 prompt injection 绕过，但 OS 级 hook（exit 2）无法绕过 |
| **PreToolUse 而非 PostToolUse 做门控** | 在操作执行前拦截，而非事后检测 |

---

## 架构设计

### 分层架构

```
┌─────────────────────────────────────────────────┐
│                  AI 助手                          │
│  Claude Code / Cline / Cursor / Windsurf / ...   │
└──────────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────┐
    │    适配器层           │  adapters/<assistant>/
    │  normalize-log.sh    │  转换原生格式 → 标准化 JSON
    │  session-start.sh    │  会话启动钩子
    │  session-end.sh      │  会话结束钩子
    └──────────┬──────────┘
               │ pipe
    ┌──────────▼──────────┐
    │    共享核心层         │  hooks/
    │  auto-log.sh         │  JSONL 写入
    │  process-logs.sh     │  滚动窗口更新
    │  session-end.sh      │  处理 + git commit
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │    Hard Gate 层      │  .prompts-mcp/
    │  pre-tool-use.cjs    │  PreToolUse 门控
    │                      │  spec-pending → 阻止
    │                      │  confirmed → 放行
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │    MCP Server        │  src/
    │  init / setup        │  项目初始化
    │  bootstrap           │  上下文加载
    │  check / plan        │  需求澄清
    │  skills              │  角色技能管理
    │  log / module        │  日志记录
    └─────────────────────┘
```

### 数据流

```
AI 调用 Write/Edit
  → PreToolUse Hook 检查 task-state.json
    → spec-pending + 非例外文件 → exit 2（阻止）
    → spec-pending + 例外文件 → exit 0（放行）
    → confirmed → exit 0（放行）
  → 操作执行
  → PostToolUse Hook 捕获
    → normalize-log.sh 转换格式
    → auto-log.sh 追加 JSONL

SessionEnd
  → session-end.sh
    → process-logs.sh 更新 recent-5 + summary-10
    → git commit
```

---

## Hard Gate 需求门控

这是项目的核心安全机制，位于 AI 和文件系统之间。

### 状态机

```
spec-pending ──(用户签字 y/approve)──→ confirmed
     │                                      │
     ├── Write/Edit 例外文件 → 放行          └── 所有操作 → 放行
     └── Write/Edit 业务文件 → 阻止(exit 2)
```

### 例外文件（始终放行）

- `.github/prompts/focus-spec.md` — 需求规格本身
- `.github/prompts/task-state.json` — 状态机文件

### 验证方法

```bash
# 测试 spec-pending 拦截
echo '{"tool_name":"Write","tool_input":{"file_path":"/src/test.ts"}}' \
  | node .prompts-mcp/pre-tool-use.cjs
# 预期: exit 2, stderr: "BLOCKED: stage=spec-pending..."

# 测试例外放行
echo '{"tool_name":"Write","tool_input":{"file_path":".github/prompts/focus-spec.md"}}' \
  | node .prompts-mcp/pre-tool-use.cjs
# 预期: exit 0
```

---

## Skill 角色系统

### 分层管理

```
~/.claude/agents/              # ECC agents（ECC 模式下优先使用）
~/.pmcp/skills/
  core/     # 核心 skill（随 npm 包分发，只读）
  custom/   # 用户自定义 skill（跨项目复用）

your-project/.github/prompts/skills/
  # 项目级 skill（ECC 未安装时使用）
```

### 角色分配策略

```
ECC 已安装:
  PMCP 角色 → analyst, backend, frontend（从 ~/.claude/agents/ 加载）
  ECC 角色  → architect, review, backend-java, database-handler（从 ~/.claude/agents/ 加载）
  ECC 工具  → tdd-guide, planner, security-reviewer（从 ~/.claude/agents/ 加载）

ECC 未安装:
  PMCP 角色 → 全部 7 个（从 .github/prompts/skills/ 加载）
```

### Skill 生命周期

```
创建 → 同步到项目 → AI 加载执行 → 会话结束更新学习记录 → 导出回全局仓库
                                                              ↓
                                                    /learn 提取模式
                                                    → 追加到 skill 学习记录
```

### 内置 Skills（7 个）

| Skill | 图标 | 职责 | ECC 模式 | 独立模式 |
|-------|------|------|----------|----------|
| analyst | 📋 | 需求分析、场景还原、边界枚举、focus-spec 输出 | ✅ ECC agent | ✅ PMCP skill |
| architect | 🏗️ | 架构一致性、模块边界、API 规范、技术债务控制 | → ECC agent | ✅ PMCP skill |
| backend-java | ☕ | SpringBoot 后端开发 | → ECC agent | ✅ PMCP skill |
| backend | 🔧 | API 设计、数据库、服务端架构 | ✅ ECC agent | ✅ PMCP skill |
| frontend | 🎨 | 企业级前端 UI，商业产品质感 | ✅ ECC agent | ✅ PMCP skill |
| review | 🔍 | 代码审查、命名规范、DTO 污染检测 | → ECC agent | ✅ PMCP skill |
| database-handler | 🗄️ | 数据库数据插入/修改、需求定义、数据清洗、导入备份与验证 | → ECC agent | ✅ PMCP skill |

> **→ ECC agent** 表示该角色由 ECC 的 `~/.claude/agents/<name>.md` 接管，PMCP 版本不加载。

---

## ECC 集成

PMCP 可与 [ECC (Everything Claude Code)](https://github.com/anthropics/ecc) 配合使用。

**核心定位：PMCP 管「做什么」，ECC 管「怎么做」。**

- **PMCP** = 项目上下文生命周期（需求门控、上下文加载、日志、模块记录）
- **ECC** = 开发执行方法论（agents、rules、TDD、审查、安全扫描）

### 自动检测

`pmcp start` 自动检测 ECC（检查 `~/.claude/rules/ecc/` 目录）：
- **已安装** → 角色系统统一到 ECC agents，展示 ECC 工作流引导
- **未安装** → 使用 PMCP 原有 Skills 系统，走传统流程

### 角色系统统一

ECC 存在时，角色由 ECC agents 统一管理，PMCP Skills 保留作为独立模式后备：

```
┌─────────────────────────────────────────────────────────────┐
│                    角色分配                                   │
├─────────────────────────────────────────────────────────────┤
│  PMCP 角色（需求 + 领域专精）         来源                    │
│  ─────────────────────────────────────────────────────────  │
│  analyst         需求分析师          ~/.claude/agents/       │
│  backend         后端开发专家        ~/.claude/agents/       │
│  frontend        前端 UI 工程师      ~/.claude/agents/       │
│                                                             │
│  ECC 角色（架构 + 审查 + TDD）        来源                    │
│  ─────────────────────────────────────────────────────────  │
│  architect       系统架构师          ~/.claude/agents/       │
│  review          代码审查员          ~/.claude/agents/       │
│  backend-java    SpringBoot 后端     ~/.claude/agents/       │
│  database-handler 数据库处理员       ~/.claude/agents/       │
│  tdd-guide       TDD 驱动           ~/.claude/agents/       │
│  planner         实现规划            ~/.claude/agents/       │
│  security-reviewer 安全审查          ~/.claude/agents/       │
└─────────────────────────────────────────────────────────────┘
```

> 未安装 ECC 时，PMCP 的 7 个 Skills 全部可用（原有行为不变）。

### 全流程引导（增强版）

PMCP 做「项目经理」引导全流程，ECC agents 做「执行者」。每一步告诉你：**做什么、输入什么、看到什么、下一步是什么。**

```
spec-pending → confirmed → task-planning → developing → reviewing → user-confirming → completed → archived
     签字         拆任务       选agent开发      审查         用户确认       git+学习        归档
```

---

#### Phase 0：启动

```bash
pmcp start
```

**你会看到：**
- 上下文加载摘要（技术栈、最近活动、待办）
- Hard Gate 状态（focus-spec 是否已签字）
- **当前阶段 + 下一步操作提示**
- 归档历史摘要（最后 1-3 条，轻量不污染上下文）
- 角色列表（PMCP 角色 + ECC 角色）

**你该做什么：**
- 如果有未完成需求（`incomplete`），输入 `继续` 或 `新需求`
- 如果是新需求，输入 `analyst` 开始 Phase 1
- 如果 focus-spec 已签字，按提示进入下一阶段

---

#### Phase 1：需求门控（analyst agent）— stage: spec-pending → confirmed

> **触发条件：** 新需求、新模块、换一个任务
> **核心原则：** 未签字前，禁止一切写操作

```
你输入：analyst
AI 执行：
  1. 场景还原 — 谁、什么、什么时候、为什么
  2. 边界枚举 — IN 范围 / OUT 范围
  3. 黑名单 — 禁止触碰的文件/模块
  4. 断言清单 — 可验证的验收标准
  5. 输出 focus-spec.md
```

**你会看到：** STOP — 契约文档等待人类签字
**你该做什么：** 输入 `y` 或 `approve` 签字

**签字后：**
- `task-state.json` 从 `spec-pending` → `confirmed`
- SHA256 契约锁定，focus-spec 不可篡改

---

#### Phase 2：任务拆分（PMCP 引导）— stage: confirmed → task-planning

> **触发条件：** focus-spec 已签字
> **核心原则：** 拆分子任务 + 定义完成标准，为每个子任务分配 ECC agent

```
PMCP 引导：
  1. 读取 focus-spec.md 的断言清单
  2. 拆分为可独立开发的子任务
  3. 为每个子任务定义完成标准
  4. 为每个子任务建议 ECC agent
  5. 写入 focus-spec.md 第 5 章「任务拆分」
```

**你会看到：**
```
子任务拆分：
  T1: [任务描述] → 建议: backend agent → 完成标准: [标准]
  T2: [任务描述] → 建议: frontend agent → 完成标准: [标准]
  T3: [任务描述] → 建议: architect agent → 完成标准: [标准]
```

**你该做什么：**
- 审查任务拆分是否合理
- 确认后进入开发阶段

---

#### Phase 3：选择 ECC agent 开发 — stage: task-planning → developing

> **触发条件：** 任务拆分完成
> **核心原则：** PMCP 引导用户为每个子任务选择 ECC agent

```
PMCP 引导：
  「子任务 T1：xxx，建议使用 backend agent，确认？」
  用户确认 → 加载 backend agent → 开发
  开发完成 → 自动检查完成标准
  → 循环直到所有子任务完成
```

**可用 ECC agents：**

| Agent | 职责 |
|-------|------|
| analyst | 需求分析、场景还原 |
| architect | 系统架构、模块边界 |
| backend | API 设计、数据库、服务端 |
| frontend | 企业级前端 UI |
| review | 代码审查 |
| tdd-guide | 测试驱动开发 |
| planner | 实现规划 |
| security-reviewer | 安全审查 |

**你该做什么：**
- 确认 agent 选择
- 观察开发过程
- 每个子任务完成后检查完成标准

---

#### Phase 4：审查 — stage: developing → reviewing

> **触发条件：** 所有子任务开发完成
> **核心原则：** 对照完成标准逐项检查，审查阶段禁止写入

```bash
/code-review      # 代码质量审查
/security-scan    # 安全漏洞扫描
```

**AI 执行：**
- code-reviewer agent 检查代码质量
- security-reviewer agent 扫描漏洞
- 对照 focus-spec 第 5 章完成标准逐项检查

**审查结果：**

| 级别 | 含义 | 行动 |
|------|------|------|
| CRITICAL | 安全漏洞或数据丢失风险 | **必须修复** |
| HIGH | Bug 或重大质量问题 | **建议修复** |
| MEDIUM | 可维护性问题 | 考虑修复 |
| LOW | 风格建议 | 可选 |

**你该做什么：**
- 确保无 CRITICAL 问题
- 有 CRITICAL → 回到 Phase 3 修复
- 无 CRITICAL → 进入用户确认

---

#### Phase 5：用户确认 — stage: reviewing → user-confirming

> **触发条件：** 审查通过
> **核心原则：** 用户最终确认，展示完成情况 vs 完成标准

**PMCP 展示：**
```
完成情况：
  ✅ T1: [任务] — 完成标准已满足
  ✅ T2: [任务] — 完成标准已满足
  ⚠️ T3: [任务] — 完成标准部分满足（缺少 xxx）

整体评估：2/3 完成，1 项需补充
```

**你该做什么：**
- 输入 `通过` → 进入收尾
- 描述问题 → 回到 Phase 3 修复

---

#### Phase 6：收尾 — stage: user-confirming → completed → archived

**PMCP 自动执行：**
- git commit 所有变更
- `/learn` 提取可复用模式 → 追加到 PMCP skill 学习记录
- `focus-spec.md` → `focus-spec-history/`（移走，不留在主目录）
- 追加摘要到 `archive-index.md`（一行记录）
- `task-state.json` → `archived`
- 日志处理 → 更新 recent-5.md + summary-10.md

**PMCP 提示：**
```
✅ 需求已归档：ecc-pmcp-integration
📦 归档摘要已追加到 archive-index.md
💡 建议输入 /clear 清理上下文，再开始新需求。
```

---

#### 中途退出恢复 — stage: incomplete

> **场景：** 开发到一半关闭了终端

**下次启动时：**
```
pmcp start
  → 检测到 task-state.stage = incomplete
  → 提示：「检测到未完成需求：xxx，当前阶段：开发中」
  → 询问：「继续上次需求？还是开始新需求？」
```

**你该做什么：**
- 输入 `继续` → 恢复到上次阶段
- 输入 `新需求` → 归档上次（标记为 incomplete）→ 开始新需求

---

### 可选分支流程

| 场景 | 命令 | 说明 |
|------|------|------|
| 构建失败 | `/build-fix` | build-error-resolver agent 修复 |
| 覆盖率不足 | `/test-coverage` | 补充测试用例 |
| 重构需求 | `/refactor-clean` | refactor-cleaner agent 清理 |
| 需求变更 | 说出「需求变更」 | task-state 回退到 change-requested → 重新签字 |
| 提取经验 | `/learn` | 保存模式到 skill 学习记录 |
| 技能健康 | `/skill-health` | 审计冲突、冗余、质量 |
| 会话恢复 | `/save-session` | 保存当前进度 |

### 分工模型

| 职责 | PMCP | ECC |
|------|------|-----|
| 上下文加载 | `pmcp start` / `pmcp bootstrap` | — |
| 需求门控 | `focus-spec.md` + Hard Gate | — |
| 角色系统 | analyst / backend / frontend | architect / review / tdd-guide / ... |
| 对话日志 | recent-5.md + summary-10.md | — |
| 模块记录 | `pmcp module-log` | — |
| 实现规划 | — | `/plan` (planner agent) |
| 测试驱动 | — | `/tdd` (tdd-guide agent) |
| 代码审查 | — | `/code-review` (code-reviewer agent) |
| 安全扫描 | — | `/security-scan` (security-reviewer agent) |
| 构建修复 | — | `/build-fix` (build-error-resolver agent) |
| 持续学习 | skill 学习记录 | `/learn` + `/skill-create` |

### 未安装 ECC

走传统 PMCP 流程（功能完整，无需 ECC）：

```
pmcp start
  → 选角色（7 个 PMCP Skills 全部可用）
  → 需求门控（analyst → focus-spec → 签字）
  → 手动开发
  → git commit
```

PMCP Skills 包含完整的契约锁死流程（Phase 0 → Phase 1 → Phase 2），独立使用时功能不缺失。

---

## 支持的 AI 助手

| 助手 | MCP | Hooks | 自动日志 |
|------|-----|-------|---------|
| Claude Code | Yes | SessionStart / PostToolUse / PreToolUse / SessionEnd | 完整 |
| Cline | Yes | TaskStart / PostToolUse / TaskComplete + 5 others | 完整 |
| Cursor | Yes | 无（Rules only） | 手动（MCP） |
| Windsurf | Yes | 无 | 手动（MCP） |
| Copilot | Yes | 无 | 手动（MCP） |
| Continue | Yes | 无 | 手动（MCP） |

---

## CLI 命令参考

```bash
pmcp start [path] [--assistant <name>]    # 一键启动（推荐）
pmcp setup [path] [--assistant <name>]    # 一键初始化
pmcp bootstrap                             # 加载所有上下文
pmcp check "任务描述"                       # 需求澄清检查（5 项标准）
pmcp plan "任务描述"                        # 生成执行计划
pmcp log --title "t" --request "r"         # 记录对话日志
pmcp module-log <name> --change "c"        # 记录模块变更
pmcp module-read <name>                    # 读取模块历史
pmcp module-list                           # 列出所有模块
pmcp todos add|complete|remove "text"      # 更新待办
pmcp skill init                            # 初始化全局 Skill 仓库
pmcp skill list                            # 列出所有 Skill
pmcp skill create <name>                   # 创建自定义 Skill
pmcp skill sync                            # 同步全局 Skill 到项目
pmcp skill export                          # 导出项目 Skill 到全局
pmcp register                              # 注册为全局已知命令
pmcp unregister                            # 取消注册
```

---

## MCP 工具参考

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `auto_start` | 会话启动，加载全部上下文 + 规则 + Skills | — |
| `init_prompts` | 扫描项目生成 prompts 文件体系 | `projectRoot` |
| `bootstrap` | 一键加载上下文 | — |
| `check_requirements` | 5 项需求澄清检查 | `taskDescription` |
| `make_plan` | 生成执行计划 | `taskDescription` |
| `log_dialog` | 记录对话日志 | `title`, `request` |
| `log_module` | 记录模块变更 | `moduleName`, `change` |
| `read_module` | 读取模块变更历史 | `moduleName` |
| `update_todos` | 更新待办事项 | `action`, `todo` |
| `add_rule` | 添加项目规范规则 | `name`, `content` |
| `list_rules` | 列出所有规则 | — |
| `remove_rule` | 删除规则 | `name` |
| `commit_dialog` | 手动 git commit | `message` |
| `list_skills` | 列出所有 Skill | — |
| `select_skill` | 选择 Skill 角色 | `name` |
| `update_skill` | 追加学习记录、更新规范 | `name`, `learnings` |
| `add_skill` | 创建新 Skill | `name`, `identity`, `guidelines` |

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROJECT_ROOT` | 目标项目根目录 | `process.cwd()` |
| `PROMPTS_SUBDIR` | prompts 子目录 | `.github/prompts` |
| `ASSISTANT` | AI 助手类型 | `claude-code` |
| `AUTO_COMMIT` | log_dialog 后自动提交 | `true` |

---

## 开发

```bash
npm install
npm run build          # 编译 TypeScript
npm test               # 运行测试（vitest）
npm run dev            # 开发模式运行 MCP Server
npm run dev:cli        # 开发模式运行 CLI
```

### 技术栈

- TypeScript (ES2022, ESM)
- @modelcontextprotocol/sdk
- Node.js 运行时
- Vitest（测试框架）
- Bash hooks（零外部依赖）

### 添加新助手

1. 创建 `adapters/<your-assistant>/` 目录
2. 编写 `normalize-log.sh`：读取助手 stdin，输出标准化 JSON
3. 编写 `session-start.sh` 和 `session-end.sh`
4. 创建配置模板（`settings.json` / `rules.md`）
5. 在 `src/cli.ts` 的 `VALID_ASSISTANTS` 中添加名称

---

## 许可证

MIT

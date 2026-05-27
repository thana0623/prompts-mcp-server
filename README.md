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

#### 阶段 3：Skill 选择

启动后展示 7 个内置角色：

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
~/.pmcp/skills/
  core/     # 核心 skill（随 npm 包分发，只读）
  custom/   # 用户自定义 skill（跨项目复用）

your-project/.github/prompts/skills/
  # 项目级 skill（优先级最高）
```

### Skill 生命周期

```
创建 → 同步到项目 → AI 加载执行 → 会话结束更新学习记录 → 导出回全局仓库
```

### 内置 Skills（7 个）

| Skill | 图标 | 职责 | 版本 |
|-------|------|------|------|
| analyst | 📋 | 需求分析、场景还原、边界枚举、focus-spec 输出 | v1 |
| architect | 🏗️ | 架构一致性、模块边界、API 规范、技术债务控制 | v2 |
| backend-java | ☕ | SpringBoot 后端开发 | v1 |
| backend | 🔧 | API 设计、数据库、服务端架构 | v1 |
| frontend | 🎨 | 企业级前端 UI，商业产品质感 | v2 |
| review | 🔍 | 代码审查、命名规范、DTO 污染检测 | v2 |
| database-handler | 🗄️ | 数据库操作、Excel 清洗、导入验证 | v2 |

---

## ECC 集成

PMCP 可与 [ECC (Everything Claude Code)](https://github.com/anthropics/ecc) 配合使用，实现上下文管理 + 行为执行的完整工作流。

### 自动检测

`pmcp start` 会自动检测 ECC 是否已安装（检查 `~/.claude/rules/ecc/` 目录）。如已安装，在角色选择前展示 ECC 能力引导：

```
═══════════════════════════════════════════════════════════
  ECC 已安装
═══════════════════════════════════════════════════════════

  ECC (Everything Claude Code) 提供企业级开发能力：

  可用命令:
    /tdd            测试驱动开发
    /code-review    代码质量审查
    /security-scan  安全扫描
    /plan           实现规划
    /build-fix      构建错误修复

  PMCP + ECC 分工:
    PMCP 管上下文（需求契约、模块记录、对话日志）
    ECC  管行为（质量门禁、TDD、代码审查、安全扫描）

  建议流程: 选角色 → 开发 → /code-review → /security-scan → 提交
```

### 分工模型

| 职责 | PMCP | ECC |
|------|------|-----|
| 需求契约 | `focus-spec.md` + Hard Gate | — |
| 角色技能 | analyst / architect / backend / ... | — |
| 上下文加载 | `pmcp bootstrap` | — |
| 对话日志 | recent-5.md + summary-10.md | — |
| 测试驱动 | — | `/tdd` |
| 代码审查 | — | `/code-review` |
| 安全扫描 | — | `/security-scan` |
| 质量门禁 | — | PreToolUse hooks |
| 持续学习 | — | `/learn` |

### 推荐流程

```
pmcp start → 选角色 → 开发 → /code-review → /security-scan → git commit
```

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

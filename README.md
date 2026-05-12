# prompts-mcp-server

AI 无关的上下文生命周期基础设施：Hook 驱动日志 + MCP 上下文管理 + 角色技能系统。

核心设计：**脚本管状态，AI 管语义**。不依赖 AI 主动调用日志工具。

> **一键启动**: `pmcp start` — 自动初始化 + 加载上下文 + 选择 Skill，一条命令搞定。

## 支持的 AI 助手

| 助手 | MCP | Hooks | 自动日志 |
|------|-----|-------|---------|
| Claude Code | Yes | SessionStart / PostToolUse / SessionEnd | 完整 |
| Cline | Yes | TaskStart / PostToolUse / TaskComplete + 5 others | 完整 |
| Cursor | Yes | 无（Rules only） | 手动（MCP） |
| Windsurf | Yes | 无 | 手动（MCP） |
| Copilot | Yes | 无 | 手动（MCP） |
| Continue | Yes | 无 | 手动（MCP） |

- **有 Hooks 的助手**（Claude Code / Cline）：自动捕获每次工具调用，写入 JSONL，SessionEnd 自动处理
- **无 Hooks 的助手**（Cursor 等）：通过 Rules 指导 AI 在适当时机调用 MCP 工具

## 快速开始

### 1. 安装

```bash
npm install -g prompts-mcp-server
# 或本地安装
npm install && npm run build && npm link
```

### 2. 一键启动（推荐）

```bash
# 当前目录（自动初始化 + 加载上下文 + 选择 Skill）
pmcp start

# 指定项目
pmcp start /path/to/project

# 指定助手
pmcp start --assistant cline
```

`start` 一条命令完成：
1. 检测项目是否已初始化，未初始化则自动 `setup`
2. 确保全局 Skill 仓库存在
3. 加载全部上下文（context / recent-5 / summary-10 / todos / dev-rules）
4. 提示选择 Skill 角色

### 3. 或仅初始化（不启动会话）

```bash
# 当前目录
pmcp setup

# 指定项目
pmcp setup /path/to/project

# 指定助手
pmcp setup --assistant cline
```

`setup` 命令完成：
1. 生成 prompts 文件（context / recent-5 / summary-10 / todos / dev-rules）
2. 复制 Skills 角色模板（architect / backend-java / backend / frontend / review）
3. 复制 hooks + adapter 脚本
4. 配置 MCP server 路径
5. 生成助手配置（如 `.claude/settings.json`）

初始化后生成：

```
your-project/
  .prompts-mcp/
    hooks/                          # 共享核心脚本（助手无关）
      auto-log.sh                   # 标准化 JSON → JSONL
      process-logs.sh               # JSONL → recent-5 + summary-10
      session-end.sh                # 处理日志 + git commit
    adapters/
      <assistant>/                  # 选定助手的适配器
        normalize-log.sh            # 转换助手原生格式 → 标准化 JSON
        session-start.sh / session-end.sh
    mcp-server-path                 # MCP server 入口路径
  .claude/ 或 .cursor/ 等           # 助手配置（由 setup 生成）
  .github/prompts/                  # prompts 文件
    skills/                         # 角色技能定义
      architect.md                  # 架构师
      backend-java.md               # Java 后端
      backend.md                    # 后端开发
      frontend.md                   # 前端开发
      review.md                     # 代码审查
  logs/dialogs/                     # JSONL 日志
```

### 4. 开始编码

有 Hooks 的助手（Claude Code / Cline）无需额外操作，自动日志即刻生效。

无 Hooks 的助手需要配置 MCP Server：

```json
{
  "mcpServers": {
    "prompts-mcp": {
      "command": "node",
      "args": ["/path/to/prompts-mcp-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

## 角色技能系统（Skills）

会话启动时自动展示可用角色，用户选择后 AI 以该角色身份工作。

| 角色 | 图标 | 用途 |
|------|------|------|
| architect | 架构师 | 系统设计、技术选型、模块划分 |
| backend-java | Java 后端 | SpringBoot 后端开发与架构规范 |
| backend | 后端开发 | API 设计、数据库、服务端架构 |
| frontend | 前端开发 | UI 实现、交互设计、组件化 |
| review | 代码审查 | 代码质量、安全性、性能审查 |

### 全局 Skill 仓库

Skills 使用分层管理：全局仓库 (`~/.pmcp/skills/`) + 项目级 (`.github/prompts/skills/`)。

```bash
pmcp skill init          # 初始化全局仓库
pmcp skill create my-skill  # 创建自定义 skill（存入全局仓库）
pmcp skill sync          # 同步全局 skill 到当前项目
pmcp skill export        # 导出项目 skill 到全局仓库
```

全局仓库结构：
```
~/.pmcp/skills/
  core/     # 核心 skill（随 npm 包分发，只读）
  custom/   # 用户自定义 skill（可跨项目复用）
```

### 自定义 Skills

```bash
# 通过 CLI 创建（存入全局仓库）
pmcp skill create my-skill

# 通过 MCP 工具创建
# add_skill: name, icon, description, identity, guidelines

# 或直接在 .github/prompts/skills/ 下创建 .md 文件
```

### 自我优化

会话结束时 AI 自动调用 `update_skill` 追加学习记录，持续进化角色能力。

## 架构

```
┌─────────────────────────────────────────────────┐
│                  AI 助手                          │
│  Claude Code / Cline / Cursor / Windsurf / ...   │
└──────────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────┐
    │    适配器层           │  adapters/<assistant>/
    │  normalize-log.sh    │  转换原生格式 → 标准化 JSON
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
    │    MCP Server        │  src/
    │  init / setup        │  项目初始化
    │  bootstrap           │  上下文加载
    │  check / plan        │  需求澄清
    │  skills              │  角色技能管理
    │  log / module        │  日志记录
    └─────────────────────┘
```

## MCP 工具

| 工具 | 说明 |
|------|------|
| `init_prompts` | 扫描项目并生成 prompts 文件体系 |
| `bootstrap` | 加载所有上下文 + Skills |
| `auto_start` | 会话自动启动（加载全部上下文 + 规则 + Skills） |
| `check_requirements` | 5 项需求澄清检查 |
| `make_plan` | 生成可执行计划 |
| `log_dialog` | 记录对话日志（有 Hooks 时自动完成） |
| `log_module` | 记录模块级变更 |
| `read_module` | 读取模块变更历史 |
| `update_todos` | 更新待办事项 |
| `add_rule` / `list_rules` / `remove_rule` | 管理项目规范规则 |
| `list_skills` | 列出所有可用角色技能 |
| `select_skill` | 选择角色并加载完整 prompt |
| `update_skill` | 自我优化：追加学习记录、更新规范 |
| `add_skill` | 创建新的角色技能 |
| `commit_dialog` | 手动触发 git commit |

## CLI 命令

```bash
pmcp start [--project-root <path>] [--assistant <name>]    # 一键启动（推荐）
pmcp setup [--project-root <path>] [--assistant <name>]    # 一键初始化
pmcp init [--project-root <path>] [--assistant <name>]     # 初始化（不含 MCP 配置）
pmcp bootstrap                                              # 加载所有上下文
pmcp check "任务描述"                                        # 需求澄清检查
pmcp plan "任务描述"                                         # 生成执行计划
pmcp log --title "xxx" --request "xxx" [--changes ...]      # 记录对话日志
pmcp module-log <module> --change "xxx" [--files ...]       # 记录模块变更
pmcp module-read <module>                                   # 读取模块历史
pmcp module-list                                            # 列出所有模块
pmcp todos add|complete|remove "text"                       # 更新待办事项
pmcp skill init                                             # 初始化全局 skill 仓库
pmcp skill list                                             # 列出所有可用 skill
pmcp skill create <name>                                    # 创建自定义 skill
pmcp skill sync                                             # 同步全局 skill 到项目
pmcp skill export                                           # 导出项目 skill 到全局仓库
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROJECT_ROOT` | 目标项目根目录 | `process.cwd()` |
| `PROMPTS_SUBDIR` | prompts 子目录 | `.github/prompts` |
| `ASSISTANT` | AI 助手类型 | `claude-code` |
| `AUTO_COMMIT` | log_dialog 后自动提交 | `true` |

## 添加新助手

1. 创建 `adapters/<your-assistant>/` 目录
2. 编写 `normalize-log.sh`：读取助手 stdin，输出标准化 JSON
3. 编写 `session-start.sh` 和 `session-end.sh`
4. 创建配置模板（settings.json / rules.md）
5. 在 `src/cli.ts` 的 `VALID_ASSISTANTS` 中添加名称
6. 在 setup/init 命令的 switch 中添加配置生成逻辑

## 项目结构

```
src/
  index.ts                # MCP Server 入口（工具注册 + 路由）
  cli.ts                  # CLI 入口（复用核心模块）
  config.ts               # 集中配置管理
  frontmatter.ts          # 共享 YAML frontmatter 解析器
  dialog-logger.ts        # 对话日志模块（daily / recent-5 / summary-10 / log-state / todos）
  prompts-loader.ts       # 上下文加载（bootstrap）
  prompts-generator.ts    # 项目扫描 + prompts 文件生成
  requirements-check.ts   # 需求澄清检查 + 计划生成
  skills-manager.ts       # 角色技能 CRUD + 分层加载
  rules-manager.ts        # 项目规范规则管理
  module-logger.ts        # 模块级变更记录
  git-utils.ts            # Git 操作（execFileSync，防注入）
  __tests__/              # 测试文件
    frontmatter.test.ts
    requirements-check.test.ts
```

## 开发

```bash
npm install
npm run build        # 编译 TypeScript
npm test             # 运行测试（vitest）
npm run dev          # 开发模式运行 MCP Server
npm run dev:cli      # 开发模式运行 CLI
```

## 技术栈

- TypeScript (ES2022, ESM)
- @modelcontextprotocol/sdk
- Node.js 运行时
- Vitest（测试框架）
- Bash hooks（无外部依赖）

## 许可证

MIT

# pmcp-server

[![npm version](https://img.shields.io/npm/v/pmcp-server.svg)](https://www.npmjs.com/package/pmcp-server)
[![license](https://img.shields.io/npm/l/pmcp-server.svg)](https://github.com/thana0623/prompts-mcp-server/blob/master/LICENSE)

AI 无关的上下文生命周期基础设施：Hook 驱动日志 + MCP 上下文管理 + 角色技能系统。

核心设计：**脚本管状态，AI 管语义**。不依赖 AI 主动调用日志工具。

## 快速开始

### 1. 安装（一次性）

```bash
npm install -g pmcp-server
```

### 2. 在项目中初始化（一次性）

```bash
cd /your/project
pmcp start
```

自动完成：
- 生成 `.github/prompts/` 上下文文件（context / recent-5 / summary-10 / todos / dev-rules）
- 复制 hooks + adapter 到 `.prompts-mcp/`
- 生成助手配置（如 `.claude/settings.json`）
- 初始化全局 Skill 仓库 `~/.pmcp/skills/`
- 加载上下文 → 提示选择角色（Skill）

### 3. 选择角色开始开发

选择一个 Skill 角色，AI 以该身份工作：

| 角色 | 图标 | 用途 |
|------|------|------|
| architect | 架构师 | 系统设计、技术选型、模块划分 |
| backend-java | Java 后端 | SpringBoot 后端开发与架构规范 |
| backend | 后端开发 | API 设计、数据库、服务端架构 |
| frontend | 前端开发 | UI 实现、交互设计、组件化 |
| review | 代码审查 | 代码质量、安全性、性能审查 |

### 4. 日常使用（每次打开项目）

```bash
pmcp start
```

或直接用 Claude Code 打开项目，SessionStart hook 自动加载上下文，无需手动操作。

### 5. 对话中（全自动）

- AI 自动读取上下文、遵循开发规范
- Hook 自动记录每次工具调用到 JSONL
- 会话结束时自动处理日志 + git commit

### 6. 查看/管理

```bash
pmcp skill list              # 查看可用角色
pmcp skill create my-skill   # 创建自定义角色
pmcp bootstrap               # 手动重新加载上下文
pmcp check "需求描述"         # 需求澄清检查
pmcp plan "需求描述"          # 生成执行计划
```

**简单说：装一次，每个项目 `pmcp start` 一次，之后正常写代码就行。日志、上下文、角色切换都是自动的。**

---

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

## 初始化后生成的文件

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
  logs/dialogs/                     # JSONL 日志
```

## MCP Server 配置（无 Hooks 的助手）

Cursor / Windsurf / Copilot / Continue 需要手动配置 MCP Server：

```json
{
  "mcpServers": {
    "pmcp-server": {
      "command": "node",
      "args": ["/path/to/pmcp-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

## Skill 角色系统

Skills 使用分层管理：全局仓库 (`~/.pmcp/skills/`) + 项目级 (`.github/prompts/skills/`)。

```bash
pmcp skill init              # 初始化全局仓库
pmcp skill create my-skill   # 创建自定义 skill（存入全局仓库）
pmcp skill sync              # 同步全局 skill 到当前项目
pmcp skill export            # 导出项目 skill 到全局仓库
```

全局仓库结构：
```
~/.pmcp/skills/
  core/     # 核心 skill（随 npm 包分发，只读）
  custom/   # 用户自定义 skill（可跨项目复用）
```

会话结束时 AI 自动调用 `update_skill` 追加学习记录，持续进化角色能力。

## CLI 命令

```bash
pmcp start [--project-root <path>] [--assistant <name>]    # 一键启动（推荐）
pmcp setup [--project-root <path>] [--assistant <name>]    # 一键初始化
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

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROJECT_ROOT` | 目标项目根目录 | `process.cwd()` |
| `PROMPTS_SUBDIR` | prompts 子目录 | `.github/prompts` |
| `ASSISTANT` | AI 助手类型 | `claude-code` |
| `AUTO_COMMIT` | log_dialog 后自动提交 | `true` |

## 开发

```bash
npm install
npm run build        # 编译 TypeScript
npm test             # 运行测试（vitest）
npm run dev          # 开发模式运行 MCP Server
npm run dev:cli      # 开发模式运行 CLI
```

## 添加新助手

1. 创建 `adapters/<your-assistant>/` 目录
2. 编写 `normalize-log.sh`：读取助手 stdin，输出标准化 JSON
3. 编写 `session-start.sh` 和 `session-end.sh`
4. 创建配置模板（settings.json / rules.md）
5. 在 `src/cli.ts` 的 `VALID_ASSISTANTS` 中添加名称
6. 在 setup/init 命令的 switch 中添加配置生成逻辑

## 技术栈

- TypeScript (ES2022, ESM)
- @modelcontextprotocol/sdk
- Node.js 运行时
- Vitest（测试框架）
- Bash hooks（无外部依赖）

## 许可证

MIT

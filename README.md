# prompts-mcp-server

AI 无关的上下文生命周期基础设施：Hook 驱动日志 + MCP 上下文管理 + 角色技能系统。

核心设计：**脚本管状态，AI 管语义**。不依赖 AI 主动调用日志工具。

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

### 2. 一键 Setup（推荐）

```bash
# 当前目录
pmcp setup

# 指定项目
pmcp setup /path/to/project

# 指定助手
pmcp setup --assistant cline
```

`setup` 一条命令完成：
1. 生成 prompts 文件（context / recent-5 / summary-10 / todos / dev-rules）
2. 复制 Skills 角色模板（architect / backend / frontend / review）
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
      backend.md                    # 后端开发
      frontend.md                   # 前端开发
      review.md                     # 代码审查
  logs/dialogs/                     # JSONL 日志
```

### 3. 开始编码

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
| backend | 后端开发 | API 设计、数据库、服务端架构 |
| frontend | 前端开发 | UI 实现、交互设计、组件化 |
| review | 代码审查 | 代码质量、安全性、性能审查 |

### 自定义 Skills

```bash
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

## CLI 命令

```bash
pmcp setup [--project-root <path>] [--assistant <name>]   # 一键初始化（推荐）
pmcp init [--project-root <path>] [--assistant <name>]     # 初始化（不含 MCP 配置）
pmcp bootstrap                                             # 加载所有上下文
pmcp check "任务描述"                                       # 需求澄清检查
pmcp plan "任务描述"                                        # 生成执行计划
pmcp log --title "xxx" --request "xxx" [--changes ...]     # 记录对话日志
pmcp module-log <module> --change "xxx" [--files ...]      # 记录模块变更
pmcp module-read <module>                                  # 读取模块历史
pmcp module-list                                           # 列出所有模块
pmcp todos add|complete|remove "text"                      # 更新待办事项
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

## 技术栈

- TypeScript (ES2022, ESM)
- @modelcontextprotocol/sdk
- Node.js 运行时
- Bash hooks（无外部依赖）

## 许可证

MIT

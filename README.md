# prompts-mcp-server

AI 无关的上下文生命周期基础设施：Hook 驱动日志 + MCP 上下文管理。

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
npm install
npm run build
```

### 2. 初始化

```bash
# Claude Code
npx prompts-mcp init --assistant claude-code --project-root /path/to/project

# Cline
npx prompts-mcp init --assistant cline

# Cursor
npx prompts-mcp init --assistant cursor

# Windsurf / Copilot / Continue
npx prompts-mcp init --assistant windsurf
npx prompts-mcp init --assistant copilot
npx prompts-mcp init --assistant continue
```

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
        settings.json               # 助手配置模板
  .claude/ 或 .cursor/ 等           # 助手配置（由 init 生成）
  .github/prompts/                  # prompts 文件
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
    │  init / bootstrap    │  上下文管理
    │  check / plan        │  需求澄清
    │  log / module        │  日志记录
    └─────────────────────┘
```

### 标准化 JSON 格式

所有适配器输出统一格式：

```json
{
  "tool": "Edit",
  "target": "src/file.ts",
  "summary": "Modified src/file.ts",
  "session": "abc123",
  "time": "2026-05-08T10:30:00Z",
  "assistant": "claude-code"
}
```

### Hook 工作流（有 Hooks 的助手）

1. **SessionStart** — 加载上下文（context.md / recent-5 / summary-10 / todos）
2. **PostToolUse** — 适配器标准化 → 共享 auto-log.sh → JSONL
3. **SessionEnd** — process-logs.sh → recent-5.md + summary-10.md → git commit

### Rules 工作流（无 Hooks 的助手）

1. AI 读取 Rules 文件，了解 MCP 工具使用时机
2. 会话开始时调用 `auto_start` 加载上下文
3. 编码前调用 `check_requirements` + `make_plan`
4. 完成后调用 `log_dialog` 记录日志

## MCP 工具

| 工具 | 说明 |
|------|------|
| `init_prompts` | 扫描项目并生成 prompts 文件体系 |
| `bootstrap` | 加载所有上下文 |
| `auto_start` | 会话自动启动（加载全部上下文 + 规则） |
| `check_requirements` | 5 项需求澄清检查 |
| `make_plan` | 生成可执行计划 |
| `log_dialog` | 记录对话日志（有 Hooks 时自动完成） |
| `log_module` | 记录模块级变更 |
| `read_module` | 读取模块变更历史 |
| `update_todos` | 更新待办事项 |
| `add_rule` / `list_rules` / `remove_rule` | 管理项目规范规则 |

## CLI 命令

```bash
prompts-mcp init [--project-root <path>] [--assistant <name>]
prompts-mcp bootstrap
prompts-mcp check "任务描述"
prompts-mcp plan "任务描述"
prompts-mcp log --title "xxx" --request "xxx" [--changes ...]
prompts-mcp module-log <module> --change "xxx" [--files ...]
prompts-mcp module-read <module>
prompts-mcp todos add|complete|remove "text"
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
6. 在 init 命令的 switch 中添加配置生成逻辑

## 从 v1（仅 Claude Code）迁移

现有 `.claude/hooks/` 和 `.claude/settings.json` 继续工作，无需更改。

可选迁移到新架构：

```bash
npx prompts-mcp init --assistant claude-code
```

这会生成 `.prompts-mcp/` 目录和新的 `.claude/settings.json`。验证新配置正常后，可删除旧的 `.claude/hooks/`。

## 技术栈

- TypeScript (ES2022, ESM)
- @modelcontextprotocol/sdk
- Node.js 运行时
- Bash hooks（无外部依赖）

## 许可证

MIT

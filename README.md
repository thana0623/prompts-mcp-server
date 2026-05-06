# prompts-mcp-server

一个通用的 MCP (Model Context Protocol) Server，可自动为任意软件项目生成和管理 prompts 系统，使 AI 编程助手能够在开发会话间保持持久化上下文。

## 功能特性

- **智能项目扫描** — 自动识别目标项目的技术栈、框架、数据库和构建工具
- **上下文持久化** — 维护项目上下文、对话记录、模块变更历史的完整链路
- **需求澄清检查** — 基于 5 项标准的需求确认机制，避免盲目开发
- **计划生成** — 需求确认后生成可执行计划，等待用户确认后再实施
- **滚动窗口系统** — 维护最近 5 条对话记录和 10 条状态摘要，自动轮转
- **模块级追踪** — 按功能模块记录变更历史，便于追溯
- **双接口模式** — 支持 MCP Server（stdio 协议）和 CLI 两种使用方式
- **非破坏性初始化** — 生成 prompts 文件时不会覆盖已有文件

## MCP 工具

| 工具 | 说明 |
|------|------|
| `init_prompts` | 扫描目标项目并自动生成 prompts 文件体系 |
| `bootstrap` | 一键加载所有上下文文件，AI 代理启动时第一步调用 |
| `check_requirements` | 5 项标准需求澄清检查（目标、输入输出、约束、验收标准、影响范围） |
| `make_plan` | 需求澄清通过后生成可执行计划 |
| `log_dialog` | 记录对话条目到传输链路（滚动窗口 + 状态摘要） |
| `log_module` | 记录模块级变更（目录式管理） |
| `read_module` | 读取模块变更历史 |
| `update_todos` | 更新 TODO 列表（添加/完成/移除） |

## 安装

```bash
npm install
npm run build
```

## 使用

### 作为 MCP Server 集成

在 AI 助手（如 Cline、Claude Desktop 等）的配置中添加：

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

### 作为 CLI 使用

```bash
# 初始化 prompts 系统
npm run cli init [--project-root /path]

# 加载所有上下文
npm run cli bootstrap

# 需求检查
npm run cli check "任务描述"

# 生成计划
npm run cli plan "任务描述"

# 记录对话
npm run cli log --title "xxx" --request "xxx" [--changes ...]

# 模块日志
npm run cli module-log <module> --change "xxx"
npm run cli module-read <module>
npm run cli module-list

# TODO 管理
npm run cli todos add|complete|remove "todo text"
```

### 开发模式

```bash
npm run dev        # 运行 MCP Server
npm run dev:cli    # 运行 CLI
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROJECT_ROOT` | 目标项目根目录 | `process.cwd()` |

## 生成的文件结构

初始化后会在目标项目的 `.github/prompts/` 目录下生成：

```
.github/prompts/
├── context.md           # 项目上下文：技术栈、规则、TODO、日志索引
├── workflow-log.md      # 工作流规则和 AI 对话规范
├── recent-5.md          # 最近 5 条对话记录（滚动窗口）
├── summary-10.md        # 每 10 条的状态摘要
├── log-state.json       # JSON 状态追踪
├── todos.md             # TODO 列表
├── dev-rules.md         # 自动生成的开发规则
├── daily/               # 每日完整日志
│   └── YYYY-MM-DD.md
└── modules/             # 各模块变更历史
    └── <module-name>.md
```

## 技术栈

- **TypeScript** (ES2022, ESM)
- **@modelcontextprotocol/sdk** — 官方 MCP SDK
- **Node.js** 运行时

## 许可证

MIT

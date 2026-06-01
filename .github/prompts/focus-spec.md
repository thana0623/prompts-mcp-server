> task-id: fix-dialog-logging-system
> created: 2026-06-01
> status: confirmed

## 1. 场景还原

PMCP 的对话日志系统有三条管线，但只有两条在跑，且产出内容没有参考价值：

**现状诊断：**

| 管线 | 文件 | 注册状态 | 产出质量 |
|------|------|----------|----------|
| A: tool级日志 | `normalize-log.sh` → `auto-log.sh` → `process-logs.sh` | ❌ 未注册到 `.claude/settings.json` | 差 — 暴力记录每个 tool call 的命令/文件路径 |
| B: 对话级总结 | `capture-prompt.sh` → `generate-dialog-summary.sh` | ✅ 已注册 | 差 — 只取第一条消息前200字符，英文关键词匹配 |
| C: MCP工具 | `dialog-logger.ts` 的 `log_dialog` | MCP工具 | 中 — 有结构但从未被自动调用 |

**三个文件的当前内容：**
- `daily/` — 基本为空（只有1个文件，272字节），shell hooks 完全不写
- `recent-5.md` — 最近5条全是 `pmcp start` 启动噪声，`## Dialog-` 格式，英文
- `summary-10.md` — 20个窗口的 "Files modified: xxx, Commands: xxx"，无语义信息
- `log-state.json` — 两套 schema 共存（shell 写扁平结构，TS 写带 windowEntries）

**原始规范（`workflow-log.md`）定义的目标：**
- `daily/` — 保存当日全量原始记录（可读、可追溯）
- `recent-5.md` — 保存最近5条清洗后的结构化记录
- `summary-10.md` — 保存10条窗口的有状态摘要
- 处理流程：清洗 → 提取 → 入库 → 压缩

**核心问题**：规范写得好，但实现时走了样 — tool级暴力记录替代了对话级总结。

## 2. 核心业务边界

**IN（肯定在范围内）：**

IN: .claude/settings.json
IN: .prompts-mcp/hooks/**
IN: .prompts-mcp/adapters/claude-code/**
IN: hooks/**
IN: adapters/claude-code/**
IN: src/dialog-logger.ts
IN: src/prompts-loader.ts
IN: src/prompts-generator.ts
IN: src/index.ts
IN: src/cli.ts
IN: .github/prompts/recent-5.md
IN: .github/prompts/summary-10.md
IN: .github/prompts/log-state.json
IN: .github/prompts/daily/**

1. **重新接入管线A** — 将 `normalize-log.sh` 注册为 PostToolUse hook，让 tool 级日志恢复采集
2. **重写管线B的总结质量** — `generate-dialog-summary.sh` 改为中文对话级总结，内容包括：用户问题、本轮改动、结果
3. **统一三套格式** — `## Event-`(tool级)、`## Dialog-`(对话级)、`## Entry-`(TS级) 统一为一种格式
4. **让 daily/ 自动工作** — session-end 同时写入 `daily/`、`recent-5`、`summary-10`
5. **统一 log-state.json schema** — 删除 TS 端重复的 `LogState`/`WindowEntry` 接口
6. **保留根目录文件** — 根目录 `hooks/` 和 `adapters/` 是 npm 包源文件，必须保留
7. **修改配置文件** — `.claude/settings.json`、`.prompts-mcp/adapters/claude-code/settings.json`、`src/cli.ts`

**OUT（肯定不在范围内）：**

- 不改门控系统（focus-spec、task-state、pre-tool-use）
- 不改 skill 系统
- 不改 MCP server 的 17 个工具定义（只改日志相关的实现）
- 不改 `adapters/` 下的 cline、cursor、windsurf、copilot、continue
- 不改 bootstrap 加载逻辑

## 3. 禁止触碰黑名单

- `.claude/settings.json` 的 SessionStart、PreToolUse、SessionEnd hook 注册 — 只允许新增 PostToolUse 的 `normalize-log.sh` 注册
- `.prompts-mcp/adapters/claude-code/settings.json` 模板 — 同步更新
- `pre-tool-use.cjs` / `pre-tool-use.sh` — 门控系统不动
- `.github/prompts/skills/` — skill 文件不动
- `task-state.json` 的 stage 字段和 history 数组结构 — 不动

## 4. 核心测试断言清单

1. **管线A重接后**：每次 Write/Edit/Bash tool call 后，`logs/dialogs/YYYY-MM-DD.jsonl` 有新行追加
2. **管线B重写后**：session-end 时 `recent-5.md` 出现中文 `## 对话-NNN` 格式，包含"用户问题"、"本轮改动"、"结果"三字段
3. **daily/自动写入**：session-end 时 `daily/YYYY-MM-DD.md` 自动创建并追加同样的对话总结
4. **summary-10.md**：每10次对话压缩一次，中文格式，包含有意义的主题总结（不是文件列表）
5. **格式统一**：`recent-5.md`、`summary-10.md`、`daily/` 三个文件使用同一套 `## 对话-NNN` 格式
6. **log-state.json**：只有一个 schema（无 windowEntries 字段）
7. **配置文件同步**：`.claude/settings.json` 和 `.prompts-mcp/adapters/claude-code/settings.json` 都注册了 `normalize-log.sh`
8. **构建通过**：`npm run build` 无错误
9. **测试通过**：`npm test` 无失败
10. **bootstrap 正常**：`pmcp start` 输出中 daily 日志被加载，workflow-log 不再出现

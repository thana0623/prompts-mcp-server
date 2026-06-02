# 项目上下文总览（Context）

> 用途：统一沉淀项目当前技术栈、历史决策、待办事项，以及每日记录索引。
> 自动生成时间: 2026-06-01

## 1. 当前技术栈

### 检测到的语言
- TypeScript
- JavaScript

### 检测到的框架
- (未检测到)

### 构建工具
- npm/yarn/pnpm

### 数据库/中间件
- H2

### 包管理器
- npm

### 项目结构
```
prompts-mcp-server/
├── adapters/
├── build/
├── docs/
├── hooks/
├── logs/
├── rules/
├── src/
```


## 2. 开发规范

> 以下为通用规范，可根据项目实际情况补充修改。

### 通用原则
1. 所有代码变更必须同步更新对应文档。
2. 每次对话完成后必须执行日志记录。
3. 需求不明确时禁止猜测，必须先澄清。

### 前端规范

- 框架: Unknown
- 组件化开发，保持风格一致
- API 调用统一封装
- 状态管理集中管理


### 后端规范
- (未检测到后端代码)

### 环境配置
- 公共配置可提交
- 本地配置不提交（使用 .example 模板）
- 敏感信息通过环境变量注入

## 3. 待办事项

- [ ] 补充项目具体开发规范
- [ ] 配置 CI/CD 流程
- [ ] 补充测试用例

## 4. 对话日志索引

- 最近 5 条动态窗口: .github/prompts/recent-5.md
- 近 10 条 Stateful 摘要: .github/prompts/summary-10.md
- 工作流规范: .github/prompts/workflow-log.md
- 模块记录: .github/prompts/modules/
- 待办事项: .github/prompts/todos.md

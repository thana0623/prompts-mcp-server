# 项目自定义规则

> 此目录存放用户自定义的项目规范规则。
> 每条规则为独立 .md 文件，会在 bootstrap 时自动加载。

## 使用方式

### 通过 MCP 工具添加
使用 `add_rule` 工具添加规则：
- `name`: 规则名称（即文件名，不含 .md）
- `content`: 规则内容
- `category`: 分类（可选，如 frontend / backend / general）

### 手动创建
在此目录下创建 .md 文件，格式如下：

```markdown
---
name: my-rule
category: general
created: 2026-05-07
---

规则内容...
```

## 规则示例

- `commit-style.md` — 提交信息格式规范
- `naming-convention.md` — 命名规范
- `api-design.md` — API 设计规范
- `testing.md` — 测试规范

# 项目开发规范

> 自动生成于 2026-05-07
> 项目: .
> 可根据实际情况补充修改。

## 通用规范（强制约束层）

### 0. Hard Gate（强阻断）<span style="color:red">【最高优先级】</span>

每次 session 开始或收到新需求时，必须先检查 `.github/prompts/focus-spec.md`：

- **不存在** → 进入需求预检对话 → 生成 `focus-spec.md` → 等待人类终端输入 `y` 或 `approve`
- **存在但未签字** → 等待人类终端输入 `y` 或 `approve`
- **存在且已签字** → 继续

**签字确认前，智能体禁止执行一切写操作（Write / Edit / Bash 写类命令）。仅允许只读操作（Read / Glob / Grep）。**

签字确认后，`focus-spec.md` 中锁定的断言/契约在后续编码中禁止篡改。

### 1. 一案一结（Lifecycle）

`focus-spec.md` 有完整的 8 阶段生命周期（ECC 工作流）：

```
spec-pending → confirmed → task-planning → developing → reviewing → user-confirming → completed → archived
     签字         拆任务       选agent开发      审查         用户确认       git+学习        归档
```

特殊状态：
- `change-requested` — 开发中需求变更
- `incomplete` — 中途退出未完成

#### 阶段定义

| 阶段 | focus-spec | 其他文件 | 含义 |
|------|-----------|---------|------|
| spec-pending | 可写 | 拦截 | 需求预检中，AI 正在写 focus-spec |
| confirmed | 锁定 | IN 范围内可写 | 已签字，等待任务拆分 |
| task-planning | 可写（第 5 章） | IN 范围内可写 | 任务拆分中，写入子任务和完成标准 |
| developing | 锁定 | IN 范围内可写 | ECC agent 开发中 |
| reviewing | 锁定 | 拦截 | 审查阶段，只读 |
| user-confirming | 锁定 | 拦截 | 等待用户最终确认 |
| completed | 锁定 | 拦截 | 开发完成，TODO 待完成 |
| change-requested | 可写 | 可写 | 需求变更中，用户已授权修改 |
| archived | 不检查 | 放行 | 全部完成，引导新需求 |
| incomplete | 锁定 | IN 范围内可写 | 中途退出，可恢复 |

#### 阶段转换条件

- **spec-pending → confirmed**：用户签字（输入 `y` 或 `approve`）
- **confirmed → task-planning**：focus-spec 已签字，开始拆分子任务
- **task-planning → developing**：任务拆分完成，用户确认后选择 ECC agent 开发
- **developing → reviewing**：所有子任务开发完成
- **reviewing → user-confirming**：审查通过（无 CRITICAL 问题）
- **user-confirming → completed**：用户确认通过
- **completed → archived**：git commit + /learn + 归档操作完成
- **confirmed → change-requested**：开发中遇新问题，用户说「需求变更」「改需求」
- **change-requested → confirmed**：需求更新后重新签字
- **developing → incomplete**：会话中途退出（crash/quit）

#### 追加内容规则（关键）

**超出原始契约范围的追加，必须走 change-requested 流程。**

- confirmed 阶段发现需要追加功能 → 停止开发 → 用户说「需求变更」→ 切换到 change-requested
- 在 change-requested 阶段更新 focus-spec.md（新增 IN 范围、新增断言）
- 更新完成后用户重新签字 → 回到 confirmed
- **禁止在 confirmed 阶段直接追加契约外内容而不更新 focus-spec**

#### 归档规则

归档前检查清单：
- [ ] 所有代码变更已 git commit
- [ ] 测试通过
- [ ] review 完成
- [ ] focus-spec.md 中的 TODO 全部完成

归档操作：
1. 将 `focus-spec.md` 移动到 `focus-spec-history/<task-id>-<date>.md`
2. 重置 `task-state.json`：stage 改为 `spec-pending`，清空 taskId 和 contractHash
3. 清空或删除 `focus-spec.md`

归档后引导：
- 智能体提示：「已归档，可以开始新需求。」
- 用户提新需求时，自动进入 Hard Gate 预检流程

#### 需求切换检测

检测到以下关键词时，智能体必须检查当前 stage：
- 「新需求」「新模块」「换一个任务」「下一个」「下一个需求」

处理逻辑：
- stage=completed → 提示「请先完成 TODO 并归档」
- stage=confirmed → 提示「当前需求进行中，是否需求变更？」
- stage=archived → 直接进入新需求流程
- stage=spec-pending → 继续当前预检

### 2. Assert Contract（断言契约）

`focus-spec.md` 必须包含第 4 章「核心测试断言清单」。断言以目标语言测试框架伪代码写出（如 `assertNotNull(page.getRecords())`、`assertTrue(hasRole("SECRETARY"))`）。

此清单是**人类与智能体之间的业务契约**：
- 人类签字确认后，断言即锁定
- 后续编码中禁止修改断言语义
- 编译失败只允许补充 mock/fixture/setup，不允许改断言
- 断言本身有逻辑矛盾 → 停止，回退到需求预检重新澄清

### 3. Fast-Track 极速模式

简单任务**禁止跳过预检**，但可走 Fast-Track 轻量模式。触发条件：

- 改 typo / 拼写错误
- 重命名变量/函数
- 修改注释
- 代码格式化
- 单行 bug 修复（无业务逻辑变更）

Fast-Track 下：
- 场景/边界/黑名单章节正常填写
- 第 4 章断言清单简化为一行：`assertCompilePass()`
- 无需创建测试空壳（Phase 1 跳过）

---

### 4. Git 提交纪律

**核心原则：一个提交 = 一个逻辑单元。**

提交粒度标准：
- ✅ 修了一个 bug → 立即提交
- ✅ 完成一个可独立运行的功能点 → 提交
- ✅ 重构完成（可编译通过） → 提交
- ❌ 重构做到一半 → 不提交，做完再提
- ❌ 多个不相关的改动混在一起 → 拆分为多次提交

禁止行为：
- `git add .` 混合提交不相关的改动
- 攒一天改动一次提交（git bisect 无法定位问题）
- 每改一行就提交（历史噪音过大）

提交信息规范：
- `feat:` 新功能
- `fix:` 修复 bug
- `refactor:` 重构（不改变行为）
- `chore:` 构建/配置/版本号变更
- `docs:` 文档变更

推送频率：
- 本地可多次提交
- 功能验证通过后统一推送
- 推送前确认无敏感信息泄露（pre-commit hook 自动检查）

---

### 5. 开发工作流（ECC 工作流角色协作）

标准开发周期按以下 Phase 顺序执行，详见 `ecc-workflow.md`：

| Phase | stage | 角色 | 产出 |
|-------|-------|------|------|
| Phase 1 | spec-pending → confirmed | analyst | `focus-spec.md`（需求契约，人类签字确认） |
| Phase 2 | confirmed → task-planning | PMCP 引导 | focus-spec 第 5 章任务拆分 |
| Phase 3 | task-planning → developing | ECC agent | 实现代码 |
| Phase 4 | developing → reviewing | code-reviewer + security-reviewer | 审查报告 |
| Phase 5 | reviewing → user-confirming | PMCP 引导 | 完成情况 vs 完成标准 |
| Phase 6 | user-confirming → archived | PMCP 引导 | git commit + /learn + 归档 |

**PR 流程（单人开发模式）：**

1. 开发完成后，commit message 标记 `PR: ready for review`
2. 切换到 **review** 角色，读取 diff 并输出审核报告
3. review 通过 → commit message 标记 `review: approved` → 开发角色执行合并
4. review 不通过 → 输出问题清单 → 开发角色修复后重新提交

> review 不直接改代码。review 的产出是审核报告，代码修复由开发角色完成。

---

### 基础规范

1. **需求澄清优先**：需求不明确时禁止猜测，必须先追问澄清。
2. **先计划后执行**：需求明确后，先生成可行计划，等待用户确认后再编码。
3. **文档同步**：所有代码变更必须同步更新对应文档和模块记录。
4. **日志记录**：每次对话完成后必须记录日志（daily + recent-5 + summary-10）。
5. **模块记录**：修改模块时，先读取模块记录，修改后更新模块记录。


## 前端规范

- 框架: Unknown
- 语言: TypeScript, JavaScript
- 包管理器: Unknown
- 组件化开发，保持 UI 风格一致
- API 调用统一封装（如 Axios）
- 状态管理集中管理（如 Pinia / Redux）
- 路由统一管理（如 Vue Router / React Router）


## 环境配置

- 公共配置可提交到版本控制
- 本地配置使用 `.local` 后缀，不提交
- 提供 `.example` 模板文件
- 敏感信息通过环境变量注入

## 代码质量

- 遵循语言/框架的最佳实践
- 关键逻辑编写单元测试
- 保持代码整洁，及时清理废弃代码
- 提交前检查是否有调试代码遗留

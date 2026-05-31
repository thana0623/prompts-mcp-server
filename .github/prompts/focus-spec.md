> task-id: fix-pmcp-start-skill-system
> created: 2026-05-31T00:00:00+08:00
> status: archived

## 1. 场景还原

用户在新项目执行 `pmcp start`，CLI 输出的角色菜单包含 9 个选项（analyst、architect、backend-java、backend、frontend、review、database-handler、devops、ecc-workflow）。用户选择 `ecc-workflow` 后，Claude Code 尝试读取 `.github/prompts/skills/ecc-workflow.md`，文件不存在，报错。

根因分析发现 7 个问题：
1. README 承诺 7 个内置 Skill，源码 `.github/prompts/skills/` 只有 6 个（缺 `database-handler.md`）
2. `ecc-workflow` 和 `devops` 来自用户全局仓库 `~/.pmcp/skills/`，非 npm 包分发，新用户不会有
3. bootstrap 提示的 skill 文件路径只写了 `.github/prompts/skills/<name>.md`，未覆盖全局目录
4. `ecc-workflow` 是工作流模式（检测到 ECC 时自动进入），不应作为可选角色列出
5. 已初始化项目执行 `pmcp start` 不会同步新增 skill 文件
6. `initGlobalSkills()` 的 sourceDir 只有 6 个文件，新用户全局仓库不完整

## 2. 核心业务边界

**IN（肯定在范围内）：**
IN: src/skills-manager.ts
IN: src/cli.ts
IN: src/prompts-loader.ts
IN: .github/prompts/skills/database-handler.md
IN: README.md
IN: .github/prompts/task-state.json
IN: .github/prompts/focus-spec.md

**OUT（肯定不在范围内）：**
- 不修改 MCP Server 的 19 个工具实现
- 不修改 hooks/ 目录下的共享脚本
- 不修改 pre-tool-use.cjs（Hard Gate 拦截逻辑）
- 不修改 adapters/ 目录
- 不改变 Skill 文件的 frontmatter 格式

## 3. 禁止触碰黑名单

- 禁止删除现有 6 个 skill 文件（analyst、architect、backend-java、backend、frontend、review）
- 禁止修改 `listSkills()` 的多目录加载架构（4 级优先级设计保留）
- 禁止将 `ecc-workflow.md` 从全局 core 目录删除（它存在是合理的，只是不应出现在角色选择菜单）
- 禁止改变 `.github/prompts/` 目录结构

## 4. 核心测试断言清单

```
assertDatabaseHandlerInSourceSkills()     // .github/prompts/skills/database-handler.md 存在
assertEccWorkflowNotInRoleMenu()          // ecc-workflow 不出现在 listSkills() 返回的角色列表中
assertBootstrapPathHintCoversAllDirs()    // formatBootstrap() 的路径提示覆盖所有 skill 目录
assertInitProjectSyncsNewSkills()         // pmcp start 对已初始化项目同步新增 skill
assertInitGlobalSkillsIncludesAll()       // initGlobalSkills() 复制所有源码 skill 到全局 core
assertReadmeMatchesActualSkillCount()     // README 中的内置 Skill 数量与实际一致
```

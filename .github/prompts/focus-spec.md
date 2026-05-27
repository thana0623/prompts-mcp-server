> task-id: ecc-pmcp-integration-guide
> created: 2026-05-27T21:15:00+08:00
> status: confirmed

## 1. 场景还原

用户同时使用 PMCP（上下文管理）和 ECC（行为执行层）。当前 `pmcp start` 流程直接跳到角色选择，没有 ECC 引导环节。用户希望在 bootstrap 加载上下文后、角色选择前，插入一个 ECC 引导步骤：如果检测到 ECC 已安装，展示精简版 ECC 能力介绍和 PMCP 配合方式；如果 ECC 未安装，跳过引导，走原有流程。

**检测方式**：检查 `~/.claude/rules/ecc/` 目录是否存在（ECC 全局安装位置）。

**引导位置**：`cli.ts` 的 `start` 命令中，Step 3（bootstrap）和 Step 4（skill 选择）之间。

## 2. 核心业务边界

IN: src/cli.ts
IN: README.md

**IN（肯定在范围内）：**
- 在 `cli.ts` 的 `start` 命令中，Step 3 和 Step 4 之间插入 ECC 检测逻辑
- 检测 `~/.claude/rules/ecc/` 目录是否存在
- 存在时输出精简版 ECC 引导内容（不超过 30 行）
- 不存在时跳过，直接进入角色选择（保持当前行为不变）
- 精简版引导内容写在 `cli.ts` 内联，不依赖外部文件读取
- 引导内容包括：ECC 已安装提示、可用 ECC 命令列表（`/tdd`、`/code-review`、`/security-scan`、`/plan`、`/build-fix`）、PMCP + ECC 配合说明

**OUT（肯定不在范围内）：**
- 不修改 ECC 仓库的任何文件
- 不修改 session-start.sh（引导在 CLI 层面，不在 hook 层面）
- 不创建 `ecc-workflow.md` skill 文件（引导是 CLI 输出，不是角色）
- 不修改 bootstrap 流程本身
- 不读取 ECC 的 `ecc-guide/SKILL.md`（避免外部依赖）

## 3. 禁止触碰黑名单

- 禁止读取 ECC 仓库文件（引导内容自包含）
- 禁止修改 `adapters/` 和 `hooks/` 目录
- 禁止让 PMCP 依赖 ECC 的安装路径做任何写操作
- 禁止改变 ECC 未安装时的现有行为（向后兼容）

## 4. 核心测试断言清单

```
assertEccDetected()                          // ~/.claude/rules/ecc/ 存在时输出引导
assertEccNotDetected()                       // ~/.claude/rules/ecc/ 不存在时跳过引导
assertOutputContains("ECC 已安装")            // 引导内容包含 ECC 提示
assertOutputContains("/tdd")                 // 引导内容包含 ECC 命令列表
assertOutputContains("/code-review")         // 包含 code-review 命令
assertOutputContains("选择角色")             // 引导后仍显示角色选择
assertRoleSelectionUnchanged()               // 角色列表不受影响
assertStartWithoutEcc_unchanged()            // 无 ECC 时输出与改动前完全一致
```

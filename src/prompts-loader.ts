/**
 * prompts-loader.ts
 *
 * 通用 prompts 加载模块。
 * 通过环境变量 PROJECT_ROOT 指定目标项目路径，完全解耦。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getProjectRoot, getPromptsDir } from './config.js';
import { loadAllRules } from './rules-manager.js';
import { formatSkillList } from './skills-manager.js';

export { getProjectRoot, getPromptsDir };

// ─── 文件读取 ────────────────────────────────────────────────────────

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// ─── 数据类型 ────────────────────────────────────────────────────────

export interface LogState {
  nextEntryId: number;
  windowId: string;
  windowStartEntry: number;
  windowCount: number;
  windowEntries: WindowEntry[];
}

export interface WindowEntry {
  id: number;
  date: string;
  request: string;
  changes: string[];
  decisions: string[];
  todos: string[];
}

export interface LoadedContext {
  content: string;
  path: string;
}

export interface TaskState {
  stage: string;
  taskId: string | null;
  history?: { stage: string; entered: string; exited?: string; note?: string }[];
}

export interface BootstrapResult {
  context: LoadedContext;
  daily: LoadedContext | null;
  recent5: LoadedContext;
  summary10: LoadedContext;
  todos: LoadedContext;
  devRules: LoadedContext;
  userRules: string;
  logState: LogState | null;
  modules: string[];
  skills: string;
  focusSpec: LoadedContext | null;
  taskState: TaskState | null;
  hasEcc: boolean;
}

// ─── Prompt Loaders ──────────────────────────────────────────────────

export function loadContext(): LoadedContext {
  const filePath = path.join(getPromptsDir(), 'context.md');
  return { content: readFileSafe(filePath), path: filePath };
}

export function loadDaily(date?: string): LoadedContext | null {
  const today = date || new Date().toISOString().slice(0, 10);
  const filePath = path.join(getPromptsDir(), 'daily', `${today}.md`);
  const content = readFileSafe(filePath);
  if (!content) return null;
  return { content, path: filePath };
}

export function loadRecent5(): LoadedContext {
  const filePath = path.join(getPromptsDir(), 'recent-5.md');
  return { content: readFileSafe(filePath), path: filePath };
}

export function loadSummary10(): LoadedContext {
  const filePath = path.join(getPromptsDir(), 'summary-10.md');
  return { content: readFileSafe(filePath), path: filePath };
}

export function loadTodos(): LoadedContext {
  const filePath = path.join(getPromptsDir(), 'todos.md');
  return { content: readFileSafe(filePath), path: filePath };
}

export function loadWorkflowLog(): LoadedContext {
  const filePath = path.join(getPromptsDir(), 'workflow-log.md');
  return { content: readFileSafe(filePath), path: filePath };
}

export function loadDevRules(): LoadedContext {
  const filePath = path.join(getPromptsDir(), 'dev-rules.md');
  return { content: readFileSafe(filePath), path: filePath };
}

export function loadFocusSpec(): LoadedContext | null {
  const filePath = path.join(getPromptsDir(), 'focus-spec.md');
  const content = readFileSafe(filePath);
  if (!content) return null;
  return { content, path: filePath };
}

export function loadLogState(): LogState | null {
  const filePath = path.join(getPromptsDir(), 'log-state.json');
  return readJsonSafe<LogState>(filePath);
}

export function loadTaskState(): TaskState | null {
  const filePath = path.join(getPromptsDir(), 'task-state.json');
  return readJsonSafe<TaskState>(filePath);
}

export function listModules(): string[] {
  const modulesDir = path.join(getPromptsDir(), 'modules');
  try {
    if (!fs.existsSync(modulesDir)) return [];
    return fs.readdirSync(modulesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────

/**
 * 一键启动：加载所有上下文
 */
export function bootstrap(): BootstrapResult {
  const context = loadContext();
  const daily = loadDaily();
  const recent5 = loadRecent5();
  const summary10 = loadSummary10();
  const todos = loadTodos();
  const devRules = loadDevRules();
  const userRules = loadAllRules();
  const logState = loadLogState();
  const modules = listModules();
  const skills = formatSkillList();
  const focusSpec = loadFocusSpec();
  const taskState = loadTaskState();

  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  const hasEcc = fs.existsSync(path.join(homeDir, '.claude', 'rules', 'ecc'));

  return { context, daily, recent5, summary10, todos, devRules, userRules, logState, modules, skills, focusSpec, taskState, hasEcc };
}

/**
 * 格式化 bootstrap 结果为可读文本
 */
export function formatBootstrap(result: BootstrapResult): string {
  const lines: string[] = [];

  lines.push('# 🚀 Prompts MCP Server - Bootstrap');
  lines.push('');

  // ─── Hard Gate: 需求预检（最高优先级，必须最先输出） ───
  // 当 task-state.json 的 stage 为 archived 时，跳过门控（需求已完成归档）
  const isArchived = result.taskState?.stage === 'archived';

  if (!isArchived) {
    lines.push('## 🛑🛑🛑 HARD GATE：需求预检 [最高优先级 - 不可跳过] 🛑🛑🛑');
    lines.push('');
    lines.push('> ⚠️ 此关卡在所有 Skill 选择之前。未通过此关卡，禁止一切写操作和分析工作。');
    lines.push('> ⚠️ 即使用户指定了角色（如"architect"），也必须先完成预检。角色选择不等于跳过预检。');
    lines.push('');
  }

  if (!isArchived) {
    if (!result.focusSpec || !result.focusSpec.content) {
      // focus-spec.md 不存在 — 强制预检
      lines.push('### ❌ focus-spec.md 不存在');
      lines.push('');
      lines.push('```');
      lines.push('╔══════════════════════════════════════════════════════════════════╗');
      lines.push('║  🛑 STOP — 你必须立即停止一切工作，执行以下操作：                 ║');
      lines.push('╠══════════════════════════════════════════════════════════════════╣');
      lines.push('║  1. 停止：不要分析代码、不要检查进度、不要执行任何任务            ║');
      lines.push('║  2. 提问：向用户询问本次要做什么任务                              ║');
      lines.push('║  3. 生成：对话式澄清后生成 .github/prompts/focus-spec.md          ║');
      lines.push('║  4. 等待：提示用户输入 y/approve 签字                            ║');
      lines.push('║  5. 收到 y/approve 之前，禁止 Write/Edit/Bash(写) 和任务分析      ║');
      lines.push('╚══════════════════════════════════════════════════════════════════╝');
      lines.push('```');
      lines.push('');
      lines.push('**允许的操作**：Read / Glob / Grep（只读类，仅用于理解项目结构）');
      lines.push('**禁止的操作**：Write / Edit / Bash（写操作类）、任务分析、代码审查、进度检查');
      lines.push('');
      lines.push('> 💡 正确流程：先问用户"本次要做什么" → 澄清需求 → 生成 focus-spec → 签字 → 再开始工作');
      lines.push('');
    } else {
      // focus-spec.md 存在 — 判断是否已签字确认
      const specContent = result.focusSpec.content;
      const isConfirmed = specContent.includes('status: confirmed') || specContent.includes('status: approved');
      const isFastTrack = specContent.includes('assertCompilePass()');

      if (!isConfirmed) {
        // 存在但未确认
        lines.push('### ⚠️ focus-spec.md 存在但未签字确认');
        lines.push('');
        lines.push('```');
        lines.push('╔══════════════════════════════════════════════════════════════════╗');
        lines.push('║  🛑 STOP — 契约文档等待人类签字：                                 ║');
        lines.push('╠══════════════════════════════════════════════════════════════════╣');
        lines.push('║  1. 向用户展示 focus-spec.md 内容摘要                            ║');
        lines.push('║  2. 明文提示：「请审查。输入 y/approve 签字，或描述修改意见」    ║');
        lines.push('║  3. 收到 y/approve 后，将 status 改为 confirmed                  ║');
        lines.push('║  4. 签字确认前，禁止一切写操作和任务分析                          ║');
        lines.push('╚══════════════════════════════════════════════════════════════════╝');
        lines.push('```');
        lines.push('');
      } else {
        // 已确认
        lines.push('### ✅ focus-spec.md 已签字确认');
        lines.push('');
        if (isFastTrack) {
          lines.push('> ⚡ Fast-Track 模式：断言 = `assertCompilePass()`');
        } else {
          lines.push('> 📋 完整模式：详见 focus-spec.md 第 4 章断言清单');
        }
        lines.push('');
        lines.push('**契约已锁定。后续编码禁止修改已确认的断言。**');
        lines.push('');
      }
    }

    // 生命周期检测提示
    lines.push('### 🔄 生命周期');
    lines.push('');
    lines.push('- 触发「新需求」「新模块」「换一个任务」→ 主动提问是否重置 focus-spec');
    lines.push('- `/clear` 后 focus-spec 自动过期，需重新预检');
    lines.push('- 任务完成并 git commit 后 focus-spec 自动过期');
    lines.push('');
  } else {
    // archived — 门控已通过，显示简要状态
    lines.push('### ✅ 需求已归档（HARD GATE 已跳过）');
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 角色选择 + 工作流引导 — 放在 Hard Gate 之后
  if (result.skills) {
    const skills = result.skills.split('\n').filter(l => l.startsWith('|') && !l.startsWith('|---') && !l.startsWith('| #'));
    const skillList: { name: string; desc: string }[] = [];
    for (const s of skills) {
      const nameMatch = s.match(/\*\*(\S+)\*\*/);
      const name = nameMatch ? nameMatch[1] : '';
      const descMatch = s.match(/\| ([^|]+?) \| v/);
      const desc = descMatch ? descMatch[1].replace(/\*\*/g, '').trim() : '';
      if (name) skillList.push({ name, desc });
    }

    if (result.hasEcc) {
      // ECC 工作流：PMCP 管需求 + ECC 管开发
      lines.push('## ⚡ ECC 工作流');
      lines.push('');
      lines.push('ECC 已检测到。PMCP 管「做什么」，ECC 管「怎么做」。');
      lines.push('');
      lines.push('**请先询问用户想以哪个角色开发：**');
      lines.push('');
      for (const s of skillList) {
        lines.push(`- **${s.name}** — ${s.desc}`);
      }
      lines.push('');
      lines.push('**工作流（按顺序执行）：**');
      lines.push('');
      lines.push('1. 选角色（上方列表）');
      lines.push('2. PMCP: 需求门控 → analyst 输出 focus-spec.md → 人类签字');
      lines.push('3. ECC:  /plan → planner agent 生成实现计划');
      lines.push('4. ECC:  /tdd → tdd-guide 驱动 RED-GREEN-REFACTOR');
      lines.push('5. ECC:  /code-review → code-reviewer 检查质量');
      lines.push('6. ECC:  /security-scan → security-reviewer 检查漏洞');
      lines.push('7. PMCP: 自动日志 + git commit');
      lines.push('');
      lines.push('> 用户说出角色名时，按优先级查找 skill 文件：');
      lines.push('> 1. `.prompts-mcp/skills/<name>.md`（生成目录）');
      lines.push('> 2. `.github/prompts/skills/<name>.md`（项目目录）');
      lines.push('> 3. `~/.pmcp/skills/custom/<name>.md`（全局自定义）');
      lines.push('> 4. `~/.pmcp/skills/core/<name>.md`（全局核心）');
      lines.push('> 每个阶段完成后自动进入下一阶段，无需用户手动触发。');
    } else {
      // 传统流程：手动选 skill
      lines.push('## ⚡ 选择你的角色');
      lines.push('');
      lines.push('在通过 Hard Gate 预检后，**必须**先询问用户想以哪个角色开发。');
      lines.push('');
      lines.push('**角色加载协议：用户说出角色名时，Read 对应文件：**');
      lines.push('');
      for (const s of skillList) {
        lines.push(`- **${s.name}** — ${s.desc}`);
      }
      lines.push('');
      lines.push('> 用户只需说角色名（如"用 analyst 角色"），按优先级查找：');
      lines.push('> 1. `.prompts-mcp/skills/<name>.md` → 2. `.github/prompts/skills/<name>.md` → 3. `~/.pmcp/skills/custom/<name>.md` → 4. `~/.pmcp/skills/core/<name>.md`');
      lines.push('> 找到后 Read 并按其身份行事。');
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## ✅ 加载清单');
  lines.push('');
  lines.push(`✓ context.md: ${result.context.content ? '已加载' : '未找到'}`);
  lines.push(`✓ daily log: ${result.daily ? '已加载' : '今日无日志'}`);
  lines.push(`✓ recent-5.md: ${result.recent5.content ? '已加载' : '未找到'}`);
  lines.push(`✓ summary-10.md: ${result.summary10.content ? '已加载' : '未找到'}`);
  lines.push(`✓ todos.md: ${result.todos.content ? '已加载' : '未找到'}`);
  lines.push(`✓ dev-rules.md: ${result.devRules.content ? '已加载' : '未找到'}`);
  lines.push(`✓ 用户规则: ${result.userRules ? '已加载' : '无'}`);
  lines.push(`✓ 模块记录: ${result.modules.length > 0 ? result.modules.join(', ') : '无'}`);
  lines.push(`✓ Skills: ${result.skills ? '已加载' : '无'}`);
  lines.push('');

  // Context 摘要
  if (result.context.content) {
    lines.push('## 📋 Context 摘要');
    lines.push('');
    const ctxLines = result.context.content.split('\n').slice(0, 20);
    lines.push(...ctxLines);
    if (result.context.content.split('\n').length > 20) lines.push('... (截断)');
    lines.push('');
  }

  // Recent 5
  if (result.recent5.content) {
    lines.push('## 🔄 最近 5 条');
    lines.push('');
    lines.push(result.recent5.content);
    lines.push('');
  }

  // Summary
  if (result.summary10.content) {
    lines.push('## 📊 摘要状态');
    lines.push('');
    lines.push(result.summary10.content);
    lines.push('');
  }

  // Todos
  if (result.todos.content) {
    lines.push('## 📝 待办事项');
    lines.push('');
    lines.push(result.todos.content);
    lines.push('');
  }

  // Dev Rules
  if (result.devRules.content) {
    lines.push('## 📐 开发规范');
    lines.push('');
    const ruleLines = result.devRules.content.split('\n').slice(0, 15);
    lines.push(...ruleLines);
    if (result.devRules.content.split('\n').length > 15) lines.push('... (截断)');
    lines.push('');
  }

  // User Rules
  if (result.userRules) {
    lines.push('## 📝 用户自定义规则');
    lines.push('');
    lines.push(result.userRules);
    lines.push('');
  }

  // Log state
  if (result.logState) {
    lines.push('## 📈 日志状态');
    lines.push('');
    lines.push(`- 下一个 Entry ID: ${result.logState.nextEntryId}`);
    lines.push(`- 当前窗口: ${result.logState.windowId}`);
    lines.push(`- 窗口进度: ${result.logState.windowCount}/10`);
    lines.push('');
  }

  // Modules
  if (result.modules.length > 0) {
    lines.push('## 📦 已有模块记录');
    lines.push('');
    for (const mod of result.modules) {
      lines.push(`- \`${mod}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

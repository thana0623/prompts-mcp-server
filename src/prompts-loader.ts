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
  windowCount: number;
  lastProcessedDate: string;
  lastProcessedCount: number;
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
  archiveHistory: string[];
  eccWorkflow: string | null;
}

// ─── Stage Section Extractor ─────────────────────────────────────────

/**
 * 从 ecc-workflow.md 中提取当前 stage 对应的阶段指南
 */
function extractStageSection(workflow: string, stage: string): string | null {
  // Map stage to Phase section heading
  const stageToPhase: Record<string, string> = {
    'spec-pending': 'Phase 1',
    'confirmed': 'Phase 2',
    'task-planning': 'Phase 3',
    'developing': 'Phase 4',
    'reviewing': 'Phase 5',
    'user-confirming': 'Phase 6',
    'completed': 'Phase 6',
    'incomplete': '中途退出恢复',
    'change-requested': '需求变更',
    'archived': '',
  };

  const phase = stageToPhase[stage];
  if (!phase) return null;

  const lines = workflow.split('\n');
  let start = -1;
  let end = lines.length;

  // Find the section starting with ### Phase N or ### 中途退出恢复 or ### 需求变更
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('### ') && lines[i].includes(phase)) {
      start = i;
      continue;
    }
    // Find the next ### section (end of current section)
    if (start >= 0 && lines[i].startsWith('### ') && !lines[i].includes(phase)) {
      end = i;
      break;
    }
  }

  if (start < 0) return null;
  return lines.slice(start, end).join('\n').trim();
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

/** 加载归档历史摘要（最后 N 条） */
export function loadArchiveHistory(maxEntries: number = 3): string[] {
  const filePath = path.join(getPromptsDir(), 'archive-index.md');
  const content = readFileSafe(filePath);
  if (!content) return [];
  // 只取表格行（以 | 开头，排除表头分隔线）
  const rows = content.split('\n')
    .filter(l => l.startsWith('|') && !l.startsWith('|---') && !l.startsWith('| #'));
  return rows.slice(-maxEntries);
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
  const focusSpec = loadFocusSpec();
  const taskState = loadTaskState();

  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  const hasEcc = fs.existsSync(path.join(homeDir, '.claude', 'rules', 'ecc'));
  const skills = formatSkillList({ hasEcc });
  const archiveHistory = loadArchiveHistory(3);

  // ECC 模式下加载 ecc-workflow 技能内容
  let eccWorkflow: string | null = null;
  if (hasEcc) {
    const candidates = [
      path.join(getPromptsDir(), 'skills', 'ecc-workflow.md'),
    ];
    for (const p of candidates) {
      const content = readFileSafe(p);
      if (content) { eccWorkflow = content; break; }
    }
  }

  return { context, daily, recent5, summary10, todos, devRules, userRules, logState, modules, skills, focusSpec, taskState, hasEcc, archiveHistory, eccWorkflow };
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

    // 阶段感知引导
    const stage = result.taskState?.stage || 'spec-pending';
    lines.push('### 📍 当前阶段');
    lines.push('');

    const stageGuide: Record<string, { label: string; next: string; action: string }> = {
      'spec-pending': {
        label: '⏳ 需求待签字',
        next: '签字确认 focus-spec.md',
        action: '输入 `y` 或 `approve` 签字',
      },
      'confirmed': {
        label: '✅ 需求已签字',
        next: '拆分任务 + 定义完成标准',
        action: '输入 `analyst` 开始任务拆分',
      },
      'task-planning': {
        label: '📋 任务拆分中',
        next: '选择 ECC agent 开始开发',
        action: '完成后输入角色名（如 `backend`）开始开发',
      },
      'developing': {
        label: '🔨 开发中',
        next: '完成开发后进入审查',
        action: '开发完成后输入 `/code-review`',
      },
      'reviewing': {
        label: '🔍 审查中',
        next: '审查通过后用户确认',
        action: '审查完成后等待用户确认',
      },
      'user-confirming': {
        label: '👤 等待用户确认',
        next: '确认通过 → git commit + 归档',
        action: '输入 `通过` 确认，或描述问题回到开发',
      },
      'completed': {
        label: '🎉 开发完成',
        next: 'git commit + /learn + 归档',
        action: '执行 git commit，然后归档',
      },
      'incomplete': {
        label: '⚠️ 上次未完成',
        next: '继续或放弃',
        action: '输入 `继续` 恢复，或 `新需求` 归档后开始新任务',
      },
    };

    const guide = stageGuide[stage];
    if (guide) {
      lines.push(`**${guide.label}**`);
      lines.push('');
      lines.push(`- 下一步：${guide.next}`);
      lines.push(`- 操作：${guide.action}`);
      lines.push('');
    } else {
      lines.push('- 触发「新需求」「新模块」「换一个任务」→ 主动提问是否重置 focus-spec');
      lines.push('- `/clear` 后 focus-spec 自动过期，需重新预检');
      lines.push('');
    }

    // 归档历史摘要
    if (result.archiveHistory && result.archiveHistory.length > 0) {
      lines.push('### 📦 近期归档');
      lines.push('');
      lines.push('| # | 任务 | 结果 |');
      lines.push('|---|------|------|');
      for (const row of result.archiveHistory) {
        lines.push(row);
      }
      lines.push('');
    }
  } else if (isArchived) {
    // archived — 门控已通过，显示归档状态 + 历史
    lines.push('### ✅ 需求已归档（HARD GATE 已跳过）');
    lines.push('');
    lines.push('> 当前无活跃需求。可以开始新需求。');
    lines.push('');
    lines.push('> 💡 **建议：** 输入 `/clear` 清理上下文后再开始新需求，避免历史上下文污染。');
    lines.push('');

    // 归档历史摘要
    if (result.archiveHistory && result.archiveHistory.length > 0) {
      lines.push('### 📦 近期归档');
      lines.push('');
      lines.push('| # | 任务 | 结果 |');
      lines.push('|---|------|------|');
      for (const row of result.archiveHistory) {
        lines.push(row);
      }
      lines.push('');
    }
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
      const currentStage = result.taskState?.stage || 'spec-pending';

      // ECC 模式：强制生命周期引导
      lines.push('## ⚡ ECC 生命周期已激活');
      lines.push('');
      lines.push('```');
      lines.push('spec-pending → confirmed → task-planning → developing → reviewing → user-confirming → completed → archived');
      lines.push('     签字         拆任务       选agent开发      审查         用户确认       git+学习        归档');
      lines.push('```');
      lines.push('');

      // 阶段特定的强制指令
      if (currentStage === 'spec-pending') {
        lines.push('### 🛑 当前阶段：spec-pending — 需求待签字');
        lines.push('');
        lines.push('**你必须立即执行以下操作（不可跳过、不可忽略）：**');
        lines.push('');
        lines.push('1. 向用户询问本次需求是什么');
        lines.push('2. 澄清需求后，调用下方 analyst agent 生成 focus-spec.md');
        lines.push('3. 将 focus-spec.md 内容展示给用户，提示输入 `y` 或 `approve` 签字');
        lines.push('4. 收到签字后，更新 task-state.json stage 为 `confirmed`');
        lines.push('5. **签字前禁止 Write/Edit/Bash(写操作)**');
        lines.push('');
        lines.push('> 💡 不要问用户"想用什么角色"，直接开始需求澄清。');
        lines.push('');

        // 嵌入 analyst agent 内容
        const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
        const analystPath = path.join(homeDir, '.claude', 'agents', 'analyst.md');
        const analystContent = readFileSafe(analystPath);
        if (analystContent) {
          lines.push('### 📖 Analyst Agent（直接调用，无需查找）');
          lines.push('');
          lines.push(analystContent);
          lines.push('');
        }
      } else if (currentStage === 'confirmed') {
        lines.push('### 📍 当前阶段：confirmed — 需求已签字');
        lines.push('');
        lines.push('**你必须立即执行：**');
        lines.push('');
        lines.push('1. 读取 focus-spec.md 了解需求');
        lines.push('2. 拆分子任务，定义完成标准');
        lines.push('3. 更新 task-state.json stage 为 `task-planning`');
        lines.push('');
      } else if (currentStage === 'task-planning') {
        lines.push('### 📍 当前阶段：task-planning — 任务拆分中');
        lines.push('');
        lines.push('**你必须立即执行：**');
        lines.push('');
        lines.push('1. 向用户展示子任务列表');
        lines.push('2. 引导用户选择 ECC agent 开发每个子任务');
        lines.push('3. 更新 task-state.json stage 为 `developing`');
        lines.push('');
      } else if (currentStage === 'developing') {
        lines.push('### 📍 当前阶段：developing — 开发中');
        lines.push('');
        lines.push('**开发完成后：**');
        lines.push('');
        lines.push('1. 检查完成标准是否全部满足');
        lines.push('2. 引导用户输入 `/code-review` 进入审查');
        lines.push('3. 更新 task-state.json stage 为 `reviewing`');
        lines.push('');
      } else if (currentStage === 'reviewing') {
        lines.push('### 📍 当前阶段：reviewing — 审查中');
        lines.push('');
        lines.push('**审查完成后：**');
        lines.push('');
        lines.push('1. 展示审查结果');
        lines.push('2. 更新 task-state.json stage 为 `user-confirming`');
        lines.push('');
      } else if (currentStage === 'user-confirming') {
        lines.push('### 📍 当前阶段：user-confirming — 等待用户确认');
        lines.push('');
        lines.push('**用户确认后：**');
        lines.push('');
        lines.push('1. git commit');
        lines.push('2. 更新 task-state.json stage 为 `completed`');
        lines.push('');
      } else if (currentStage === 'completed') {
        lines.push('### 📍 当前阶段：completed — 开发完成');
        lines.push('');
        lines.push('**收尾操作：**');
        lines.push('');
        lines.push('1. git commit + push');
        lines.push('2. 更新 task-state.json stage 为 `archived`');
        lines.push('');
      } else if (currentStage === 'archived') {
        lines.push('### ✅ 需求已归档');
        lines.push('');
        lines.push('> 当前无活跃需求。描述新需求即可开始新的生命周期。');
        lines.push('');
      }

      // 嵌入 ecc-workflow 当前阶段的详细指南
      if (result.eccWorkflow) {
        const stageSection = extractStageSection(result.eccWorkflow, currentStage);
        if (stageSection) {
          lines.push('### 📖 当前阶段详细指南');
          lines.push('');
          lines.push(stageSection);
          lines.push('');
        }
      }
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

/**
 * 格式化 bootstrap 结果为精简文本（CLI 专用）
 * 只输出：Hard Gate 状态、当前阶段、下一步操作、角色列表
 * 不输出：context.md、recent-5.md、summary-10.md、todos.md、dev-rules.md
 */
export function formatBootstrapCompact(result: BootstrapResult): string {
  const lines: string[] = [];

  lines.push('# 🚀 Prompts MCP Server - Bootstrap');
  lines.push('');

  // ─── Hard Gate: 需求预检 ───
  const isArchived = result.taskState?.stage === 'archived';

  if (!isArchived) {
    lines.push('## 🛑 HARD GATE：需求预检');
    lines.push('');
  }

  if (!isArchived) {
    if (!result.focusSpec || !result.focusSpec.content) {
      lines.push('### ❌ focus-spec.md 不存在');
      lines.push('');
      lines.push('> 请描述需求，我来生成 focus-spec.md 契约文档。');
      lines.push('');
    } else {
      const specContent = result.focusSpec.content;
      const isConfirmed = specContent.includes('status: confirmed') || specContent.includes('status: approved');

      if (!isConfirmed) {
        lines.push('### ⚠️ focus-spec.md 存在但未签字确认');
        lines.push('');
        lines.push('> 请审查契约并输入 y/approve 签字。');
        lines.push('');
      } else {
        lines.push('### ✅ focus-spec.md 已签字确认');
        lines.push('');
        lines.push('**契约已锁定。后续编码禁止修改已确认的断言。**');
        lines.push('');
      }
    }

    // 阶段感知引导
    const stage = result.taskState?.stage || 'spec-pending';
    lines.push('### 📍 当前阶段');
    lines.push('');

    const stageGuide: Record<string, { label: string; next: string; action: string }> = {
      'spec-pending': {
        label: '⏳ 需求待签字',
        next: '签字确认 focus-spec.md',
        action: '输入 `y` 或 `approve` 签字',
      },
      'confirmed': {
        label: '✅ 需求已签字',
        next: '拆分任务 + 定义完成标准',
        action: '输入 `analyst` 开始任务拆分',
      },
      'task-planning': {
        label: '📋 任务拆分中',
        next: '选择 ECC agent 开始开发',
        action: '确认任务拆分后选择 agent',
      },
      'developing': {
        label: '🔨 开发中',
        next: '完成开发后审查',
        action: '输入 `/code-review` 进入审查',
      },
      'reviewing': {
        label: '🔍 审查中',
        next: '审查通过后用户确认',
        action: '等待审查完成',
      },
      'user-confirming': {
        label: '👤 等待用户确认',
        next: '用户确认后归档',
        action: '输入 `通过` 确认',
      },
      'completed': {
        label: '🎉 开发完成',
        next: '归档',
        action: '输入 `归档` 完成',
      },
      'incomplete': {
        label: '⚠️ 上次未完成',
        next: '继续或开始新需求',
        action: '输入 `继续` 或 `新需求`',
      },
      'archived': {
        label: '✅ 已归档',
        next: '开始新需求',
        action: '描述新需求即可',
      },
    };

    const guide = stageGuide[stage];
    if (guide) {
      lines.push(`**${guide.label}**`);
      lines.push(`- 下一步: ${guide.next}`);
      lines.push(`- 操作: ${guide.action}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  // 角色选择 + 工作流引导
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
      const currentStage = result.taskState?.stage || 'spec-pending';

      // ECC 模式：强制生命周期引导
      lines.push('## ⚡ ECC 生命周期已激活');
      lines.push('');
      lines.push('```');
      lines.push('spec-pending → confirmed → task-planning → developing → reviewing → user-confirming → completed → archived');
      lines.push('     签字         拆任务       选agent开发      审查         用户确认       git+学习        归档');
      lines.push('```');
      lines.push('');

      // 阶段特定的强制指令
      if (currentStage === 'spec-pending') {
        lines.push('### 🛑 当前阶段：spec-pending — 需求待签字');
        lines.push('');
        lines.push('> 💡 不要问用户"想用什么角色"，直接开始需求澄清。');
        lines.push('');
      }
    } else {
      // 传统流程：手动选 skill
      lines.push('## ⚡ 选择你的角色');
      lines.push('');
      for (const s of skillList) {
        lines.push(`- **${s.name}** — ${s.desc}`);
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  // 加载清单（精简版）
  lines.push('## ✅ 加载清单');
  lines.push('');
  lines.push(`✓ context.md: ${result.context.content ? '已加载' : '未找到'}`);
  lines.push(`✓ Skills: ${result.skills ? '已加载' : '无'}`);
  lines.push('');

  return lines.join('\n');
}

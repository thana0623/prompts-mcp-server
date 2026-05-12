/**
 * dialog-logger.ts
 *
 * 对话日志记录模块。
 * 管理 daily / recent-5 / summary-10 / log-state / todos 的写入。
 * 从 index.ts MCP Server 类中抽取，供 MCP Server 和 CLI 共用。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Entry ID ───────────────────────────────────────────────────────

export function getNextEntryId(promptsDir: string): number {
  const statePath = path.join(promptsDir, 'log-state.json');
  try {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      return state.nextEntryId || 1;
    }
  } catch { /* ignore */ }
  return 1;
}

// ─── Daily Log ──────────────────────────────────────────────────────

export function appendDailyLog(
  promptsDir: string, today: string, entryId: number,
  title: string, request: string, changes: string[], decisions: string[], todos: string[]
): void {
  const dailyDir = path.join(promptsDir, 'daily');
  if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });

  const dailyPath = path.join(dailyDir, `${today}.md`);
  const entry = [
    '',
    `## Entry-${String(entryId).padStart(3, '0')}`,
    `- 时间: ${new Date().toISOString()}`,
    `- 标题: ${title}`,
    `- 清洗后需求: ${request}`,
    changes.length > 0 ? `- 代码变更: ${changes.join(', ')}` : '',
    decisions.length > 0 ? `- 技术决策: ${decisions.join('; ')}` : '',
    todos.length > 0 ? `- 待办: ${todos.join('; ')}` : '',
    '',
  ].filter(Boolean).join('\n');

  fs.appendFileSync(dailyPath, entry, 'utf-8');
}

// ─── Recent 5 ───────────────────────────────────────────────────────

export function updateRecent5(
  promptsDir: string, entryId: number, today: string,
  _title: string, request: string, changes: string[], decisions: string[], todos: string[]
): void {
  const recentPath = path.join(promptsDir, 'recent-5.md');
  const newEntry = [
    `## Entry-${String(entryId).padStart(3, '0')}`,
    `- 日期: ${today}`,
    `- 清洗后需求: ${request}`,
    changes.length > 0 ? `- 代码变更:\n${changes.map(c => `  - ${c}`).join('\n')}` : '- 代码变更: (无)',
    decisions.length > 0 ? `- 技术决策:\n${decisions.map(d => `  - ${d}`).join('\n')}` : '- 技术决策: (无)',
    todos.length > 0 ? `- 待办:\n${todos.map(t => `  - ${t}`).join('\n')}` : '- 待办: (无)',
    '',
  ].join('\n');

  let content = '';
  if (fs.existsSync(recentPath)) {
    content = fs.readFileSync(recentPath, 'utf-8');
  }

  const headerMatch = content.match(/^.*?(?=\n## Entry-)/s);
  const header = headerMatch ? headerMatch[0].trim() : `# 最近 5 条对话与操作（动态窗口）\n\n> 规则：每次新增 1 条，超过 5 条时删除最旧 1 条，仅保留最近 5 条。\n`;

  const entries = content.split(/\n(?=## Entry-)/).filter(e => e.startsWith('## Entry-'));
  entries.push(newEntry);

  const recentEntries = entries.slice(-5);

  const updated = `${header}\n\n${recentEntries.join('\n')}\n`;
  fs.writeFileSync(recentPath, updated, 'utf-8');
}

// ─── Summary 10 ─────────────────────────────────────────────────────

export function updateSummary10(
  promptsDir: string, entryId: number, today: string,
  request: string, changes: string[], decisions: string[], todos: string[]
): void {
  const summaryPath = path.join(promptsDir, 'summary-10.md');
  let content = '';
  if (fs.existsSync(summaryPath)) {
    content = fs.readFileSync(summaryPath, 'utf-8');
  }

  if (!content) {
    content = `# 近 10 条对话状态摘要（Stateful）\n\n## 窗口元数据\n- window_id: W-0001\n- 统计范围: Entry-001 ~ Entry-010\n- 当前已收录: 0 / 10\n\n## Stateful 摘要\n### Current State\n- 项目初始化完成。\n\n### Decisions Kept\n- (暂无)\n\n### Invalidated Decisions\n- (暂无)\n\n### Open TODO\n- (暂无)\n\n### Carry Forward\n- (暂无)\n`;
  }

  const countMatch = content.match(/当前已收录:\s*(\d+)\s*\/\s*10/);
  let count = countMatch ? parseInt(countMatch[1]) : 0;
  count = Math.min(count + 1, 10);

  content = content.replace(/当前已收录:\s*\d+\s*\/\s*10/, `当前已收录: ${count} / 10`);

  const stateSection = content.match(/### Current State\n([\s\S]*?)(?=\n### Decisions Kept)/);
  if (stateSection) {
    const newState = `### Current State\n- Entry-${String(entryId).padStart(3, '0')} (${today}): ${request}\n- Window progress: ${count}/10`;
    content = content.replace(/### Current State\n[\s\S]*?(?=\n### Decisions Kept)/, newState + '\n');
  }

  if (decisions.length > 0) {
    const keptSection = content.match(/### Decisions Kept\n([\s\S]*?)(?=\n### Invalidated Decisions)/);
    if (keptSection) {
      const newDecisions = decisions.map(d => `- ${d}`).join('\n');
      const existingDecisions = keptSection[1].trim();
      if (existingDecisions === '(暂无)') {
        content = content.replace(/### Decisions Kept\n\(暂无\)/, `### Decisions Kept\n${newDecisions}`);
      } else {
        content = content.replace(/### Decisions Kept\n[\s\S]*?(?=\n### Invalidated Decisions)/,
          `### Decisions Kept\n${existingDecisions}\n${newDecisions}\n`);
      }
    }
  }

  if (todos.length > 0) {
    const todoSection = content.match(/### Open TODO\n([\s\S]*?)(?=\n### Carry Forward)/);
    if (todoSection) {
      const newTodos = todos.map(t => `- ${t}`).join('\n');
      const existingTodos = todoSection[1].trim();
      if (existingTodos === '(暂无)') {
        content = content.replace(/### Open TODO\n\(暂无\)/, `### Open TODO\n${newTodos}`);
      } else {
        content = content.replace(/### Open TODO\n[\s\S]*?(?=\n### Carry Forward)/,
          `### Open TODO\n${existingTodos}\n${newTodos}\n`);
      }
    }
  }

  fs.writeFileSync(summaryPath, content, 'utf-8');
}

// ─── Log State ──────────────────────────────────────────────────────

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

export function updateLogState(
  promptsDir: string, entryId: number, today: string,
  request: string, changes: string[], decisions: string[], todos: string[],
  clearWindow: boolean,
): void {
  const statePath = path.join(promptsDir, 'log-state.json');
  let state: LogState = {
    nextEntryId: 1,
    windowId: 'W-0001',
    windowStartEntry: 1,
    windowCount: 0,
    windowEntries: [],
  };

  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } catch { /* use default */ }
  }

  state.windowEntries.push({
    id: entryId,
    date: today,
    request,
    changes,
    decisions,
    todos,
  });

  state.windowCount = state.windowEntries.length;
  state.nextEntryId = entryId + 1;

  if (clearWindow && state.windowCount >= 10) {
    const windowNum = parseInt(state.windowId.replace('W-', '')) || 1;
    state.windowId = `W-${String(windowNum + 1).padStart(4, '0')}`;
    state.windowStartEntry = entryId + 1;
    state.windowCount = 0;
    state.windowEntries = [];
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Todos ──────────────────────────────────────────────────────────

export function appendTodos(promptsDir: string, todos: string[]): void {
  const todosPath = path.join(promptsDir, 'todos.md');
  let content = '';
  if (fs.existsSync(todosPath)) {
    content = fs.readFileSync(todosPath, 'utf-8');
  } else {
    content = `# 待办事项\n\n## 进行中\n\n*(暂无)*\n\n## 已完成\n\n*(暂无)*\n`;
  }

  const inProgressMarker = '## 进行中';
  const idx = content.indexOf(inProgressMarker);
  if (idx !== -1) {
    const afterMarker = content.indexOf('\n', idx) + 1;
    const newTodos = todos.map(t => `- [ ] ${t}`).join('\n');
    content = content.slice(0, afterMarker) + `\n${newTodos}` + content.slice(afterMarker);
  }

  fs.writeFileSync(todosPath, content, 'utf-8');
}

// ─── High-level: logDialog ──────────────────────────────────────────

export interface LogDialogParams {
  title: string;
  request: string;
  changes?: string[];
  decisions?: string[];
  todos?: string[];
}

export interface LogDialogResult {
  entryId: number;
  today: string;
}

/**
 * 记录一次对话日志（更新 daily + recent-5 + summary-10 + log-state + todos）
 */
export function logDialog(
  promptsDir: string,
  params: LogDialogParams
): LogDialogResult {
  const today = new Date().toISOString().slice(0, 10);
  const entryId = getNextEntryId(promptsDir);
  const changes = params.changes || [];
  const decisions = params.decisions || [];
  const todos = params.todos || [];

  appendDailyLog(promptsDir, today, entryId, params.title, params.request, changes, decisions, todos);
  updateRecent5(promptsDir, entryId, today, params.title, params.request, changes, decisions, todos);
  updateSummary10(promptsDir, entryId, today, params.request, changes, decisions, todos);
  // summary 已成功写入后才允许滚动窗口（防止 summary 写入失败时丢失窗口数据）
  updateLogState(promptsDir, entryId, today, params.request, changes, decisions, todos, true);

  if (todos.length > 0) {
    appendTodos(promptsDir, todos);
  }

  return { entryId, today };
}

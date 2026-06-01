/**
 * dialog-logger.ts
 *
 * 对话日志记录模块。
 * 管理 daily / recent-5 / summary-10 / log-state / todos 的写入。
 * 统一使用中文 ## 对话-NNN 格式。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LogState } from './prompts-loader.js';

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
  const padId = String(entryId).padStart(3, '0');
  const changesDesc = changes.length > 0
    ? changes.map(c => `  - ${c}`).join('\n')
    : '  - (无)';
  const entry = [
    '',
    `## 对话-${padId}`,
    '',
    `- **时间**: ${new Date().toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d+/, '')}`,
    `- **用户问题**: ${request}`,
    `- **本轮改动**:\n${changesDesc}`,
    `- **结果**: ${changes.length > 0 ? `完成（${changes.length} 个文件修改）` : '对话（无代码修改）'}`,
    '',
  ].join('\n');

  fs.appendFileSync(dailyPath, entry, 'utf-8');
}

// ─── Recent 5 ───────────────────────────────────────────────────────

export function updateRecent5(
  promptsDir: string, entryId: number, today: string,
  _title: string, request: string, changes: string[], decisions: string[], _todos: string[]
): void {
  const recentPath = path.join(promptsDir, 'recent-5.md');
  const padId = String(entryId).padStart(3, '0');
  const changesDesc = changes.length > 0
    ? changes.map(c => `  - ${c}`).join('\n')
    : '  - (无)';
  const newEntry = [
    `## 对话-${padId}`,
    `- **时间**: ${today}`,
    `- **用户问题**: ${request}`,
    `- **本轮改动**:\n${changesDesc}`,
    `- **结果**: ${changes.length > 0 ? `完成（${changes.length} 个文件修改）` : '对话（无代码修改）'}`,
    '',
  ].join('\n');

  let content = '';
  if (fs.existsSync(recentPath)) {
    content = fs.readFileSync(recentPath, 'utf-8');
  }

  const headerMatch = content.match(/^.*?(?=\n## (?:对话|Dialog|Event)-)/s);
  const header = headerMatch ? headerMatch[0].trim() : `# 最近对话记录（自动维护）\n\n> 由 session-end hook 自动生成，勿手动编辑。\n> 保留最近 5 条对话。\n`;

  // 兼容旧格式
  const entries = content.split(/\n(?=## (?:对话|Dialog|Event)-)/).filter(e => e.startsWith('## 对话-') || e.startsWith('## Dialog-') || e.startsWith('## Event-'));
  entries.push(newEntry);

  const recentEntries = entries.slice(-5);

  const updated = `${header}\n\n${recentEntries.join('\n')}\n`;
  fs.writeFileSync(recentPath, updated, 'utf-8');
}

// ─── Summary 10 ─────────────────────────────────────────────────────

export function updateSummary10(
  promptsDir: string, entryId: number, today: string,
  request: string, changes: string[], _decisions: string[], _todos: string[]
): void {
  const summaryPath = path.join(promptsDir, 'summary-10.md');
  let content = '';
  if (fs.existsSync(summaryPath)) {
    content = fs.readFileSync(summaryPath, 'utf-8');
  }

  if (!content) {
    content = `# 对话摘要（有状态窗口）\n\n> 自动维护的滚动窗口。每 10 次对话生成一次压缩摘要。\n\n## W-0001\n\n- 窗口进度: 0/10\n`;
  }

  // 更新窗口进度
  const progressRe = /窗口进度:\s*(\d+)\s*\/\s*10/;
  const countMatch = content.match(progressRe);
  let count = countMatch ? parseInt(countMatch[1]) : 0;
  count = Math.min(count + 1, 10);
  content = content.replace(progressRe, `窗口进度: ${count}/10`);

  fs.writeFileSync(summaryPath, content, 'utf-8');
}

// ─── Log State ──────────────────────────────────────────────────────

export function updateLogState(
  promptsDir: string, entryId: number, today: string,
  _request: string, _changes: string[], _decisions: string[], _todos: string[],
  clearWindow: boolean,
): void {
  const statePath = path.join(promptsDir, 'log-state.json');
  let state: LogState = {
    nextEntryId: 1,
    windowId: 'W-0001',
    windowCount: 0,
    lastProcessedDate: '',
    lastProcessedCount: 0,
  };

  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } catch { /* use default */ }
  }

  state.windowCount++;
  state.nextEntryId = entryId + 1;
  state.lastProcessedDate = today;

  if (clearWindow && state.windowCount >= 10) {
    const windowNum = parseInt(state.windowId.replace('W-', '')) || 1;
    state.windowId = `W-${String(windowNum + 1).padStart(4, '0')}`;
    state.windowCount = 0;
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
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

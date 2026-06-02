/**
 * dialog-logger.ts
 *
 * 对话日志记录模块。
 * 职责：仅管理 todos.md 的写入。
 * daily / recent-5 / summary-10 / log-state 由 Shell writer
 * (generate-dialog-summary.sh) 在 session-end 时统一生成。
 * 统一使用中文 ## 对话-NNN 格式。
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
// @deprecated — 由 Shell writer (generate-dialog-summary.sh) 在 session-end 时统一生成
// 保留函数签名以兼容外部调用，但不再被 logDialog() 使用

export function appendDailyLog(
  _promptsDir: string, _today: string, _entryId: number,
  _title: string, _request: string, _changes: string[], _decisions: string[], _todos: string[]
): void {
  // no-op — Shell writer is authoritative
}

// ─── Recent 5 ───────────────────────────────────────────────────────
// @deprecated — 由 Shell writer (generate-dialog-summary.sh) 在 session-end 时统一生成

export function updateRecent5(
  _promptsDir: string, _entryId: number, _today: string,
  _title: string, _request: string, _changes: string[], _decisions: string[], _todos: string[]
): void {
  // no-op — Shell writer is authoritative
}

// ─── Summary 10 ─────────────────────────────────────────────────────
// @deprecated — 由 Shell writer (generate-dialog-summary.sh) 在 session-end 时统一生成

export function updateSummary10(
  _promptsDir: string, _entryId: number, _today: string,
  _request: string, _changes: string[], _decisions: string[], _todos: string[]
): void {
  // no-op — Shell writer is authoritative
}

// ─── Log State ──────────────────────────────────────────────────────
// @deprecated — 由 Shell writer (generate-dialog-summary.sh) 在 session-end 时统一生成

export function updateLogState(
  _promptsDir: string, _entryId: number, _today: string,
  _request: string, _changes: string[], _decisions: string[], _todos: string[],
  _clearWindow: boolean,
): void {
  // no-op — Shell writer is authoritative
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
 * 记录一次对话日志。
 * daily / recent-5 / summary-10 / log-state 由 Shell writer
 * (generate-dialog-summary.sh) 在 session-end 时统一生成。
 * 此函数只负责 todos.md 的追加。
 */
export function logDialog(
  promptsDir: string,
  params: LogDialogParams
): LogDialogResult {
  const today = new Date().toISOString().slice(0, 10);
  const entryId = getNextEntryId(promptsDir);
  const todos = params.todos || [];

  if (todos.length > 0) {
    appendTodos(promptsDir, todos);
  }

  return { entryId, today };
}

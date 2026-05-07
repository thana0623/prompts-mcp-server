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

export function loadLogState(): LogState | null {
  const filePath = path.join(getPromptsDir(), 'log-state.json');
  return readJsonSafe<LogState>(filePath);
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

  return { context, daily, recent5, summary10, todos, devRules, userRules, logState, modules };
}

/**
 * 格式化 bootstrap 结果为可读文本
 */
export function formatBootstrap(result: BootstrapResult): string {
  const lines: string[] = [];

  lines.push('# 🚀 Prompts MCP Server - Bootstrap');
  lines.push('');
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

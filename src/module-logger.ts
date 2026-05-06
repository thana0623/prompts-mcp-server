/**
 * module-logger.ts
 * 
 * 目录式模块记录系统。
 * 按模块记录每一项修改，修改功能前自动读取模块记录。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── 类型定义 ────────────────────────────────────────────────────────

export interface ModuleEntry {
  date: string;
  change: string;
  files: string[];
  decisions: string[];
}

export interface ModuleLog {
  moduleName: string;
  entries: ModuleEntry[];
  currentState: string;
  todos: string[];
}

// ─── 路径 ────────────────────────────────────────────────────────────

function getModulesDir(projectRoot: string): string {
  return path.join(projectRoot, '.github', 'prompts', 'modules');
}

function getModulePath(projectRoot: string, moduleName: string): string {
  return path.join(getModulesDir(projectRoot), `${moduleName}.md`);
}

// ─── 读取模块记录 ────────────────────────────────────────────────────

/**
 * 读取模块记录文件内容
 */
export function readModuleLog(projectRoot: string, moduleName: string): string {
  const filePath = getModulePath(projectRoot, moduleName);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return `# 模块记录: ${moduleName}\n\n*暂无记录*\n`;
  } catch {
    return `# 模块记录: ${moduleName}\n\n*读取失败*\n`;
  }
}

/**
 * 列出所有已有模块记录
 */
export function listModuleLogs(projectRoot: string): string[] {
  const modulesDir = getModulesDir(projectRoot);
  try {
    if (!fs.existsSync(modulesDir)) return [];
    return fs.readdirSync(modulesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

// ─── 写入模块记录 ────────────────────────────────────────────────────

/**
 * 追加一条模块修改记录
 */
export function appendModuleLog(
  projectRoot: string,
  moduleName: string,
  entry: ModuleEntry
): { success: boolean; error?: string } {
  try {
    const modulesDir = getModulesDir(projectRoot);
    if (!fs.existsSync(modulesDir)) {
      fs.mkdirSync(modulesDir, { recursive: true });
    }

    const filePath = getModulePath(projectRoot, moduleName);
    let existing = '';
    if (fs.existsSync(filePath)) {
      existing = fs.readFileSync(filePath, 'utf-8');
    }

    // 构建新条目行
    const filesStr = entry.files.join(', ') || '-';
    const decisionsStr = entry.decisions.join('; ') || '-';
    const newRow = `| ${entry.date} | ${entry.change} | ${filesStr} | ${decisionsStr} |\n`;

    if (!existing) {
      // 新文件
      const content = `# 模块记录: ${moduleName}

> 按模块记录每一项修改，修改前先读取此文件了解历史。

## 修改历史

| 日期 | 变更内容 | 涉及文件 | 决策 |
|------|---------|---------|------|
${newRow}
## 当前状态

- 待补充

## 待办

- [ ] 补充模块说明
`;
      fs.writeFileSync(filePath, content, 'utf-8');
    } else {
      // 追加到表格中（在表头之后插入）
      const tableMarker = '|------|---------|---------|------|';
      const idx = existing.indexOf(tableMarker);
      if (idx !== -1) {
        const insertPos = idx + tableMarker.length;
        const updated = existing.slice(0, insertPos) + '\n' + newRow + existing.slice(insertPos);
        fs.writeFileSync(filePath, updated, 'utf-8');
      } else {
        // 没有表格，追加到末尾
        const updated = existing + `\n| ${entry.date} | ${entry.change} | ${filesStr} | ${decisionsStr} |\n`;
        fs.writeFileSync(filePath, updated, 'utf-8');
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * 更新模块记录的当前状态
 */
export function updateModuleState(
  projectRoot: string,
  moduleName: string,
  newState: string
): { success: boolean; error?: string } {
  try {
    const filePath = getModulePath(projectRoot, moduleName);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `模块记录不存在: ${moduleName}` };
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    const stateMarker = '## 当前状态';
    const stateIdx = content.indexOf(stateMarker);
    if (stateIdx !== -1) {
      const nextSection = content.indexOf('\n## ', stateIdx + 1);
      const beforeState = content.slice(0, stateIdx + stateMarker.length);
      const afterState = nextSection !== -1 ? content.slice(nextSection) : '';
      content = `${beforeState}\n\n- ${newState}\n${afterState}`;
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

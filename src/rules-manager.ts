/**
 * rules-manager.ts
 *
 * 项目规范规则管理。
 * 每条规则存储为独立 .md 文件，支持 frontmatter 元数据。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPromptsDir } from './config.js';

export interface RuleMeta {
  name: string;
  category: string;
  created: string;
}

export interface Rule {
  meta: RuleMeta;
  content: string;
  filePath: string;
}

// ─── 路径 ────────────────────────────────────────────────────────────

function getRulesDir(): string {
  return path.join(getPromptsDir(), 'rules');
}

function getRulePath(name: string): string {
  return path.join(getRulesDir(), `${name}.md`);
}

// ─── 规则 CRUD ───────────────────────────────────────────────────────

/**
 * 添加一条规则
 */
export function addRule(
  name: string,
  content: string,
  category: string = 'general'
): { success: boolean; error?: string } {
  try {
    const rulesDir = getRulesDir();
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }

    const filePath = getRulePath(name);
    const today = new Date().toISOString().slice(0, 10);

    const fileContent = [
      '---',
      `name: ${name}`,
      `category: ${category}`,
      `created: ${today}`,
      '---',
      '',
      content,
      '',
    ].join('\n');

    fs.writeFileSync(filePath, fileContent, 'utf-8');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * 删除一条规则
 */
export function removeRule(name: string): { success: boolean; error?: string } {
  try {
    const filePath = getRulePath(name);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `规则不存在: ${name}` };
    }
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * 列出所有规则
 */
export function listRules(): Rule[] {
  const rulesDir = getRulesDir();
  if (!fs.existsSync(rulesDir)) return [];

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  return files.map(f => {
    const filePath = path.join(rulesDir, f);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return parseRuleFile(raw, filePath);
  }).filter(Boolean) as Rule[];
}

/**
 * 读取单条规则
 */
export function readRule(name: string): Rule | null {
  const filePath = getRulePath(name);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseRuleFile(raw, filePath);
}

/**
 * 读取所有规则内容（合并为一个字符串，用于 bootstrap）
 */
export function loadAllRules(): string {
  const rules = listRules();
  if (rules.length === 0) return '';

  const sections = rules.map(r => {
    const cat = r.meta.category ? ` [${r.meta.category}]` : '';
    return `### ${r.meta.name}${cat}\n\n${r.content}`;
  });

  return sections.join('\n\n---\n\n');
}

// ─── 内部工具 ────────────────────────────────────────────────────────

function parseRuleFile(raw: string, filePath: string): Rule | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    // 没有 frontmatter，整个文件作为内容
    const name = path.basename(filePath, '.md');
    return {
      meta: { name, category: 'general', created: '' },
      content: raw.trim(),
      filePath,
    };
  }

  const fmLines = fmMatch[1].split('\n');
  const meta: Record<string, string> = {};
  for (const line of fmLines) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }

  return {
    meta: {
      name: meta.name || path.basename(filePath, '.md'),
      category: meta.category || 'general',
      created: meta.created || '',
    },
    content: fmMatch[2].trim(),
    filePath,
  };
}

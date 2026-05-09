/**
 * skills-manager.ts
 *
 * 角色技能管理。
 * 每个 skill 存储为独立 .md 文件，支持 frontmatter 元数据。
 * 智能体可选择 skill 作为身份，并在会话后自我优化。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPromptsDir } from './config.js';

export interface SkillMeta {
  name: string;
  icon: string;
  description: string;
  version: number;
  created: string;
  updated: string;
}

export interface Skill {
  meta: SkillMeta;
  content: string;
  filePath: string;
}

// ─── 路径 ────────────────────────────────────────────────────────────

function getSkillsDir(): string {
  return path.join(getPromptsDir(), 'skills');
}

function getSkillPath(name: string): string {
  return path.join(getSkillsDir(), `${name}.md`);
}

// ─── Skill CRUD ──────────────────────────────────────────────────────

/**
 * 列出所有 skill（仅元数据，不含全文）
 */
export function listSkills(): Skill[] {
  const skillsDir = getSkillsDir();
  if (!fs.existsSync(skillsDir)) return [];

  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const filePath = path.join(skillsDir, f);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return parseSkillFile(raw, filePath);
  }).filter(Boolean) as Skill[];
}

/**
 * 读取单个 skill 的完整内容
 */
export function selectSkill(name: string): Skill | null {
  const filePath = getSkillPath(name);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseSkillFile(raw, filePath);
}

/**
 * 更新 skill：追加学习记录或修改规范
 */
export function updateSkill(
  name: string,
  options: {
    learnings?: string;
    guidelineChanges?: string;
    description?: string;
  }
): { success: boolean; error?: string } {
  try {
    const filePath = getSkillPath(name);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Skill 不存在: ${name}` };
    }

    let raw = fs.readFileSync(filePath, 'utf-8');
    const today = new Date().toISOString().slice(0, 10);

    // 更新 frontmatter 中的 updated 和 version
    const versionMatch = raw.match(/version:\s*(\d+)/);
    const currentVersion = versionMatch ? parseInt(versionMatch[1]) : 1;
    const newVersion = currentVersion + 1;

    raw = raw.replace(/updated:\s*[\d-]+/, `updated: ${today}`);
    raw = raw.replace(/version:\s*\d+/, `version: ${newVersion}`);

    // 如果有 description 更新
    if (options.description) {
      raw = raw.replace(/description:.*/, `description: ${options.description}`);
    }

    // 如果有规范变更，替换 ## 开发规范 之后的内容
    if (options.guidelineChanges) {
      const guidelineMatch = raw.match(/(## 开发规范\n)([\s\S]*?)(?=\n## 学习记录)/);
      if (guidelineMatch) {
        raw = raw.replace(
          /## 开发规范\n[\s\S]*?(?=\n## 学习记录)/,
          `## 开发规范\n\n${options.guidelineChanges}\n`
        );
      }
    }

    // 追加学习记录
    if (options.learnings) {
      const learningEntry = `\n### v${newVersion} (${today})\n${options.learnings}\n`;
      // 在 ## 学习记录 之后追加
      const learningIdx = raw.indexOf('## 学习记录');
      if (learningIdx !== -1) {
        const afterHeader = raw.indexOf('\n', learningIdx) + 1;
        raw = raw.slice(0, afterHeader) + learningEntry + raw.slice(afterHeader);
      } else {
        raw += `\n## 学习记录\n${learningEntry}\n`;
      }
    }

    fs.writeFileSync(filePath, raw, 'utf-8');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * 添加新 skill
 */
export function addSkill(
  name: string,
  options: {
    icon?: string;
    description: string;
    identity: string;
    guidelines: string;
  }
): { success: boolean; error?: string } {
  try {
    const skillsDir = getSkillsDir();
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    const filePath = getSkillPath(name);
    if (fs.existsSync(filePath)) {
      return { success: false, error: `Skill 已存在: ${name}` };
    }

    const today = new Date().toISOString().slice(0, 10);
    const icon = options.icon || '🎯';

    const fileContent = [
      '---',
      `name: ${name}`,
      `icon: ${icon}`,
      `description: ${options.description}`,
      'version: 1',
      `created: ${today}`,
      `updated: ${today}`,
      '---',
      '',
      '## 身份',
      '',
      options.identity,
      '',
      '## 开发规范',
      '',
      options.guidelines,
      '',
      '## 学习记录',
      '',
      `### v1 (${today})`,
      '- 初始版本',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, fileContent, 'utf-8');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * 列出所有 skill 的简要信息（用于 auto_start 展示）
 */
export function formatSkillList(): string {
  const skills = listSkills();
  if (skills.length === 0) return '';

  const lines: string[] = [];
  lines.push('## 🎭 可用 Skill（角色技能）');
  lines.push('');
  lines.push('| # | Skill | 图标 | 说明 | 版本 |');
  lines.push('|---|-------|------|------|------|');
  skills.forEach((s, i) => {
    lines.push(`| ${i + 1} | **${s.meta.name}** | ${s.meta.icon} | ${s.meta.description} | v${s.meta.version} |`);
  });
  lines.push('');
  lines.push('> 请询问用户想以哪个角色开始开发，然后调用 `select_skill` 加载该 skill。');

  return lines.join('\n');
}

// ─── 内部工具 ────────────────────────────────────────────────────────

function parseSkillFile(raw: string, filePath: string): Skill | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    const name = path.basename(filePath, '.md');
    return {
      meta: { name, icon: '🎯', description: '', version: 1, created: '', updated: '' },
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
      icon: meta.icon || '🎯',
      description: meta.description || '',
      version: parseInt(meta.version) || 1,
      created: meta.created || '',
      updated: meta.updated || '',
    },
    content: fmMatch[2].trim(),
    filePath,
  };
}

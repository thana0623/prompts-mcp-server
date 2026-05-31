/**
 * skills-manager.ts
 *
 * 角色技能管理。
 * 每个 skill 存储为独立 .md 文件，支持 frontmatter 元数据。
 * 智能体可选择 skill 作为身份，并在会话后自我优化。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getPromptsDir,
  getCoreSkillsDir,
  getCustomSkillsDir,
  getGeneratedSkillsDir,
  getGlobalSkillsDir,
} from './config.js';
import { parseFrontmatter } from './frontmatter.js';

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

/** 获取所有 skill 目录（按优先级从高到低排序） */
function getSkillDirectories(): string[] {
  return [
    getGeneratedSkillsDir(),   // 最高优先级：项目生成的 skill
    getSkillsDir(),            // 项目 skill
    getCustomSkillsDir(),      // 个人自定义 skill
    getCoreSkillsDir(),        // 核心 skill（只读）
  ];
}

// ─── Skill CRUD ──────────────────────────────────────────────────────

/**
 * 列出所有 skill（仅元数据，不含全文）
 * 从多个目录加载，按优先级去重
 */
// ecc-workflow 是工作流模式（检测到 ECC 时自动进入），不是可选角色
const EXCLUDED_SKILLS = new Set(['ecc-workflow']);

export function listSkills(): Skill[] {
  const allSkills = new Map<string, Skill>();

  for (const dir of getSkillDirectories()) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const name = path.basename(f, '.md');
      if (EXCLUDED_SKILLS.has(name)) continue;
      if (!allSkills.has(name)) {
        const filePath = path.join(dir, f);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const skill = parseSkillFile(raw, filePath);
        if (skill) allSkills.set(name, skill);
      }
    }
  }

  return Array.from(allSkills.values());
}

/**
 * 读取单个 skill 的完整内容
 * 从多个目录查找，组合学习记录
 */
export function selectSkill(name: string): Skill | null {
  const dirs = getSkillDirectories();
  const skills: Skill[] = [];

  for (const dir of dirs) {
    const filePath = path.join(dir, `${name}.md`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const skill = parseSkillFile(raw, filePath);
      if (skill) skills.push(skill);
    }
  }

  if (skills.length === 0) return null;

  return composeSkill(skills);
}

/**
 * 组合多个同名 skill
 * 使用最高优先级的身份和规范，合并所有来源的学习记录
 */
function composeSkill(skills: Skill[]): Skill {
  if (skills.length === 1) return skills[0];

  const primary = skills[0]; // 最高优先级

  // 收集所有学习记录
  const allLearnings: string[] = [];
  for (const skill of skills) {
    const learningMatch = skill.content.match(/## 学习记录\n([\s\S]*?)$/);
    if (learningMatch) {
      allLearnings.push(learningMatch[1].trim());
    }
  }

  // 组合内容：使用主 skill 的身份和规范 + 合并的学习记录
  const identityMatch = primary.content.match(/(## 身份\n[\s\S]*?)(?=## 开发规范)/);
  const guidelineMatch = primary.content.match(/(## 开发规范\n[\s\S]*?)(?=## 学习记录)/);

  const composed = [
    identityMatch ? identityMatch[1].trim() : '',
    guidelineMatch ? guidelineMatch[1].trim() : '',
    '## 学习记录',
    ...allLearnings,
  ].join('\n\n');

  return {
    ...primary,
    content: composed,
  };
}

/**
 * 更新 skill：追加学习记录或修改规范
 * 写入项目生成目录，不修改全局 skill
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
    // 检查是否是核心 skill
    const corePath = path.join(getCoreSkillsDir(), `${name}.md`);
    if (fs.existsSync(corePath)) {
      return {
        success: false,
        error: `Skill "${name}" 是核心 skill，不能直接修改。请创建自定义版本。`,
      };
    }

    // 确定写入路径：优先写入生成目录
    const generatedDir = getGeneratedSkillsDir();
    if (!fs.existsSync(generatedDir)) {
      fs.mkdirSync(generatedDir, { recursive: true });
    }

    // 查找现有 skill 文件
    let filePath = '';
    let raw = '';

    // 先检查生成目录
    const generatedPath = path.join(generatedDir, `${name}.md`);
    if (fs.existsSync(generatedPath)) {
      filePath = generatedPath;
      raw = fs.readFileSync(filePath, 'utf-8');
    } else {
      // 检查项目 skill 目录
      const projectPath = getSkillPath(name);
      if (fs.existsSync(projectPath)) {
        // 复制到生成目录后再修改
        raw = fs.readFileSync(projectPath, 'utf-8');
        filePath = generatedPath;
      } else {
        // 检查自定义 skill 目录
        const customPath = path.join(getCustomSkillsDir(), `${name}.md`);
        if (fs.existsSync(customPath)) {
          raw = fs.readFileSync(customPath, 'utf-8');
          filePath = generatedPath;
        } else {
          return { success: false, error: `Skill 不存在: ${name}` };
        }
      }
    }

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

/**
 * 初始化全局 skill 仓库
 * 创建目录结构并复制默认 core skill
 */
export function initGlobalSkills(options?: {
  sourceDir?: string;
}): { success: boolean; created: string[]; errors: string[] } {
  const created: string[] = [];
  const errors: string[] = [];

  try {
    const globalDir = getGlobalSkillsDir();
    const coreDir = getCoreSkillsDir();
    const customDir = getCustomSkillsDir();

    // 创建目录结构
    for (const dir of [globalDir, coreDir, customDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        created.push(dir);
      }
    }

    // 复制默认 core skill（从源目录或包内）
    // 使用 import.meta.url 获取当前文件路径，然后向上找到包根目录
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    // Windows 下 new URL().pathname 会返回 /C:/... 格式，需要处理
    const normalizedCurrentDir = currentDir.startsWith('/') ? currentDir.slice(1) : currentDir;
    const packageRoot = path.resolve(normalizedCurrentDir, '..');

    const sourceDir = options?.sourceDir || path.join(
      packageRoot,
      '.github',
      'prompts',
      'skills'
    );

    if (fs.existsSync(sourceDir)) {
      const skillFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));
      for (const f of skillFiles) {
        const destFile = path.join(coreDir, f);
        if (!fs.existsSync(destFile)) {
          fs.copyFileSync(path.join(sourceDir, f), destFile);
          created.push(destFile);
        }
      }
    }

    return { success: true, created, errors };
  } catch (e: any) {
    errors.push(e.message);
    return { success: false, created, errors };
  }
}

/**
 * 检查全局 skill 仓库是否已初始化
 */
export function isGlobalSkillsInitialized(): boolean {
  const coreDir = getCoreSkillsDir();
  return fs.existsSync(coreDir);
}

// ─── 内部工具 ────────────────────────────────────────────────────────

function parseSkillFile(raw: string, filePath: string): Skill | null {
  const { meta, body } = parseFrontmatter(raw);
  const name = meta.name || path.basename(filePath, '.md');

  return {
    meta: {
      name,
      icon: meta.icon || '🎯',
      description: meta.description || '',
      version: parseInt(meta.version) || 1,
      created: meta.created || '',
      updated: meta.updated || '',
    },
    content: body || raw.trim(),
    filePath,
  };
}

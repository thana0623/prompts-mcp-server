/**
 * prompts-generator.ts
 * 
 * 自动生成项目 prompts 体系。
 * 扫描目标项目结构，生成 context.md / recent-5.md / summary-10.md / todos.md / modules/ 等。
 * 同时生成开发规范 prompt（前后端、环境配置等），用户可外部补充。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { config, getPromptsDir } from './config.js';

// ─── 类型定义 ────────────────────────────────────────────────────────

export interface ProjectInfo {
  /** 项目根目录 */
  root: string;
  /** 项目名称 */
  name: string;
  /** 检测到的语言列表 */
  languages: string[];
  /** 检测到的框架列表 */
  frameworks: string[];
  /** 检测到的构建工具 */
  buildTools: string[];
  /** 是否有前端代码 */
  hasFrontend: boolean;
  /** 是否有后端代码 */
  hasBackend: boolean;
  /** 前端框架（检测到） */
  frontendFramework: string;
  /** 后端框架（检测到） */
  backendFramework: string;
  /** 数据库配置 */
  databases: string[];
  /** 包管理器 */
  packageManager: string;
  /** 主要目录结构 */
  topDirs: string[];
}

// ─── 项目扫描 ────────────────────────────────────────────────────────

/**
 * 扫描项目根目录，检测技术栈信息
 */
export function scanProject(projectRoot: string): ProjectInfo {
  const name = path.basename(projectRoot);
  const topDirs = getTopLevelDirs(projectRoot);
  const allFiles = getAllFiles(projectRoot);

  const languages = detectLanguages(allFiles);
  const frameworks = detectFrameworks(allFiles, topDirs);
  const buildTools = detectBuildTools(allFiles);
  const databases = detectDatabases(allFiles);

  const hasFrontend = detectHasFrontend(allFiles, topDirs);
  const hasBackend = detectHasBackend(allFiles, topDirs);
  const frontendFramework = detectFrontendFramework(allFiles, topDirs);
  const backendFramework = detectBackendFramework(allFiles, topDirs);
  const packageManager = detectPackageManager(allFiles);

  return {
    root: projectRoot,
    name,
    languages,
    frameworks,
    buildTools,
    hasFrontend,
    hasBackend,
    frontendFramework,
    backendFramework,
    databases,
    packageManager,
    topDirs,
  };
}

function getTopLevelDirs(root: string): string[] {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .map(d => d.name);
  } catch {
    return [];
  }
}

function getAllFiles(root: string): string[] {
  const result: string[] = [];
  try {
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          result.push(fullPath);
        }
      }
    };
    walk(root);
  } catch {
    // ignore permission errors
  }
  return result;
}

function detectLanguages(files: string[]): string[] {
  const langMap: Record<string, string> = {
    '.java': 'Java',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript (React)',
    '.vue': 'Vue',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript (React)',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.cs': 'C#',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.scala': 'Scala',
    '.c': 'C',
    '.cpp': 'C++',
    '.h': 'C/C++ Header',
  };
  const detected = new Set<string>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (langMap[ext]) detected.add(langMap[ext]);
  }
  return Array.from(detected);
}

function detectFrameworks(files: string[], dirs: string[]): string[] {
  const detected: string[] = [];
  const fileSet = new Set(files.map(f => path.basename(f).toLowerCase()));

  if (fileSet.has('pom.xml')) detected.push('Spring Boot (Maven)');
  if (fileSet.has('build.gradle') || fileSet.has('build.gradle.kts')) detected.push('Spring Boot (Gradle)');
  if (fileSet.has('package.json')) {
    // 尝试读取 package.json 检测前端框架
    try {
      const pkg = files.find(f => path.basename(f) === 'package.json');
      if (pkg) {
        const content = JSON.parse(fs.readFileSync(pkg, 'utf-8'));
        const deps = { ...(content.dependencies || {}), ...(content.devDependencies || {}) };
        const allDeps = Object.keys(deps).join(' ');
        if (/vue/i.test(allDeps)) detected.push('Vue');
        if (/react/i.test(allDeps)) detected.push('React');
        if (/angular/i.test(allDeps)) detected.push('Angular');
        if (/express/i.test(allDeps)) detected.push('Express');
        if (/next/i.test(allDeps)) detected.push('Next.js');
        if (/nuxt/i.test(allDeps)) detected.push('Nuxt.js');
        if (/spring|spring-boot/i.test(allDeps)) detected.push('Spring Boot');
      }
    } catch { /* ignore */ }
  }
  if (fileSet.has('requirements.txt') || fileSet.has('setup.py')) detected.push('Python (pip)');
  if (fileSet.has('go.mod')) detected.push('Go Modules');
  if (fileSet.has('Cargo.toml')) detected.push('Rust (Cargo)');
  if (dirs.includes('vendor')) detected.push('Laravel/PHP');

  return detected;
}

function detectBuildTools(files: string[]): string[] {
  const tools: string[] = [];
  const names = new Set(files.map(f => path.basename(f).toLowerCase()));
  if (names.has('pom.xml')) tools.push('Maven');
  if (names.has('build.gradle') || names.has('build.gradle.kts')) tools.push('Gradle');
  if (names.has('package.json')) tools.push('npm/yarn/pnpm');
  if (names.has('makefile') || names.has('makefile')) tools.push('Make');
  if (names.has('dockerfile') || names.has('docker-compose.yml')) tools.push('Docker');
  return tools;
}

function detectDatabases(files: string[]): string[] {
  const dbs: string[] = [];
  const allContent = files.map(f => {
    try {
      const ext = path.extname(f).toLowerCase();
      if (['.yml', '.yaml', '.properties', '.json', '.xml', '.env', '.env.example'].includes(ext)) {
        return fs.readFileSync(f, 'utf-8').toLowerCase();
      }
    } catch { /* ignore */ }
    return '';
  }).join('\n');

  if (/mysql/.test(allContent)) dbs.push('MySQL');
  if (/postgresql|postgres/.test(allContent)) dbs.push('PostgreSQL');
  if (/redis/.test(allContent)) dbs.push('Redis');
  if (/mongodb|mongo/.test(allContent)) dbs.push('MongoDB');
  if (/h2/.test(allContent)) dbs.push('H2');
  if (/sqlite/.test(allContent)) dbs.push('SQLite');
  if (/rabbitmq/.test(allContent)) dbs.push('RabbitMQ');
  if (/kafka/.test(allContent)) dbs.push('Kafka');

  return dbs;
}

function detectHasFrontend(files: string[], dirs: string[]): boolean {
  const frontDirs = ['src', 'frontend', 'front', 'web', 'ui', 'client', 'app'];
  const hasFrontDir = dirs.some(d => frontDirs.includes(d.toLowerCase()));
  const hasFrontFiles = files.some(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.vue', '.tsx', '.jsx', '.html', '.css', '.scss', '.less'].includes(ext);
  });
  return hasFrontDir || hasFrontFiles;
}

function detectHasBackend(files: string[], dirs: string[]): boolean {
  const backDirs = ['backend', 'back', 'server', 'api', 'service'];
  const hasBackDir = dirs.some(d => backDirs.includes(d.toLowerCase()));
  const hasBackFiles = files.some(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.java', '.py', '.go', '.rs', '.rb', '.php', '.cs', '.kt'].includes(ext);
  });
  return hasBackDir || hasBackFiles;
}

function detectFrontendFramework(files: string[], _dirs: string[]): string {
  const names = new Set(files.map(f => path.basename(f).toLowerCase()));
  if (names.has('vite.config.ts') || names.has('vite.config.js')) return 'Vite';
  if (names.has('vue.config.js')) return 'Vue CLI';
  if (names.has('next.config.js') || names.has('next.config.mjs')) return 'Next.js';
  if (names.has('nuxt.config.ts') || names.has('nuxt.config.js')) return 'Nuxt.js';
  if (names.has('angular.json')) return 'Angular CLI';
  if (names.has('webpack.config.js')) return 'Webpack';
  return 'Unknown';
}

function detectBackendFramework(files: string[], _dirs: string[]): string {
  const names = new Set(files.map(f => path.basename(f).toLowerCase()));
  if (names.has('pom.xml')) return 'Spring Boot (Maven)';
  if (names.has('build.gradle') || names.has('build.gradle.kts')) return 'Spring Boot (Gradle)';
  if (names.has('requirements.txt')) return 'Python';
  if (names.has('go.mod')) return 'Go';
  if (names.has('Cargo.toml')) return 'Rust';
  return 'Unknown';
}

function detectPackageManager(files: string[]): string {
  const names = new Set(files.map(f => path.basename(f).toLowerCase()));
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  if (names.has('package-lock.json')) return 'npm';
  if (names.has('pom.xml')) return 'Maven';
  if (names.has('build.gradle')) return 'Gradle';
  return 'Unknown';
}

// ─── 模板生成 ────────────────────────────────────────────────────────

/**
 * 生成 context.md
 */
export function generateContextMd(info: ProjectInfo): string {
  return `# 项目上下文总览（Context）

> 用途：统一沉淀项目当前技术栈、历史决策、待办事项，以及每日记录索引。
> 自动生成时间: ${new Date().toISOString().slice(0, 10)}

## 1. 当前技术栈

### 检测到的语言
${info.languages.map(l => `- ${l}`).join('\n') || '- (未检测到)'}

### 检测到的框架
${info.frameworks.map(f => `- ${f}`).join('\n') || '- (未检测到)'}

### 构建工具
${info.buildTools.map(t => `- ${t}`).join('\n') || '- (未检测到)'}

### 数据库/中间件
${info.databases.map(d => `- ${d}`).join('\n') || '- (未检测到)'}

### 包管理器
- ${info.packageManager}

### 项目结构
\`\`\`
${info.name}/
${info.topDirs.map(d => `├── ${d}/`).join('\n')}
\`\`\`

## 2. 开发规范

> 以下为通用规范，可根据项目实际情况补充修改。

### 通用原则
1. 所有代码变更必须同步更新对应文档。
2. 每次对话完成后必须执行日志记录。
3. 需求不明确时禁止猜测，必须先澄清。

### 前端规范
${info.hasFrontend ? `
- 框架: ${info.frontendFramework}
- 组件化开发，保持风格一致
- API 调用统一封装
- 状态管理集中管理
` : '- (未检测到前端代码)'}

### 后端规范
${info.hasBackend ? `
- 框架: ${info.backendFramework}
- 分层架构（Controller / Service / Repository / Model）
- 统一异常处理
- 统一响应格式
` : '- (未检测到后端代码)'}

### 环境配置
- 公共配置可提交
- 本地配置不提交（使用 .example 模板）
- 敏感信息通过环境变量注入

## 3. 待办事项

- [ ] 补充项目具体开发规范
- [ ] 配置 CI/CD 流程
- [ ] 补充测试用例

## 4. 对话日志索引

- 最近 5 条动态窗口: ${config.promptsSubDir}/recent-5.md
- 近 10 条 Stateful 摘要: ${config.promptsSubDir}/summary-10.md
- 模块记录: ${config.promptsSubDir}/modules/
- 待办事项: ${config.promptsSubDir}/todos.md
`;
}

/**
 * 生成 recent-5.md 初始模板
 */
export function generateRecent5Md(): string {
  return `# 最近 5 条对话与操作（动态窗口）

> 规则：每次新增 1 条，超过 5 条时删除最旧 1 条，仅保留最近 5 条。
> 单条定义：一次对话 + 对应操作（代码/配置/文档/命令）= 1 条。

*暂无记录*
`;
}

/**
 * 生成 summary-10.md 初始模板
 */
export function generateSummary10Md(): string {
  return `# 近 10 条对话状态摘要（Stateful）

> 用途：每累计 10 条对话与操作后，输出一段有状态摘要，沉淀可延续上下文。

## 窗口元数据
- window_id: W-0001
- 统计范围: Entry-001 ~ Entry-010
- 当前已收录: 0 / 10
- 数据来源:
  - ${config.promptsSubDir}/recent-5.md

## Stateful 摘要
### Current State
- 项目初始化完成，尚无对话记录。

### Decisions Kept
- (暂无)

### Invalidated Decisions
- (暂无)

### Open TODO
- (暂无)

### Carry Forward
- (暂无)
`;
}

/**
 * 生成 log-state.json 初始状态
 */
export function generateLogStateJson(): string {
  return JSON.stringify({
    nextEntryId: 1,
    windowId: 'W-0001',
    windowStartEntry: 1,
    windowCount: 0,
    windowEntries: [],
  }, null, 2);
}

/**
 * 生成 todos.md 初始模板
 */
export function generateTodosMd(): string {
  return `# 待办事项

> 自动维护的 TODO 列表，每次对话完成后更新。

## 进行中

- [ ] 补充项目具体开发规范
- [ ] 配置 CI/CD 流程
- [ ] 补充测试用例

## 已完成

*(暂无)*
`;
}

/**
 * 生成模块记录模板
 */
export function generateModuleLogMd(moduleName: string): string {
  return `# 模块记录: ${moduleName}

> 按模块记录每一项修改，修改前先读取此文件了解历史。

## 修改历史

| 日期 | 变更内容 | 涉及文件 | 决策 |
|------|---------|---------|------|
| - | - | - | - |

## 当前状态

- 待补充

## 待办

- [ ] 补充模块说明
`;
}

/**
 * 生成 rules/README.md
 */
export function generateRulesReadme(): string {
  return `# 项目自定义规则

> 此目录存放用户自定义的项目规范规则。
> 每条规则为独立 .md 文件，会在 bootstrap 时自动加载。

## 使用方式

### 通过 MCP 工具添加
使用 \`add_rule\` 工具添加规则：
- \`name\`: 规则名称（即文件名，不含 .md）
- \`content\`: 规则内容
- \`category\`: 分类（可选，如 frontend / backend / general）

### 手动创建
在此目录下创建 .md 文件，格式如下：

\`\`\`markdown
---
name: my-rule
category: general
created: 2026-05-07
---

规则内容...
\`\`\`

## 规则示例

- \`commit-style.md\` — 提交信息格式规范
- \`naming-convention.md\` — 命名规范
- \`api-design.md\` — API 设计规范
- \`testing.md\` — 测试规范
`;
}

/**
 * 生成开发规范 prompt（根据项目检测结果）
 */
export function generateDevRulesPrompt(info: ProjectInfo): string {
  const sections: string[] = [];

  sections.push(`# 项目开发规范

> 自动生成于 ${new Date().toISOString().slice(0, 10)}
> 项目: ${info.name}
> 可根据实际情况补充修改。

## 通用规范

1. **需求澄清优先**：需求不明确时禁止猜测，必须先追问澄清。
2. **先计划后执行**：需求明确后，先生成可行计划，等待用户确认后再编码。
3. **文档同步**：所有代码变更必须同步更新对应文档和模块记录。
4. **日志记录**：每次对话完成后必须记录日志（daily + recent-5 + summary-10）。
5. **模块记录**：修改模块时，先读取模块记录，修改后更新模块记录。
`);

  if (info.hasFrontend) {
    sections.push(`
## 前端规范

- 框架: ${info.frontendFramework}
- 语言: ${info.languages.filter(l => l.includes('TypeScript') || l.includes('JavaScript') || l.includes('Vue')).join(', ') || 'TypeScript/JavaScript'}
- 包管理器: ${info.packageManager}
- 组件化开发，保持 UI 风格一致
- API 调用统一封装（如 Axios）
- 状态管理集中管理（如 Pinia / Redux）
- 路由统一管理（如 Vue Router / React Router）
`);
  }

  if (info.hasBackend) {
    sections.push(`
## 后端规范

- 框架: ${info.backendFramework}
- 语言: ${info.languages.filter(l => !l.includes('TypeScript') && !l.includes('JavaScript') && !l.includes('Vue')).join(', ') || 'Java/Python/Go'}
- 构建工具: ${info.buildTools.join(', ')}
- 分层架构（Controller / Service / Repository / Model）
- 统一异常处理
- 统一响应格式
- API 文档同步维护
`);
  }

  if (info.databases.length > 0) {
    sections.push(`
## 数据存储

${info.databases.map(d => `- ${d}`).join('\n')}
- 数据库迁移脚本管理
- 敏感信息不提交到版本控制
`);
  }

  sections.push(`
## 环境配置

- 公共配置可提交到版本控制
- 本地配置使用 \`.local\` 后缀，不提交
- 提供 \`.example\` 模板文件
- 敏感信息通过环境变量注入

## 代码质量

- 遵循语言/框架的最佳实践
- 关键逻辑编写单元测试
- 保持代码整洁，及时清理废弃代码
- 提交前检查是否有调试代码遗留
`);

  return sections.join('\n');
}

// ─── 初始化执行 ──────────────────────────────────────────────────────

export interface InitResult {
  success: boolean;
  promptsDir: string;
  filesCreated: string[];
  projectInfo: ProjectInfo;
  errors: string[];
}

/**
 * 在目标项目中初始化 prompts 体系
 */
export function initPrompts(projectRoot: string): InitResult {
  const errors: string[] = [];
  const filesCreated: string[] = [];

  // 扫描项目
  const info = scanProject(projectRoot);

  // 创建 prompts 目录
  const promptsDir = getPromptsDir();
  const dirsToCreate = [
    promptsDir,
    path.join(promptsDir, 'daily'),
    path.join(promptsDir, 'modules'),
    path.join(promptsDir, 'rules'),
  ];

  for (const dir of dirsToCreate) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e: any) {
      errors.push(`创建目录失败: ${dir} - ${e.message}`);
    }
  }

  // 生成文件
  const files: { name: string; content: string }[] = [
    { name: 'context.md', content: generateContextMd(info) },
    { name: 'recent-5.md', content: generateRecent5Md() },
    { name: 'summary-10.md', content: generateSummary10Md() },
    { name: 'log-state.json', content: generateLogStateJson() },
    { name: 'todos.md', content: generateTodosMd() },
    { name: 'dev-rules.md', content: generateDevRulesPrompt(info) },
    { name: 'rules/README.md', content: generateRulesReadme() },
  ];

  for (const file of files) {
    const filePath = path.join(promptsDir, file.name);
    try {
      // 不覆盖已存在的文件
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, file.content, 'utf-8');
        filesCreated.push(file.name);
      } else {
        filesCreated.push(`${file.name} (已存在，跳过覆盖)`);
      }
    } catch (e: any) {
      errors.push(`写入文件失败: ${file.name} - ${e.message}`);
    }
  }

  return {
    success: errors.length === 0,
    promptsDir,
    filesCreated,
    projectInfo: info,
    errors,
  };
}

/**
 * prompts-generator.ts
 * 
 * 自动生成项目 prompts 体系。
 * 扫描目标项目结构，生成 context.md / workflow-log.md / recent-5.md / summary-10.md / todos.md / modules/ 等。
 * 同时生成开发规范 prompt（前后端、环境配置等），用户可外部补充。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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

function detectFrontendFramework(files: string[], dirs: string[]): string {
  const names = new Set(files.map(f => path.basename(f).toLowerCase()));
  if (names.has('vite.config.ts') || names.has('vite.config.js')) return 'Vite';
  if (names.has('vue.config.js')) return 'Vue CLI';
  if (names.has('next.config.js') || names.has('next.config.mjs')) return 'Next.js';
  if (names.has('nuxt.config.ts') || names.has('nuxt.config.js')) return 'Nuxt.js';
  if (names.has('angular.json')) return 'Angular CLI';
  if (names.has('webpack.config.js')) return 'Webpack';
  return 'Unknown';
}

function detectBackendFramework(files: string[], dirs: string[]): string {
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

- 最近 5 条动态窗口: .github/prompts/recent-5.md
- 近 10 条 Stateful 摘要: .github/prompts/summary-10.md
- 工作流规范: .github/prompts/workflow-log.md
- 模块记录: .github/prompts/modules/
- 待办事项: .github/prompts/todos.md
`;
}

/**
 * 生成 workflow-log.md
 */
export function generateWorkflowLogMd(): string {
  return `# 递进式 AI 对话日志工作流

## 目标
- 保留最近 5 条对话与操作（动态窗口）。
- 每累计近 10 条，产出一次 Stateful Markdown 摘要。
- 每条对话统一执行：清洗 -> 提取 -> 归档/压缩。

## 文件职责
- \`.github/prompts/daily/YYYY-MM-DD.md\`
  - 保存当日全量原始记录（可读、可追溯）。
- \`.github/prompts/recent-5.md\`
  - 保存最近 5 条清洗后的结构化记录。
- \`.github/prompts/summary-10.md\`
  - 保存 10 条窗口的有状态摘要与窗口元信息。
- \`.github/prompts/context.md\`
  - 仅保留索引、全局技术栈、关键决策与待办。
- \`.github/prompts/modules/<module-name>.md\`
  - 按模块记录每一项修改（目录式）。
- \`.github/prompts/todos.md\`
  - 待办事项列表。

## 执行纪律

1. 每次处理新请求，先读取 \`.github/prompts/context.md\`，确认当前全局状态。
2. 再加载 \`.github/prompts/daily/YYYY-MM-DD.md\`（当日）和 \`.github/prompts/recent-5.md\`（最新 5 条），了解最新的对话和决策。
3. 按任务类型加载最相关的 prompt 文件，避免只看局部上下文就直接动手。
4. 如果需求表达模糊、缺少边界、缺少验收条件，**立刻停止**，先追问；一轮不够就继续追问。
5. 在需求明确前，**禁止**直接设计实现方案，**禁止**写代码，**禁止**做假设。
6. 只有在明确"要做什么、为什么做、做到什么程度"之后，才能进入设计与编码。
7. 修改功能前，先读取对应模块的模块记录（\`.github/prompts/modules/<module>.md\`）。

## 需求澄清的硬约束

**这是最重要的纪律，直接关乎项目质量。**

### 明确标准（5 项都要 ✓）

- [ ] **目标明确**：能用一句话说清"这个需求要解决什么问题"
- [ ] **输入输出明确**："从哪来"和"到哪去"都要清楚
- [ ] **约束明确**：有没有"不能改的地方"
- [ ] **验收标准明确**："什么时候算完成"要有具体标准
- [ ] **影响范围明确**：要改哪些文件/模块、要更新哪些 docs

### 停止标准（任何一项不符合就停止）

\`\`\`
❌ 用户提问模糊 → STOP，不要猜，立刻问
❌ 需求有歧义 → STOP，不要假设，立刻澄清
❌ 验收标准不清 → STOP，不要编，立刻确认
❌ 一轮追问不够 → CONTINUE，继续追问到明确
❌ 仍然模糊 → STOP，向用户说明无法继续，要求补充
\`\`\`

### 追问策略

- 使用固定问题清单（见下文）
- 一轮不够就继续
- 每一轮都要确认"这一项是否明确了"
- 直到所有 5 项都达到"明确"

## 固定追问清单

当需求不清晰时，优先按以下顺序追问：

1. 你要解决的具体问题是什么？
2. 期望输出是什么，成功标准是什么？
3. 这次变更影响哪些文件、模块或页面？
4. 是否有不能改动的约束、技术选型或业务边界？
5. 是否需要补充设计稿、接口契约、数据结构或测试要求？

如果用户回答仍然模糊，继续围绕缺失项追问，不要自己补全。

## 单条处理流程（每次对话）

### Step 1：清洗
- 删除语气词、寒暄、开场白。
- 仅保留需求事实、约束、验收条件。

### Step 2：提取
- 代码变更: 涉及文件与核心改动点。
- 技术决策: 新增/变更/废弃的决策。
- 待办事项: 未完成且可执行的下一步。

### Step 3：入库
- 先追加到 daily 当日文件。
- 再写入 recent-5 作为最新一条 Entry。
- 若 recent-5 超过 5 条，删除最旧一条，保持 5 条。
- **立刻对新 Entry 更新 summary-10 的 Current State 和 Open TODO**（不用等到 10 条）

### Step 4：压缩与整理
- 当累计达到 10 条时：
  - 生成 summary-10 的完整 Stateful 摘要（Current State / Decisions Kept / Invalidated Decisions / Open TODO / Carry Forward）。
  - 重置下一窗口计数（例如 W-0002）。
- 每次更新时都检查格式一致性，避免重复或遗漏。

### Step 5：模块记录
- 如果本次修改涉及特定模块，同步更新 \`.github/prompts/modules/<module>.md\`
- 记录内容：修改时间、变更内容、涉及文件、决策

### Step 6：实时供给智能体
- 智能体每次启动时，必须在第 1.5 步加载最新的 daily、recent-5、summary-10
- 这样智能体能"知道"最新 5 条对话是什么，不会重复或遗忘决策

## 结构化记录模板（recent-5）
- 日期:
- 清洗后需求:
- 代码变更:
- 技术决策:
- 待办:

## 清洗规则（简版）
- 移除: "很高兴为你服务""我来帮你""好的收到"等寒暄语。
- 合并重复指令，保留最强约束版本。
- 句子改写为动作导向：动词 + 对象 + 约束。

## 质量检查
- 每条必须有 代码变更 / 技术决策 / 待办 三字段。
- context 不写长过程，只写结论与索引。
- 10 条摘要必须包含"可延续状态"（Carry Forward）。
- 需求澄清未完成时，不要写入伪设计或猜测性结论。
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
  - .github/prompts/recent-5.md

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

  // 创建 .github/prompts 目录
  const promptsDir = path.join(projectRoot, '.github', 'prompts');
  const dirsToCreate = [
    promptsDir,
    path.join(promptsDir, 'daily'),
    path.join(promptsDir, 'modules'),
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
    { name: 'workflow-log.md', content: generateWorkflowLogMd() },
    { name: 'recent-5.md', content: generateRecent5Md() },
    { name: 'summary-10.md', content: generateSummary10Md() },
    { name: 'log-state.json', content: generateLogStateJson() },
    { name: 'todos.md', content: generateTodosMd() },
    { name: 'dev-rules.md', content: generateDevRulesPrompt(info) },
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

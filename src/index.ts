#!/usr/bin/env node

/**
 * pmcp-server - 通用 MCP Server
 *
 * 提供以下工具：
 *   - auto_start         - 会话自动启动，加载全部上下文 + 规则 + Skills
 *   - init_prompts       - 扫描项目，自动生成原始 prompts 体系
 *   - bootstrap          - 一键启动，自动读取传递链 + 模块记录
 *   - check_requirements - 需求澄清检查（5 项标准）
 *   - make_plan          - 生成可行计划，等待用户确认
 *   - log_dialog         - 记录对话日志（传递链 + 自动 git commit）
 *   - log_module         - 记录模块修改（目录式）
 *   - read_module        - 修改前读取模块记录
 *   - update_todos       - 更新待办事项
 *   - add_rule           - 添加项目规范规则
 *   - list_rules         - 列出所有自定义规则
 *   - remove_rule        - 删除一条规则
 *   - commit_dialog      - 手动触发 git commit
 *   - list_skills        - 列出所有可用角色技能
 *   - select_skill       - 选择一个 Skill 作为当前身份
 *   - update_skill       - 自我优化：追加学习记录、更新规范
 *   - add_skill          - 创建新的角色技能
 *
 * 通过环境变量 PROJECT_ROOT 指定目标项目路径。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  bootstrap,
  formatBootstrap,
} from './prompts-loader.js';
import { config, getProjectRoot, getPromptsDir } from './config.js';
import {
  initPrompts,
} from './prompts-generator.js';
import {
  readModuleLog,
  appendModuleLog,
} from './module-logger.js';
import {
  checkRequirements,
  formatCheckResult,
  generatePlan,
  formatPlan,
} from './requirements-check.js';
import {
  addRule,
  removeRule,
  listRules,
} from './rules-manager.js';
import {
  listSkills,
  selectSkill,
  updateSkill,
  addSkill,
  formatSkillList,
} from './skills-manager.js';
import {
  gitAutoCommit,
  gitStatus,
  isGitRepo,
} from './git-utils.js';
import { logDialog } from './dialog-logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

class PromptsMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: config.serverName,
        version: config.serverVersion,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  // ─── Tool Handlers ──────────────────────────────────────────────

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'init_prompts',
          description: '【初始化】扫描目标项目，自动生成原始 prompts 体系（context.md / workflow-log.md / recent-5.md / summary-10.md / todos.md / dev-rules.md / modules/）。已有文件不会覆盖。',
          inputSchema: {
            type: 'object',
            properties: {
              projectRoot: {
                type: 'string',
                description: '目标项目根目录路径。不传则使用 PROJECT_ROOT 环境变量或当前目录。',
              },
            },
          },
        },
        {
          name: 'bootstrap',
          description: '【一键启动】自动读取传递链（context.md + daily + recent-5 + summary-10 + todos + 模块记录）。智能体启动时第一步调用。',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'check_requirements',
          description: '【需求澄清】执行 5 项需求明确标准检查。不明确时生成追问问题，禁止猜测执行。',
          inputSchema: {
            type: 'object',
            properties: {
              taskDescription: {
                type: 'string',
                description: '用户提出的任务需求描述',
              },
            },
            required: ['taskDescription'],
          },
        },
        {
          name: 'make_plan',
          description: '【生成计划】在需求已澄清（check_requirements 全部 ✅）后，生成可行执行计划，等待用户确认。',
          inputSchema: {
            type: 'object',
            properties: {
              taskDescription: {
                type: 'string',
                description: '已澄清的任务需求描述',
              },
            },
            required: ['taskDescription'],
          },
        },
        {
          name: 'log_dialog',
          description: '【记录日志】记录一次对话到传递链（daily + recent-5 + summary-10 + log-state.json）。',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: '对话简明标题',
              },
              request: {
                type: 'string',
                description: '清洗后的用户需求',
              },
              changes: {
                type: 'array',
                items: { type: 'string' },
                description: '代码变更文件列表',
              },
              decisions: {
                type: 'array',
                items: { type: 'string' },
                description: '本次技术决策',
              },
              todos: {
                type: 'array',
                items: { type: 'string' },
                description: '遗留待办项',
              },
            },
            required: ['title', 'request'],
          },
        },
        {
          name: 'log_module',
          description: '【模块记录】按模块记录一次修改（目录式）。修改功能前先 read_module，修改后调用此工具。',
          inputSchema: {
            type: 'object',
            properties: {
              moduleName: {
                type: 'string',
                description: '模块名称（如 auth、rag-upload、frontend）',
              },
              change: {
                type: 'string',
                description: '变更内容描述',
              },
              files: {
                type: 'array',
                items: { type: 'string' },
                description: '涉及的文件列表',
              },
              decisions: {
                type: 'array',
                items: { type: 'string' },
                description: '本次决策',
              },
            },
            required: ['moduleName', 'change'],
          },
        },
        {
          name: 'read_module',
          description: '【读取模块记录】修改功能前调用，读取对应模块的历史修改记录。',
          inputSchema: {
            type: 'object',
            properties: {
              moduleName: {
                type: 'string',
                description: '模块名称',
              },
            },
            required: ['moduleName'],
          },
        },
        {
          name: 'update_todos',
          description: '【更新待办】更新 todos.md 中的待办事项。',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: '操作类型: add（添加）/ complete（完成）/ remove（删除）',
                enum: ['add', 'complete', 'remove'],
              },
              todo: {
                type: 'string',
                description: '待办事项内容',
              },
            },
            required: ['action', 'todo'],
          },
        },
        {
          name: 'auto_start',
          description: '【自动启动】会话开始时第一个调用。一键加载全部上下文（context + daily + recent-5 + summary-10 + todos + dev-rules + 用户规则 + 模块记录）。每次新对话开始时必须调用此工具。',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'add_rule',
          description: '【添加规则】添加一条项目规范规则。规则会持久化存储，在每次会话启动时自动加载。',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '规则名称（如 commit-style、naming-convention）',
              },
              content: {
                type: 'string',
                description: '规则内容',
              },
              category: {
                type: 'string',
                description: '分类（如 frontend / backend / general / testing）',
              },
            },
            required: ['name', 'content'],
          },
        },
        {
          name: 'list_rules',
          description: '【列出规则】列出所有已添加的项目规范规则。',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'remove_rule',
          description: '【删除规则】删除一条项目规范规则。',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '要删除的规则名称',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'commit_dialog',
          description: '【手动提交】手动触发一次 git commit。可指定要提交的文件，不指定则提交所有变更。',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: '提交信息',
              },
              files: {
                type: 'array',
                items: { type: 'string' },
                description: '要提交的文件列表（不指定则提交所有变更）',
              },
            },
            required: ['message'],
          },
        },
        {
          name: 'list_skills',
          description: '【技能列表】列出所有可用的角色技能（Skill）。会话启动时自动展示，也可手动调用。',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'select_skill',
          description: '【选择技能】选择一个 Skill 作为当前身份角色。返回该 Skill 的完整 prompt（身份 + 开发规范 + 学习记录）。会话开始时应询问用户选择哪个 Skill。',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Skill 名称（如 architect、backend、frontend、review）',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'update_skill',
          description: '【技能自优化】会话结束时调用，总结本次开发经验并更新 Skill。可追加学习记录、修改开发规范、更新描述。智能体应主动在每次开发后调用此工具自我进化。',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '要更新的 Skill 名称',
              },
              learnings: {
                type: 'string',
                description: '本次会话学到的经验教训（会追加到学习记录）',
              },
              guidelineChanges: {
                type: 'string',
                description: '开发规范的修改（会替换现有规范内容）',
              },
              description: {
                type: 'string',
                description: '更新 Skill 描述',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'add_skill',
          description: '【创建技能】创建一个新的角色技能。可自定义身份、开发规范等。',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Skill 名称（如 devops、data-engineer）',
              },
              icon: {
                type: 'string',
                description: '图标 emoji（默认 🎯）',
              },
              description: {
                type: 'string',
                description: 'Skill 一句话描述',
              },
              identity: {
                type: 'string',
                description: '身份描述：这个角色是谁，职责是什么',
              },
              guidelines: {
                type: 'string',
                description: '开发规范：这个角色应遵循的规则和最佳实践',
              },
            },
            required: ['name', 'description', 'identity', 'guidelines'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: { params: { name: string; arguments?: any } }) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'init_prompts':
          return this.handleInitPrompts(args);
        case 'bootstrap':
          return this.handleBootstrap();
        case 'check_requirements':
          return this.handleCheckRequirements(args);
        case 'make_plan':
          return this.handleMakePlan(args);
        case 'log_dialog':
          return this.handleLogDialog(args);
        case 'log_module':
          return this.handleLogModule(args);
        case 'read_module':
          return this.handleReadModule(args);
        case 'update_todos':
          return this.handleUpdateTodos(args);
        case 'auto_start':
          return this.handleAutoStart();
        case 'add_rule':
          return this.handleAddRule(args);
        case 'list_rules':
          return this.handleListRules();
        case 'remove_rule':
          return this.handleRemoveRule(args);
        case 'commit_dialog':
          return this.handleCommitDialog(args);
        case 'list_skills':
          return this.handleListSkills();
        case 'select_skill':
          return this.handleSelectSkill(args);
        case 'update_skill':
          return this.handleUpdateSkill(args);
        case 'add_skill':
          return this.handleAddSkill(args);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    });
  }

  // ─── Tool Implementations ───────────────────────────────────────

  /**
   * init_prompts: 初始化 prompts 体系
   */
  private async handleInitPrompts(args: any) {
    const projectRoot = typeof args?.projectRoot === 'string'
      ? args.projectRoot
      : getProjectRoot();

    const result = initPrompts(projectRoot);

    const lines: string[] = [];
    lines.push('# 🚀 Prompts 体系初始化完成');
    lines.push('');
    lines.push(`**项目**: ${result.projectInfo.name}`);
    lines.push(`**路径**: ${result.promptsDir}`);
    lines.push('');

    lines.push('## ✅ 已创建文件');
    lines.push('');
    for (const f of result.filesCreated) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');

    lines.push('## 📋 检测到的项目信息');
    lines.push('');
    lines.push(`- 语言: ${result.projectInfo.languages.join(', ') || '未检测到'}`);
    lines.push(`- 框架: ${result.projectInfo.frameworks.join(', ') || '未检测到'}`);
    lines.push(`- 构建工具: ${result.projectInfo.buildTools.join(', ') || '未检测到'}`);
    lines.push(`- 数据库: ${result.projectInfo.databases.join(', ') || '未检测到'}`);
    lines.push(`- 前端: ${result.projectInfo.hasFrontend ? result.projectInfo.frontendFramework : '无'}`);
    lines.push(`- 后端: ${result.projectInfo.hasBackend ? result.projectInfo.backendFramework : '无'}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('## ⚠️ 错误');
      lines.push('');
      for (const e of result.errors) {
        lines.push(`- ❌ ${e}`);
      }
      lines.push('');
    }

    lines.push('## 📖 下一步');
    lines.push('');
    lines.push('1. 检查生成的 prompts 文件，根据项目实际情况补充修改');
    lines.push('2. 运行 `bootstrap` 验证加载正常');
    lines.push('3. 开始开发时，先运行 `check_requirements` 澄清需求');

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }

  /**
   * bootstrap: 一键启动
   */
  private async handleBootstrap() {
    const result = bootstrap();
    const formatted = formatBootstrap(result);

    return {
      content: [{ type: 'text', text: formatted }],
    };
  }

  /**
   * check_requirements: 需求澄清检查
   */
  private async handleCheckRequirements(args: any) {
    const taskDescription = typeof args?.taskDescription === 'string' ? args.taskDescription : '';
    const result = checkRequirements(taskDescription);
    const formatted = formatCheckResult(result);

    return {
      content: [{ type: 'text', text: formatted }],
    };
  }

  /**
   * make_plan: 生成可行计划
   */
  private async handleMakePlan(args: any) {
    const taskDescription = typeof args?.taskDescription === 'string' ? args.taskDescription : '';

    if (!taskDescription) {
      return {
        content: [{ type: 'text', text: '❌ 请提供任务需求描述。' }],
        isError: true,
      };
    }

    // 先检查需求是否明确
    const checkResult = checkRequirements(taskDescription);
    if (!checkResult.allClear) {
      return {
        content: [{
          type: 'text',
          text: `❌ **需求尚未完全明确，无法生成计划。**\n\n以下项目不明确: ${checkResult.unclearItems.join('、')}\n\n请先使用 \`check_requirements\` 工具追问澄清，待所有 5 项标准都 ✅ 后再生成计划。`,
        }],
        isError: true,
      };
    }

    const plan = generatePlan(taskDescription, checkResult);
    const formatted = formatPlan(plan);

    return {
      content: [{ type: 'text', text: formatted }],
    };
  }

  /**
   * log_dialog: 记录对话日志
   */
  private async handleLogDialog(args: any) {
    const title = typeof args?.title === 'string' ? args.title : '';
    const request = typeof args?.request === 'string' ? args.request : '';
    const changes: string[] = Array.isArray(args?.changes) ? args.changes : [];
    const decisions: string[] = Array.isArray(args?.decisions) ? args.decisions : [];
    const todos: string[] = Array.isArray(args?.todos) ? args.todos : [];

    if (!title || !request) {
      return {
        content: [{ type: 'text', text: '❌ "title" 和 "request" 是必填参数。' }],
        isError: true,
      };
    }

    try {
      const promptsDir = getPromptsDir();
      const { entryId, today } = logDialog(promptsDir, { title, request, changes, decisions, todos });

      let commitInfo = '';
      if (config.autoCommit && isGitRepo()) {
        const commitMsg = `dialog: Entry-${String(entryId).padStart(3, '0')} — ${title}`;
        const commitResult = gitAutoCommit(commitMsg);
        if (commitResult.success) {
          commitInfo = `\n- git commit: ✅ ${commitResult.hash}`;
        } else {
          commitInfo = `\n- git commit: ⚠️ ${commitResult.error}`;
        }
      }

      return {
        content: [{
          type: 'text',
          text: `✅ 对话日志已记录。\n\n- Entry-${String(entryId).padStart(3, '0')}\n- 日期: ${today}\n- 标题: ${title}\n- daily: 已追加\n- recent-5: 已更新\n- summary-10: 已更新${commitInfo}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ 记录日志失败: ${error.message || error}` }],
        isError: true,
      };
    }
  }

  /**
   * log_module: 记录模块修改
   */
  private async handleLogModule(args: any) {
    const moduleName = typeof args?.moduleName === 'string' ? args.moduleName : '';
    const change = typeof args?.change === 'string' ? args.change : '';
    const files: string[] = Array.isArray(args?.files) ? args.files : [];
    const decisions: string[] = Array.isArray(args?.decisions) ? args.decisions : [];

    if (!moduleName || !change) {
      return {
        content: [{ type: 'text', text: '❌ "moduleName" 和 "change" 是必填参数。' }],
        isError: true,
      };
    }

    const projectRoot = getProjectRoot();
    const today = new Date().toISOString().slice(0, 10);

    const result = appendModuleLog(projectRoot, moduleName, {
      date: today,
      change,
      files,
      decisions,
    });

    if (result.success) {
      return {
        content: [{ type: 'text', text: `✅ 模块记录已更新: ${moduleName}\n\n变更: ${change}\n日期: ${today}` }],
      };
    } else {
      return {
        content: [{ type: 'text', text: `❌ 更新模块记录失败: ${result.error}` }],
        isError: true,
      };
    }
  }

  /**
   * read_module: 读取模块记录
   */
  private async handleReadModule(args: any) {
    const moduleName = typeof args?.moduleName === 'string' ? args.moduleName : '';

    if (!moduleName) {
      return {
        content: [{ type: 'text', text: '❌ "moduleName" 是必填参数。' }],
        isError: true,
      };
    }

    const projectRoot = getProjectRoot();
    const content = readModuleLog(projectRoot, moduleName);

    return {
      content: [{ type: 'text', text: `# 模块记录: ${moduleName}\n\n${content}` }],
    };
  }

  /**
   * update_todos: 更新待办事项
   */
  private async handleUpdateTodos(args: any) {
    const action = typeof args?.action === 'string' ? args.action : '';
    const todo = typeof args?.todo === 'string' ? args.todo : '';

    if (!action || !todo) {
      return {
        content: [{ type: 'text', text: '❌ "action" 和 "todo" 是必填参数。' }],
        isError: true,
      };
    }

    try {
      const promptsDir = getPromptsDir();
      const todosPath = path.join(promptsDir, 'todos.md');

      let content = '';
      if (fs.existsSync(todosPath)) {
        content = fs.readFileSync(todosPath, 'utf-8');
      } else {
        content = `# 待办事项\n\n## 进行中\n\n*(暂无)*\n\n## 已完成\n\n*(暂无)*\n`;
      }

      switch (action) {
        case 'add': {
          // 在"进行中"区域添加
          const inProgressMarker = '## 进行中';
          const idx = content.indexOf(inProgressMarker);
          if (idx !== -1) {
            const afterMarker = content.indexOf('\n', idx) + 1;
            content = content.slice(0, afterMarker) + `\n- [ ] ${todo}` + content.slice(afterMarker);
          }
          break;
        }
        case 'complete': {
          // 将 - [ ] 改为 - [x] 并移到已完成
          content = content.replace(`- [ ] ${todo}`, `- [x] ${todo}`);
          break;
        }
        case 'remove': {
          content = content.replace(`- [ ] ${todo}\n`, '');
          content = content.replace(`- [x] ${todo}\n`, '');
          break;
        }
      }

      fs.writeFileSync(todosPath, content, 'utf-8');

      return {
        content: [{ type: 'text', text: `✅ 待办事项已更新: ${action} "${todo}"` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ 更新待办失败: ${error.message || error}` }],
        isError: true,
      };
    }
  }

  // ─── 新增工具实现 ───────────────────────────────────────────────

  /**
   * auto_start: 会话自动启动
   */
  private async handleAutoStart() {
    const result = bootstrap();
    const formatted = formatBootstrap(result);

    const lines: string[] = [];
    lines.push('# 🚀 会话已自动启动');
    lines.push('');
    lines.push('> 以下为当前项目的完整上下文，请基于此开始工作。');
    lines.push('');
    lines.push(formatted);

    // 补充 dev-rules 全文
    if (result.devRules.content) {
      lines.push('## 📐 开发规范（完整）');
      lines.push('');
      lines.push(result.devRules.content);
      lines.push('');
    }

    // 补充用户规则全文
    if (result.userRules) {
      lines.push('## 📝 用户自定义规则（完整）');
      lines.push('');
      lines.push(result.userRules);
      lines.push('');
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }

  /**
   * add_rule: 添加项目规范规则
   */
  private async handleAddRule(args: any) {
    const name = typeof args?.name === 'string' ? args.name : '';
    const content = typeof args?.content === 'string' ? args.content : '';
    const category = typeof args?.category === 'string' ? args.category : 'general';

    if (!name || !content) {
      return {
        content: [{ type: 'text', text: '❌ "name" 和 "content" 是必填参数。' }],
        isError: true,
      };
    }

    const result = addRule(name, content, category);
    if (result.success) {
      return {
        content: [{ type: 'text', text: `✅ 规则已添加: ${name}\n\n分类: ${category}\n内容:\n${content}` }],
      };
    } else {
      return {
        content: [{ type: 'text', text: `❌ 添加规则失败: ${result.error}` }],
        isError: true,
      };
    }
  }

  /**
   * list_rules: 列出所有规则
   */
  private async handleListRules() {
    const rules = listRules();

    if (rules.length === 0) {
      return {
        content: [{ type: 'text', text: '📋 暂无自定义规则。\n\n使用 `add_rule` 工具添加规则。' }],
      };
    }

    const lines: string[] = [];
    lines.push('📋 项目自定义规则列表');
    lines.push('');
    lines.push('| 名称 | 分类 | 创建日期 |');
    lines.push('|------|------|----------|');
    for (const rule of rules) {
      lines.push(`| ${rule.meta.name} | ${rule.meta.category} | ${rule.meta.created} |`);
    }
    lines.push('');
    lines.push(`共 ${rules.length} 条规则`);

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }

  /**
   * remove_rule: 删除规则
   */
  private async handleRemoveRule(args: any) {
    const name = typeof args?.name === 'string' ? args.name : '';

    if (!name) {
      return {
        content: [{ type: 'text', text: '❌ "name" 是必填参数。' }],
        isError: true,
      };
    }

    const result = removeRule(name);
    if (result.success) {
      return {
        content: [{ type: 'text', text: `✅ 规则已删除: ${name}` }],
      };
    } else {
      return {
        content: [{ type: 'text', text: `❌ 删除规则失败: ${result.error}` }],
        isError: true,
      };
    }
  }

  /**
   * commit_dialog: 手动 git commit
   */
  private async handleCommitDialog(args: any) {
    const message = typeof args?.message === 'string' ? args.message : '';
    const files: string[] = Array.isArray(args?.files) ? args.files : [];

    if (!message) {
      return {
        content: [{ type: 'text', text: '❌ "message" 是必填参数。' }],
        isError: true,
      };
    }

    if (!isGitRepo()) {
      return {
        content: [{ type: 'text', text: '❌ 当前目录不是 git 仓库。' }],
        isError: true,
      };
    }

    const result = gitAutoCommit(message, files.length > 0 ? files : undefined);

    if (result.success) {
      const status = gitStatus();
      return {
        content: [{
          type: 'text',
          text: `✅ Git 提交成功。\n\n- 提交信息: ${message}\n- Commit: ${result.hash}\n- 分支: ${status?.branch || 'unknown'}`,
        }],
      };
    } else {
      return {
        content: [{ type: 'text', text: `❌ Git 提交失败: ${result.error}` }],
        isError: true,
      };
    }
  }

  // ─── Skill 工具实现 ───────────────────────────────────────────────

  /**
   * list_skills: 列出所有可用 skill
   */
  private async handleListSkills() {
    const skillList = formatSkillList();

    if (!skillList) {
      return {
        content: [{ type: 'text', text: '🎭 暂无可用 Skill。\n\n使用 `add_skill` 工具或在 `.github/prompts/skills/` 目录下创建 .md 文件来添加 Skill。' }],
      };
    }

    return {
      content: [{ type: 'text', text: skillList }],
    };
  }

  /**
   * select_skill: 选择一个 skill 作为当前身份
   */
  private async handleSelectSkill(args: any) {
    const name = typeof args?.name === 'string' ? args.name : '';

    if (!name) {
      return {
        content: [{ type: 'text', text: '❌ "name" 是必填参数。请指定要选择的 Skill 名称。' }],
        isError: true,
      };
    }

    const skill = selectSkill(name);
    if (!skill) {
      return {
        content: [{ type: 'text', text: `❌ Skill 不存在: ${name}\n\n可用 Skill: ${listSkills().map(s => s.meta.name).join(', ') || '无'}` }],
        isError: true,
      };
    }

    const lines: string[] = [];
    lines.push(`# ${skill.meta.icon} Skill 已激活: ${skill.meta.name}`);
    lines.push('');
    lines.push(`> ${skill.meta.description} (v${skill.meta.version})`);
    lines.push('');
    lines.push(skill.content);
    lines.push('');
    lines.push('---');
    lines.push(`> Skill \`${name}\` 已加载。请以该角色身份开始工作。`);

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }

  /**
   * add_skill: 创建新 skill
   */
  private async handleAddSkill(args: any) {
    const name = typeof args?.name === 'string' ? args.name : '';
    const icon = typeof args?.icon === 'string' ? args.icon : '🎯';
    const description = typeof args?.description === 'string' ? args.description : '';
    const identity = typeof args?.identity === 'string' ? args.identity : '';
    const guidelines = typeof args?.guidelines === 'string' ? args.guidelines : '';

    if (!name || !description || !identity || !guidelines) {
      return {
        content: [{ type: 'text', text: '❌ 缺少必填参数。需要：name, description, identity, guidelines。' }],
        isError: true,
      };
    }

    const result = addSkill(name, { icon, description, identity, guidelines });
    if (result.success) {
      return {
        content: [{ type: 'text', text: `✅ Skill \`${name}\` 已创建。\n\n${icon} ${description}\n\n使用 \`select_skill "${name}"\` 来激活。` }],
      };
    } else {
      return {
        content: [{ type: 'text', text: `❌ 创建 Skill 失败: ${result.error}` }],
        isError: true,
      };
    }
  }

  /**
   * update_skill: 自我优化 skill
   */
  private async handleUpdateSkill(args: any) {
    const name = typeof args?.name === 'string' ? args.name : '';
    const learnings = typeof args?.learnings === 'string' ? args.learnings : undefined;
    const guidelineChanges = typeof args?.guidelineChanges === 'string' ? args.guidelineChanges : undefined;
    const description = typeof args?.description === 'string' ? args.description : undefined;

    if (!name) {
      return {
        content: [{ type: 'text', text: '❌ "name" 是必填参数。' }],
        isError: true,
      };
    }

    if (!learnings && !guidelineChanges && !description) {
      return {
        content: [{ type: 'text', text: '❌ 请至少提供一个更新项：learnings / guidelineChanges / description。' }],
        isError: true,
      };
    }

    const result = updateSkill(name, { learnings, guidelineChanges, description });
    if (result.success) {
      const parts: string[] = [];
      if (learnings) parts.push('学习记录已追加');
      if (guidelineChanges) parts.push('开发规范已更新');
      if (description) parts.push('描述已更新');

      return {
        content: [{ type: 'text', text: `✅ Skill \`${name}\` 已更新。\n\n${parts.join('；')}` }],
      };
    } else {
      return {
        content: [{ type: 'text', text: `❌ 更新 Skill 失败: ${result.error}` }],
        isError: true,
      };
    }
  }

  // ─── Run ────────────────────────────────────────────────────────

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Prompts MCP Server running on stdio');
    console.error(`Project root: ${getProjectRoot()}`);
  }
}

const server = new PromptsMcpServer();
server.run().catch(console.error);

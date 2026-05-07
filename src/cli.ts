#!/usr/bin/env node

/**
 * prompts-mcp-server CLI
 * 
 * CLI 入口，提供与 MCP Server 相同的功能。
 * 
 * Usage:
 *   npx tsx src/cli.ts init [--project-root /path/to/project]
 *   npx tsx src/cli.ts bootstrap
 *   npx tsx src/cli.ts check "task description"
 *   npx tsx src/cli.ts plan "task description"
 *   npx tsx src/cli.ts log --title "xxx" --request "xxx" [--changes ...] [--decisions ...] [--todos ...]
 *   npx tsx src/cli.ts module-log <module> --change "xxx" [--files ...] [--decisions ...]
 *   npx tsx src/cli.ts module-read <module>
 *   npx tsx src/cli.ts todos add|complete|remove "todo text"
 *   npx tsx src/cli.ts help
 */

import {
  bootstrap,
  formatBootstrap,
} from './prompts-loader.js';
import { getProjectRoot, getPromptsDir } from './config.js';
import {
  initPrompts,
} from './prompts-generator.js';
import {
  readModuleLog,
  listModuleLogs,
  appendModuleLog,
} from './module-logger.js';
import {
  checkRequirements,
  formatCheckResult,
  generatePlan,
  formatPlan,
} from './requirements-check.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function printHelp(): void {
  console.log(`
🚀 Prompts MCP Server - CLI

Usage:
  npx tsx src/cli.ts <command> [options]

Commands:
  init [--project-root <path>]   初始化 prompts 体系（扫描项目自动生成）
  bootstrap                       一键启动，加载所有上下文
  check <description>             需求澄清检查（5 项标准）
  plan <description>              生成可行计划（需求需已澄清）
  log --title <t> --request <r>   记录对话日志
  module-log <name> --change <c>  记录模块修改
  module-read <name>              读取模块记录
  module-list                     列出所有模块记录
  todos add|complete|remove <t>   更新待办事项
  help                            显示帮助

Examples:
  npx tsx src/cli.ts init --project-root /path/to/my-project
  npx tsx src/cli.ts bootstrap
  npx tsx src/cli.ts check "添加用户登录功能"
  npx tsx src/cli.ts plan "添加用户登录功能，支持 JWT"
  npx tsx src/cli.ts log --title "添加登录" --request "实现 JWT 登录" --changes "AuthController.java"
  npx tsx src/cli.ts module-log auth --change "添加 JWT 登录" --files "AuthController.java"
  npx tsx src/cli.ts module-read auth
  npx tsx src/cli.ts todos add "补充测试用例"
`);
}

function printSeparator(title: string): void {
  const line = '═'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'init': {
      const rootIndex = args.indexOf('--project-root');
      const projectRoot = rootIndex !== -1 ? args[rootIndex + 1] : getProjectRoot();
      printSeparator('初始化 Prompts 体系');
      const result = initPrompts(projectRoot);

      console.log(`项目: ${result.projectInfo.name}`);
      console.log(`路径: ${result.promptsDir}\n`);
      console.log('已创建文件:');
      for (const f of result.filesCreated) {
        console.log(`  ✅ ${f}`);
      }
      console.log('\n检测到的项目信息:');
      console.log(`  语言: ${result.projectInfo.languages.join(', ') || '未检测到'}`);
      console.log(`  框架: ${result.projectInfo.frameworks.join(', ') || '未检测到'}`);
      console.log(`  前端: ${result.projectInfo.hasFrontend ? result.projectInfo.frontendFramework : '无'}`);
      console.log(`  后端: ${result.projectInfo.hasBackend ? result.projectInfo.backendFramework : '无'}`);

      if (result.errors.length > 0) {
        console.log('\n错误:');
        for (const e of result.errors) {
          console.log(`  ❌ ${e}`);
        }
      }
      break;
    }

    case 'bootstrap': {
      printSeparator('一键启动');
      const result = bootstrap();
      console.log(formatBootstrap(result));
      break;
    }

    case 'check': {
      const taskDescription = args.slice(1).join(' ') || '';
      printSeparator('需求澄清检查');
      const result = checkRequirements(taskDescription);
      console.log(formatCheckResult(result));
      break;
    }

    case 'plan': {
      const taskDescription = args.slice(1).join(' ') || '';
      if (!taskDescription) {
        console.error('❌ 请提供任务需求描述。');
        process.exit(1);
      }

      const checkResult = checkRequirements(taskDescription);
      if (!checkResult.allClear) {
        console.error(`❌ 需求尚未完全明确，无法生成计划。\n\n不明确项: ${checkResult.unclearItems.join('、')}\n\n请先使用 check 命令追问澄清。`);
        process.exit(1);
      }

      printSeparator('生成执行计划');
      const plan = generatePlan(taskDescription, checkResult);
      console.log(formatPlan(plan));
      break;
    }

    case 'log': {
      const titleIndex = args.indexOf('--title');
      const requestIndex = args.indexOf('--request');
      const changesIndex = args.indexOf('--changes');
      const decisionsIndex = args.indexOf('--decisions');
      const todosIndex = args.indexOf('--todos');

      const title = titleIndex !== -1 ? args[titleIndex + 1] : '';
      const request = requestIndex !== -1 ? args[requestIndex + 1] : '';

      if (!title || !request) {
        console.error('❌ --title 和 --request 是必填参数。');
        process.exit(1);
      }

      const changes: string[] = [];
      if (changesIndex !== -1) {
        for (let i = changesIndex + 1; i < args.length; i++) {
          if (args[i].startsWith('--')) break;
          changes.push(args[i]);
        }
      }

      const decisions: string[] = [];
      if (decisionsIndex !== -1) {
        for (let i = decisionsIndex + 1; i < args.length; i++) {
          if (args[i].startsWith('--')) break;
          decisions.push(args[i]);
        }
      }

      const todos: string[] = [];
      if (todosIndex !== -1) {
        for (let i = todosIndex + 1; i < args.length; i++) {
          if (args[i].startsWith('--')) break;
          todos.push(args[i]);
        }
      }

      printSeparator('记录对话日志');
      const promptsDir = getPromptsDir();
      const today = new Date().toISOString().slice(0, 10);

      // 读取 nextEntryId
      const statePath = path.join(promptsDir, 'log-state.json');
      let entryId = 1;
      try {
        if (fs.existsSync(statePath)) {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
          entryId = state.nextEntryId || 1;
        }
      } catch { /* ignore */ }

      // 直接操作文件（简化版）
      // daily
      const dailyDir = path.join(promptsDir, 'daily');
      if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
      const dailyEntry = [
        '',
        `## Entry-${String(entryId).padStart(3, '0')}`,
        `- 时间: ${new Date().toISOString()}`,
        `- 标题: ${title}`,
        `- 清洗后需求: ${request}`,
        changes.length > 0 ? `- 代码变更: ${changes.join(', ')}` : '',
        decisions.length > 0 ? `- 技术决策: ${decisions.join('; ')}` : '',
        todos.length > 0 ? `- 待办: ${todos.join('; ')}` : '',
        '',
      ].filter(Boolean).join('\n');
      fs.appendFileSync(path.join(dailyDir, `${today}.md`), dailyEntry, 'utf-8');
      console.log('✅ daily 日志已追加');

      // recent-5
      const recentPath = path.join(promptsDir, 'recent-5.md');
      const newEntry = [
        `## Entry-${String(entryId).padStart(3, '0')}`,
        `- 日期: ${today}`,
        `- 清洗后需求: ${request}`,
        changes.length > 0 ? `- 代码变更:\n${changes.map(c => `  - ${c}`).join('\n')}` : '- 代码变更: (无)',
        decisions.length > 0 ? `- 技术决策:\n${decisions.map(d => `  - ${d}`).join('\n')}` : '- 技术决策: (无)',
        todos.length > 0 ? `- 待办:\n${todos.map(t => `  - ${t}`).join('\n')}` : '- 待办: (无)',
        '',
      ].join('\n');

      let recentContent = '';
      if (fs.existsSync(recentPath)) recentContent = fs.readFileSync(recentPath, 'utf-8');
      const headerMatch = recentContent.match(/^.*?(?=\n## Entry-)/s);
      const header = headerMatch ? headerMatch[0].trim() : '# 最近 5 条对话与操作（动态窗口）\n\n> 规则：每次新增 1 条，超过 5 条时删除最旧 1 条。\n';
      const entries = recentContent.split(/\n(?=## Entry-)/).filter((e: string) => e.startsWith('## Entry-'));
      entries.push(newEntry);
      const recentEntries = entries.slice(-5);
      fs.writeFileSync(recentPath, `${header}\n\n${recentEntries.join('\n')}\n`, 'utf-8');
      console.log('✅ recent-5 已更新');

      // log-state.json
      let state: any = { nextEntryId: 1, windowId: 'W-0001', windowStartEntry: 1, windowCount: 0, windowEntries: [] };
      if (fs.existsSync(statePath)) {
        try { state = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch { /* ignore */ }
      }
      state.windowEntries.push({ id: entryId, date: today, request, changes, decisions, todos });
      state.windowCount = state.windowEntries.length;
      state.nextEntryId = entryId + 1;
      if (state.windowCount >= 10) {
        const wn = parseInt(state.windowId.replace('W-', '')) || 1;
        state.windowId = `W-${String(wn + 1).padStart(4, '0')}`;
        state.windowStartEntry = entryId + 1;
        state.windowCount = 0;
        state.windowEntries = [];
      }
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
      console.log('✅ log-state.json 已更新');

      console.log(`\n📝 Entry-${String(entryId).padStart(3, '0')} (${today}): ${title}`);
      break;
    }

    case 'module-log': {
      const moduleName = args[1];
      if (!moduleName) {
        console.error('❌ 请指定模块名称。');
        process.exit(1);
      }

      const changeIndex = args.indexOf('--change');
      const filesIndex = args.indexOf('--files');
      const decisionsIndex = args.indexOf('--decisions');

      const change = changeIndex !== -1 ? args[changeIndex + 1] : '';
      if (!change) {
        console.error('❌ --change 是必填参数。');
        process.exit(1);
      }

      const files: string[] = [];
      if (filesIndex !== -1) {
        for (let i = filesIndex + 1; i < args.length; i++) {
          if (args[i].startsWith('--')) break;
          files.push(args[i]);
        }
      }

      const decisions: string[] = [];
      if (decisionsIndex !== -1) {
        for (let i = decisionsIndex + 1; i < args.length; i++) {
          if (args[i].startsWith('--')) break;
          decisions.push(args[i]);
        }
      }

      const projectRoot = getProjectRoot();
      const today = new Date().toISOString().slice(0, 10);
      const result = appendModuleLog(projectRoot, moduleName, { date: today, change, files, decisions });

      if (result.success) {
        console.log(`✅ 模块记录已更新: ${moduleName}`);
        console.log(`   变更: ${change}`);
      } else {
        console.error(`❌ 失败: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'module-read': {
      const moduleName = args[1];
      if (!moduleName) {
        console.error('❌ 请指定模块名称。');
        process.exit(1);
      }

      const projectRoot = getProjectRoot();
      const content = readModuleLog(projectRoot, moduleName);
      printSeparator(`模块记录: ${moduleName}`);
      console.log(content);
      break;
    }

    case 'module-list': {
      const projectRoot = getProjectRoot();
      const modules = listModuleLogs(projectRoot);
      printSeparator('模块记录列表');
      if (modules.length === 0) {
        console.log('* 暂无模块记录 *');
      } else {
        for (const m of modules) {
          console.log(`  📦 ${m}`);
        }
      }
      break;
    }

    case 'todos': {
      const action = args[1];
      const todo = args.slice(2).join(' ');

      if (!action || !todo) {
        console.error('❌ 用法: todos add|complete|remove "todo text"');
        process.exit(1);
      }

      const promptsDir = getPromptsDir();
      const todosPath = path.join(promptsDir, 'todos.md');
      let content = '';
      if (fs.existsSync(todosPath)) {
        content = fs.readFileSync(todosPath, 'utf-8');
      } else {
        content = '# 待办事项\n\n## 进行中\n\n*(暂无)*\n\n## 已完成\n\n*(暂无)*\n';
      }

      switch (action) {
        case 'add': {
          const marker = '## 进行中';
          const idx = content.indexOf(marker);
          if (idx !== -1) {
            const after = content.indexOf('\n', idx) + 1;
            content = content.slice(0, after) + `\n- [ ] ${todo}` + content.slice(after);
          }
          break;
        }
        case 'complete':
          content = content.replace(`- [ ] ${todo}`, `- [x] ${todo}`);
          break;
        case 'remove':
          content = content.replace(`- [ ] ${todo}\n`, '');
          content = content.replace(`- [x] ${todo}\n`, '');
          break;
      }

      fs.writeFileSync(todosPath, content, 'utf-8');
      console.log(`✅ 待办已更新: ${action} "${todo}"`);
      break;
    }

    default: {
      console.error(`未知命令: ${command}`);
      printHelp();
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('CLI Error:', error);
  process.exit(1);
});

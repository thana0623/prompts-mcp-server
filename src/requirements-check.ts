/**
 * requirements-check.ts
 * 
 * 需求澄清检查 + 可行计划生成。
 * 
 * 核心原则：
 * 1. 需求不明确时禁止猜测，必须先追问
 * 2. 需求明确后，生成可行计划
 * 3. 等待用户确认计划后再执行
 */

import { config } from './config.js';

// ─── 5 项检查标准 ────────────────────────────────────────────────────

export interface ClarityCheckItem {
  id: string;
  label: string;
  question: string;
  status: '❌' | '⚠️' | '✅';
  detail: string;
  reasoning: string;
}

export interface ClarityCheckResult {
  taskDescription: string;
  items: ClarityCheckItem[];
  allClear: boolean;
  unclearItems: string[];
  followUpQuestions: string[];
}

/**
 * 执行 5 项需求澄清检查
 */
export function checkRequirements(taskDescription: string): ClarityCheckResult {
  const items: ClarityCheckItem[] = [
    {
      id: 'goal',
      label: '目标明确',
      question: '能用一句话说清"这个需求要解决什么问题"？',
      status: '❌',
      detail: '',
      reasoning: '',
    },
    {
      id: 'io',
      label: '输入输出明确',
      question: '"从哪来"和"到哪去"都要清楚？',
      status: '❌',
      detail: '',
      reasoning: '',
    },
    {
      id: 'constraints',
      label: '约束明确',
      question: '有没有"不能改的地方"？',
      status: '❌',
      detail: '',
      reasoning: '',
    },
    {
      id: 'acceptance',
      label: '验收标准明确',
      question: '"什么时候算完成"要有具体标准？',
      status: '❌',
      detail: '',
      reasoning: '',
    },
    {
      id: 'scope',
      label: '影响范围明确',
      question: '要改哪些文件/模块、要更新哪些 docs？',
      status: '❌',
      detail: '',
      reasoning: '',
    },
  ];

  const desc = taskDescription.trim();
  const lower = desc.toLowerCase();

  // 1. 目标明确 — 需要动词+对象结构
  const hasVerbObject = /(?:实现|修复|添加|重构|优化|删除|迁移|升级|集成|配置|部署|封装|抽取|改造|新增|支持)\S{2,}/.test(desc);
  if (desc.length > 30 && hasVerbObject) {
    items[0].status = '✅';
    items[0].detail = '有明确的动词+对象结构';
    items[0].reasoning = `检测到动作描述（${desc.slice(0, 40)}...）`;
  } else if (desc.length > 15) {
    items[0].status = '⚠️';
    items[0].detail = '有描述但缺少明确动作';
    items[0].reasoning = '描述较长但未检测到"实现/修复/添加"等动词';
  } else {
    items[0].reasoning = '描述过短，无法判断目标';
  }

  // 2. 输入输出 — 检测来源和目标
  const hasInput = /输入|从.*来|接口|参数|request|input|from|接收|获取|读取|查询/.test(lower);
  const hasOutput = /输出|返回|结果|response|output|to|写入|存储|生成|展示|响应/.test(lower);
  const hasIOFlow = /(?:输入.*输出|从.*到|接口.*返回|request.*response|调用.*返回|获取.*写入|读取.*展示)/i.test(desc);

  if (hasIOFlow) {
    items[1].status = '✅';
    items[1].detail = '输入输出流程明确';
    items[1].reasoning = '检测到完整的数据流向描述';
  } else if (hasInput && hasOutput) {
    items[1].status = '✅';
    items[1].detail = '分别提到了输入和输出';
    items[1].reasoning = '检测到输入和输出关键词';
  } else if (hasInput || hasOutput) {
    items[1].status = '⚠️';
    items[1].detail = hasInput ? '提到了输入来源，缺少输出描述' : '提到了输出目标，缺少输入描述';
    items[1].reasoning = '只检测到单向描述';
  } else {
    items[1].reasoning = '未检测到输入/输出相关关键词';
  }

  // 3. 约束 — 检测限制条件
  const hasConstraint = /不能|不要|禁止|约束|限制|边界|except|but|only|must not|保持.*兼容|不删减|不改动|不影响/.test(lower);
  const hasSpecificConstraint = /不能改.*接口|保持.*签名|禁止.*删除|不.*变更/.test(lower);

  if (hasSpecificConstraint) {
    items[2].status = '✅';
    items[2].detail = '有明确的约束条件';
    items[2].reasoning = '检测到具体的限制约束';
  } else if (hasConstraint) {
    items[2].status = '⚠️';
    items[2].detail = '提到了约束但不够具体';
    items[2].reasoning = '检测到约束关键词但缺少具体范围';
  } else {
    items[2].reasoning = '未检测到约束条件描述';
  }

  // 4. 验收标准 — 检测具体指标
  const hasAcceptanceKeyword = /验收标准|测试用例|test case|acceptance|单元测试|集成测试/.test(lower);
  const hasMetric = /\d+%|\d+\s*(?:个|条|次|ms|秒|分)|大于|小于|等于|通过率|覆盖率|无报错|无error/.test(lower);
  const hasWhenClause = /当.*时|如果.*则|.*应该.*|.*必须.*|.*需要返回/.test(lower);

  if (hasAcceptanceKeyword || (hasMetric && hasWhenClause)) {
    items[3].status = '✅';
    items[3].detail = '有明确的验收标准';
    items[3].reasoning = hasAcceptanceKeyword ? '检测到验收标准关键词' : '检测到具体指标和条件描述';
  } else if (hasMetric || hasWhenClause || /完成|通过|测试|test|pass|done|finish/.test(lower)) {
    items[3].status = '⚠️';
    items[3].detail = '提到了完成标准但不够具体';
    items[3].reasoning = '检测到部分验收相关描述';
  } else {
    items[3].reasoning = '未检测到验收标准描述';
  }

  // 5. 影响范围 — 检测具体文件/模块
  const hasSpecificScope = /(?:涉及|修改|改动|更新|影响).*(?:文件|模块|页面|组件|接口|表)/.test(lower);
  const hasFilePath = /\b\w+\.(?:ts|js|tsx|jsx|vue|java|py|go|sql)\b/i.test(desc);
  const hasModuleName = /(?:auth|user|order|payment|config|router|controller|service|model|module)\b/i.test(lower);

  if (hasSpecificScope || hasFilePath) {
    items[4].status = '✅';
    items[4].detail = '影响范围明确';
    items[4].reasoning = hasFilePath ? '提到了具体文件路径' : '描述了影响的模块/组件';
  } else if (hasModuleName || /文件|模块|页面|影响|修改|change|file|module|page/.test(lower)) {
    items[4].status = '⚠️';
    items[4].detail = '提到了影响范围但不够具体';
    items[4].reasoning = '检测到模块名或范围关键词';
  } else {
    items[4].reasoning = '未检测到影响范围描述';
  }

  const unclearItems = items.filter(i => i.status !== '✅').map(i => i.label);
  const allClear = unclearItems.length === 0;

  // 生成追问问题
  const followUpQuestions: string[] = [];
  if (items[0].status !== '✅') {
    followUpQuestions.push('1. 你要解决的具体问题是什么？');
  }
  if (items[1].status !== '✅') {
    followUpQuestions.push('2. 期望输出是什么，成功标准是什么？');
  }
  if (items[2].status !== '✅') {
    followUpQuestions.push('3. 是否有不能改动的约束、技术选型或业务边界？');
  }
  if (items[3].status !== '✅') {
    followUpQuestions.push('4. "什么时候算完成"要有具体标准？');
  }
  if (items[4].status !== '✅') {
    followUpQuestions.push('5. 这次变更影响哪些文件、模块或页面？');
  }

  return { taskDescription, items, allClear, unclearItems, followUpQuestions };
}

/**
 * 格式化检查结果为可读文本
 */
export function formatCheckResult(result: ClarityCheckResult): string {
  const lines: string[] = [];

  lines.push('# 📋 需求澄清检查清单');
  lines.push('');
  lines.push(`**任务描述**: ${result.taskDescription || '*未提供*'}`);
  lines.push('');

  if (result.allClear) {
    lines.push('✅ **所有 5 项标准已明确！**');
    lines.push('');
  } else {
    lines.push(`⚠️ **以下项目不明确**: ${result.unclearItems.join('、')}`);
    lines.push('');
  }

  lines.push('## 5 项明确标准');
  lines.push('');
  lines.push('| 标准 | 状态 | 说明 |');
  lines.push('|------|------|------|');
  for (const item of result.items) {
    lines.push(`| ${item.label} | ${item.status} | ${item.detail || item.question} |`);
  }
  lines.push('');

  if (!result.allClear) {
    lines.push('## 需要追问的问题');
    lines.push('');
    for (const q of result.followUpQuestions) {
      lines.push(q);
    }
    lines.push('');
    lines.push('> ⚠️ **任何一项不符合就 STOP，不要猜，立刻问！**');
    lines.push('> ⚠️ **一轮不够就继续追问，直到所有 5 项都明确。**');
  }

  return lines.join('\n');
}

// ─── 可行计划生成 ────────────────────────────────────────────────────

export interface PlanStep {
  order: number;
  action: string;
  details: string;
  estimatedFiles: string[];
}

export interface Plan {
  title: string;
  description: string;
  steps: PlanStep[];
  risks: string[];
  pendingConfirmation: boolean;
}

/**
 * 根据明确的需求生成可行计划
 * 注意：此函数仅在需求已澄清（allClear = true）时调用
 */
export function generatePlan(
  taskDescription: string,
  _checkResult: ClarityCheckResult,
): Plan {
  const desc = taskDescription.toLowerCase();

  const steps: PlanStep[] = [];
  let order = 1;

  // Step 1: 需求分析
  steps.push({
    order: order++,
    action: '需求分析与设计',
    details: '根据明确的需求，分析技术方案和实现路径',
    estimatedFiles: [],
  });

  // 检测是否涉及后端
  if (/后端|api|接口|数据库|service|controller|java|spring|auth|login|register/i.test(desc)) {
    steps.push({
      order: order++,
      action: '后端实现',
      details: '实现后端接口、业务逻辑、数据持久化',
      estimatedFiles: ['backend/src/**'],
    });
  }

  // 检测是否涉及前端
  if (/前端|页面|组件|ui|vue|react|界面|样式|交互/i.test(desc)) {
    steps.push({
      order: order++,
      action: '前端实现',
      details: '实现前端页面、组件、交互逻辑',
      estimatedFiles: ['frontend/src/**'],
    });
  }

  // 检测是否涉及数据库
  if (/数据库|表|sql|mysql|migration|entity/i.test(desc)) {
    steps.push({
      order: order++,
      action: '数据库变更',
      details: '创建/修改数据库表结构、迁移脚本',
      estimatedFiles: ['backend/sql/**', 'backend/src/main/**/model/**'],
    });
  }

  // 检测是否涉及配置
  if (/配置|config|yml|properties|环境/i.test(desc)) {
    steps.push({
      order: order++,
      action: '配置更新',
      details: '更新配置文件和环境变量',
      estimatedFiles: ['backend/src/main/resources/**'],
    });
  }

  // 文档更新
  steps.push({
    order: order++,
    action: '文档同步',
    details: '更新对应模块的 docs 文档和模块记录',
    estimatedFiles: ['docs/**', `${config.promptsSubDir}/modules/**`],
  });

  // 测试
  steps.push({
    order: order++,
    action: '测试验证',
    details: '编写/更新测试用例，验证功能正确性',
    estimatedFiles: ['**/*Test.*', '**/*.spec.*'],
  });

  // 日志记录
  steps.push({
    order: order++,
    action: '日志记录',
    details: '记录本次对话日志（daily + recent-5 + summary-10 + 模块记录）',
    estimatedFiles: [`${config.promptsSubDir}/**`],
  });

  return {
    title: `执行计划: ${taskDescription.slice(0, 50)}${taskDescription.length > 50 ? '...' : ''}`,
    description: taskDescription,
    steps,
    risks: [
      '需求变更可能导致计划调整',
      '依赖外部服务时可能受限于可用性',
    ],
    pendingConfirmation: true,
  };
}

/**
 * 格式化计划为可读文本
 */
export function formatPlan(plan: Plan): string {
  const lines: string[] = [];

  lines.push('# 📋 执行计划');
  lines.push('');
  lines.push(`## ${plan.title}`);
  lines.push('');
  lines.push(`**需求描述**: ${plan.description}`);
  lines.push('');
  lines.push('## 执行步骤');
  lines.push('');

  for (const step of plan.steps) {
    lines.push(`### Step ${step.order}: ${step.action}`);
    lines.push('');
    lines.push(step.details);
    if (step.estimatedFiles.length > 0) {
      lines.push('');
      lines.push('预计涉及文件:');
      for (const f of step.estimatedFiles) {
        lines.push(`- \`${f}\``);
      }
    }
    lines.push('');
  }

  if (plan.risks.length > 0) {
    lines.push('## 风险提示');
    lines.push('');
    for (const risk of plan.risks) {
      lines.push(`- ⚠️ ${risk}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('🟡 **此计划等待你的确认。**');
  lines.push('');
  lines.push('请确认：');
  lines.push('1. 这个计划是否符合你的预期？');
  lines.push('2. 是否有需要调整的步骤？');
  lines.push('3. 确认后我将开始执行。');

  return lines.join('\n');
}

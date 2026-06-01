#!/bin/bash
# 对话总结生成器（assistant-agnostic）
# 读取 session 的用户消息 + git diff，生成中文对话级总结
# 同时写入 daily/、recent-5.md、summary-10.md
#
# 环境变量（由 adapter 设置）：
#   PROJECT_DIR     — 项目根目录（默认: pwd）
#   PROMPTS_SUBDIR  — prompts 子目录（默认: .github/prompts）
#   SESSION_ID      — 当前 session 标识

set -euo pipefail

export PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"
export PROMPTS_DIR="$PROJECT_DIR/$PROMPTS_SUBDIR"
export SESSIONS_DIR="$PROJECT_DIR/logs/sessions"
export DIALOGS_DIR="$PROJECT_DIR/logs/dialogs"
export SESSION_ID="${SESSION_ID:-unknown}"

mkdir -p "$DIALOGS_DIR"

node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_DIR = process.env.PROJECT_DIR;
const PROMPTS_DIR = process.env.PROMPTS_DIR;
const SESSIONS_DIR = process.env.SESSIONS_DIR;
const DIALOGS_DIR = process.env.DIALOGS_DIR;
const SESSION_ID = process.env.SESSION_ID;

const STATE_FILE = path.join(PROMPTS_DIR, 'log-state.json');
const RECENT_FILE = path.join(PROMPTS_DIR, 'recent-5.md');
const SUMMARY_FILE = path.join(PROMPTS_DIR, 'summary-10.md');

// ─── 加载状态 ───────────────────────────────────────────────────────
let state = {
  nextEntryId: 1,
  windowId: 'W-0001',
  windowCount: 0,
  lastProcessedDate: '',
  lastProcessedCount: 0
};
try {
  if (fs.existsSync(STATE_FILE)) {
    Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  }
} catch {}

// ─── 读取用户消息 ─────────────────────────────────────────────────────
const promptFile = path.join(SESSIONS_DIR, SESSION_ID + '.prompts.jsonl');
let userMessages = [];
if (fs.existsSync(promptFile)) {
  const lines = fs.readFileSync(promptFile, 'utf8').split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      if (d.prompt) userMessages.push(d.prompt);
    } catch {}
  }
}

// 无用户消息则跳过（自动化 session）
if (userMessages.length === 0) {
  process.exit(0);
}

// ─── 获取变更文件 ──────────────────────────────────────────────────────
let changedFiles = [];
try {
  const status = execSync('git status --porcelain', {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    timeout: 5000
  }).trim();
  if (status) {
    changedFiles = status.split('\n')
      .map(l => l.slice(3).trim())
      .filter(f => f && !f.startsWith('logs/') && !f.startsWith(PROMPTS_SUBDIR));
  }
} catch {}

// 也检查今天的 git commits
try {
  const log = execSync('git log --since=\"today\" --name-only --oneline', {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    timeout: 5000
  }).trim();
  if (log) {
    const commitFiles = log.split('\n')
      .filter(l => l && !l.match(/^[a-f0-9]{7,}/) && !l.startsWith('logs/') && !l.startsWith(PROMPTS_SUBDIR));
    changedFiles = [...new Set([...changedFiles, ...commitFiles])];
  }
} catch {}

// ─── 生成中文对话总结 ──────────────────────────────────────────────────
// 提取用户问题（取第一条有意义的消息，去除寒暄）
const firstMsg = userMessages[0];
const cleanMsg = firstMsg
  .replace(/^(你好|hi|hello|hey|嗨|哈喽)[,，\s]*/i, '')
  .replace(/^(请|帮我|帮忙|麻烦|能不能|可以帮我)[,，\s]*/i, '')
  .trim();
const userQuestion = cleanMsg.length > 0 ? cleanMsg.slice(0, 200) : firstMsg.slice(0, 200);

// 生成改动列表
let changesDesc = '';
if (changedFiles.length > 0) {
  const displayFiles = changedFiles.slice(0, 8);
  changesDesc = displayFiles.map(f => '  - ' + f).join('\n');
  if (changedFiles.length > 8) {
    changesDesc += '\n  - ...等共 ' + changedFiles.length + ' 个文件';
  }
}

// 生成结果描述
let result = '';
if (changedFiles.length > 0) {
  result = '完成（' + changedFiles.length + ' 个文件修改）';
} else {
  result = '对话（无代码修改）';
}

// ─── 构建对话条目 ──────────────────────────────────────────────────────
const entryId = state.nextEntryId++;
state.windowCount++;
const now = new Date().toISOString();
const timeShort = now.replace('T', ' ').replace('Z', '').replace(/\.\d+/, '');
const today = now.slice(0, 10);
const padId = String(entryId).padStart(3, '0');

// ─── 写入 daily/ ──────────────────────────────────────────────────────
const dailyDir = path.join(PROMPTS_DIR, 'daily');
if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
const dailyFile = path.join(dailyDir, today + '.md');

const dailyBlock = [
  '',
  '## 对话-' + padId,
  '',
  '- **时间**: ' + timeShort,
  '- **用户问题**: ' + userQuestion,
  changesDesc ? '- **本轮改动**:\n' + changesDesc : '- **本轮改动**: (无)',
  '- **结果**: ' + result,
  ''
].join('\n');

fs.appendFileSync(dailyFile, dailyBlock + '\n');

// ─── 写入 dialogs JSONL ───────────────────────────────────────────────
const dialogsFile = path.join(DIALOGS_DIR, today + '.dialogs.jsonl');
const jsonlLine = JSON.stringify({
  id: entryId,
  time: timeShort,
  userQuestion: userQuestion,
  changedFiles: changedFiles.slice(0, 10),
  result: result,
  userMessages: userMessages.length,
  session: SESSION_ID
});
fs.appendFileSync(dialogsFile, jsonlLine + '\n');

// ─── 更新 recent-5.md ─────────────────────────────────────────────────
const mdBlock = [
  '## 对话-' + padId,
  '',
  '- **时间**: ' + timeShort,
  '- **用户问题**: ' + userQuestion,
  changesDesc ? '- **本轮改动**:\n' + changesDesc : '- **本轮改动**: (无)',
  '- **结果**: ' + result,
  ''
].join('\n');

const recentHeader =
  '# 最近对话记录（自动维护）\n\n' +
  '> 由 session-end hook 自动生成，勿手动编辑。\n' +
  '> 保留最近 5 条对话。\n';

let existingEntries = '';
if (fs.existsSync(RECENT_FILE)) {
  const content = fs.readFileSync(RECENT_FILE, 'utf8');
  const lines = content.split('\n');
  // 兼容旧格式 ## Dialog- 和 ## Event-，统一迁移到 ## 对话-
  const firstEntry = lines.findIndex(l => l.startsWith('## 对话-') || l.startsWith('## Dialog-') || l.startsWith('## Event-'));
  if (firstEntry >= 0) {
    existingEntries = lines.slice(firstEntry).join('\n').trim();
  }
}

const combined = (existingEntries + '\n' + mdBlock).trim();
const entryBlocks = combined.split(/\n(?=## (?:对话|Dialog|Event)-)/).filter(b => b.startsWith('## 对话-') || b.startsWith('## Dialog-') || b.startsWith('## Event-'));
const recentEntries = entryBlocks.slice(-5).join('\n');

fs.writeFileSync(RECENT_FILE, recentHeader + '\n' + recentEntries + '\n');

// ─── 更新 summary-10.md ──────────────────────────────────────────────
let summaryContent = '';
if (fs.existsSync(SUMMARY_FILE)) {
  summaryContent = fs.readFileSync(SUMMARY_FILE, 'utf8');
} else {
  summaryContent =
    '# 对话摘要（有状态窗口）\n\n' +
    '> 自动维护的滚动窗口。每 10 次对话生成一次压缩摘要。\n';
}

// 更新进度
const progressRe = /窗口进度:\s*\d+\/10/;
const newProgress = '窗口进度: ' + state.windowCount + '/10';
if (progressRe.test(summaryContent)) {
  summaryContent = summaryContent.replace(progressRe, newProgress);
} else {
  summaryContent += '\n## ' + state.windowId + '\n\n- ' + newProgress + '\n';
}

// 滚动窗口：达到 10 次时生成压缩摘要
if (state.windowCount >= 10) {
  // 读取本轮所有对话
  let allDialogs = [];
  try {
    const dialogsContent = fs.readFileSync(dialogsFile, 'utf8');
    const lines = dialogsContent.split('\n').filter(l => l.trim());
    allDialogs = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {}

  const allFiles = [...new Set(allDialogs.flatMap(d => d.changedFiles || []))].slice(0, 10);
  const topics = allDialogs.map(d => d.userQuestion || '').filter(Boolean).slice(0, 5);

  let carryLines = '压缩自 ' + state.windowId + ':';
  carryLines += '\n- 对话数: ' + state.windowCount + ' 次';
  if (topics.length > 0) carryLines += '\n- 主题: ' + topics.join('; ');
  if (allFiles.length > 0) carryLines += '\n- 涉及文件: ' + allFiles.join(', ');

  const wn = parseInt(state.windowId.replace('W-', '')) || 1;
  state.windowId = 'W-' + String(wn + 1).padStart(4, '0');
  state.windowCount = 0;

  summaryContent += '\n\n### 压缩摘要\n\n' + carryLines;
  summaryContent += '\n\n---\n\n## ' + state.windowId + '\n\n- 窗口进度: 0/10\n';
}

fs.writeFileSync(SUMMARY_FILE, summaryContent);

// ─── 更新 log-state.json ──────────────────────────────────────────────
state.lastProcessedDate = today;
state.lastProcessedCount = (state.lastProcessedCount || 0) + 1;
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

console.log('对话总结已生成: 对话-' + padId + ' (' + userMessages.length + ' 条消息, ' + changedFiles.length + ' 个文件)');
"

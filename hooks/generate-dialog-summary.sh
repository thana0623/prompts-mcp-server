#!/bin/bash
# Shared dialog summary generator (assistant-agnostic)
# Reads user prompts from session log + git diff, generates dialog summary
# Updates recent-5.md and summary-10.md with conversation-level entries
#
# Environment variables (set by adapter):
#   PROJECT_DIR     — project root (default: pwd)
#   PROMPTS_SUBDIR  — prompts subdirectory (default: .github/prompts)
#   SESSION_ID      — current session identifier

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

// --- Load or init state ---
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

// --- Read session prompts ---
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

// Skip if no user messages (e.g., automated session)
if (userMessages.length === 0) {
  process.exit(0);
}

// --- Get changed files from git ---
let changedFiles = [];
try {
  // Uncommitted changes
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

// Also check recent commits from this session
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

// --- Generate outcome from keywords ---
const firstMsg = userMessages[0];
let outcome = '';
const keywords = {
  '修复': '修复', 'fix': '修复', 'bug': '修复',
  '新增': '新增', 'feat': '新增', '添加': '新增', 'add': '新增',
  '重构': '重构', 'refactor': '重构',
  '优化': '优化', 'optimize': '优化',
  '配置': '配置', 'config': '配置', 'setup': '配置',
  '分析': '分析', '分析': '分析'
};

let matched = false;
for (const [kw, label] of Object.entries(keywords)) {
  if (firstMsg.toLowerCase().includes(kw.toLowerCase())) {
    if (changedFiles.length > 0) {
      outcome = label + ': ' + changedFiles.slice(0, 3).join(', ');
    } else {
      outcome = label + '（无文件修改）';
    }
    matched = true;
    break;
  }
}

if (!matched) {
  if (changedFiles.length > 0) {
    outcome = '修改了 ' + changedFiles.length + ' 个文件: ' + changedFiles.slice(0, 3).join(', ');
    if (changedFiles.length > 3) outcome += '...';
  } else {
    outcome = '对话（无文件修改）';
  }
}

// --- Build dialog entry ---
const entryId = state.nextEntryId++;
state.windowCount++;
const now = new Date().toISOString();
const timeShort = now.replace('T', ' ').replace('Z', '').replace(/\.\d+/, '');

const dialogEntry = {
  id: entryId,
  time: timeShort,
  user: firstMsg.slice(0, 200),
  outcome: outcome,
  files: changedFiles.slice(0, 10)
};

// --- Append to dialogs JSONL ---
const today = now.slice(0, 10);
const dialogsFile = path.join(DIALOGS_DIR, today + '.dialogs.jsonl');
const jsonlLine = JSON.stringify({
  ...dialogEntry,
  userMessages: userMessages.length,
  session: SESSION_ID
});
fs.appendFileSync(dialogsFile, jsonlLine + '\n');

// --- Format as markdown ---
const padId = String(dialogEntry.id).padStart(3, '0');
const mdBlock = [
  '## Dialog-' + padId,
  '',
  '- **Time**: ' + dialogEntry.time,
  '- **User**: ' + dialogEntry.user,
  '- **Outcome**: ' + dialogEntry.outcome,
  '- **Files**: ' + (dialogEntry.files.length > 0 ? dialogEntry.files.join(', ') : '(none)'),
  ''
].join('\n');

// --- Update recent-5.md ---
const recentHeader =
  '# Recent Dialogs (auto-managed by hooks)\n\n' +
  '> Auto-generated from session summaries. Do not edit manually.\n' +
  '> Showing last 5 dialog sessions.\n';

let existingEntries = '';
if (fs.existsSync(RECENT_FILE)) {
  const content = fs.readFileSync(RECENT_FILE, 'utf8');
  const lines = content.split('\n');
  const firstEntry = lines.findIndex(l => l.startsWith('## Dialog-') || l.startsWith('## Event-'));
  if (firstEntry >= 0) {
    existingEntries = lines.slice(firstEntry).join('\n').trim();
  }
}

const combined = (existingEntries + '\n' + mdBlock).trim();
const entryBlocks = combined.split(/\n(?=## (?:Dialog|Event)-)/).filter(b => b.startsWith('## Dialog-') || b.startsWith('## Event-'));
const recentEntries = entryBlocks.slice(-5).join('\n');

fs.writeFileSync(RECENT_FILE, recentHeader + '\n' + recentEntries + '\n');

// --- Update summary-10.md ---
let summaryContent = '';
if (fs.existsSync(SUMMARY_FILE)) {
  summaryContent = fs.readFileSync(SUMMARY_FILE, 'utf8');
} else {
  summaryContent =
    '# Dialog Summary (Stateful)\n\n' +
    '> Auto-managed rolling window. Every 10 dialogs generates a summary with carry-forward.\n';
}

// Update progress
const progressRe = /Window progress:\s*\d+\/10/;
const newProgress = 'Window progress: ' + state.windowCount + '/10';
if (progressRe.test(summaryContent)) {
  summaryContent = summaryContent.replace(progressRe, newProgress);
} else {
  summaryContent += '\n## ' + state.windowId + '\n\n- ' + newProgress + '\n';
}

// Rolling window: generate carry-forward if reached 10
if (state.windowCount >= 10) {
  // Read all dialogs for this window
  let allDialogs = [];
  try {
    const dialogsContent = fs.readFileSync(dialogsFile, 'utf8');
    const lines = dialogsContent.split('\n').filter(l => l.trim());
    allDialogs = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {}

  const allFiles = [...new Set(allDialogs.flatMap(d => d.files || []))].slice(0, 10);
  const topics = allDialogs.map(d => d.outcome || '').filter(Boolean).slice(0, 5);

  let carryLines = 'Carry-forward from ' + state.windowId + ':';
  carryLines += '\n- Dialogs: ' + state.windowCount + ' sessions';
  if (topics.length > 0) carryLines += '\n- Key topics: ' + topics.join('; ');
  if (allFiles.length > 0) carryLines += '\n- Files touched: ' + allFiles.join(', ');

  const wn = parseInt(state.windowId.replace('W-', '')) || 1;
  state.windowId = 'W-' + String(wn + 1).padStart(4, '0');
  state.windowCount = 0;

  summaryContent += '\n\n### Carry Forward\n\n' + carryLines;
  summaryContent += '\n\n---\n\n## ' + state.windowId + '\n\n- Window progress: 0/10\n';
}

fs.writeFileSync(SUMMARY_FILE, summaryContent);

// --- Update log-state.json ---
state.lastProcessedDate = today;
state.lastProcessedCount = (state.lastProcessedCount || 0) + 1;
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

console.log('Dialog summary created: Dialog-' + padId + ' (' + userMessages.length + ' messages, ' + changedFiles.length + ' files)');
"

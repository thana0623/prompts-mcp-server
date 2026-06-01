#!/bin/bash
# JSONL 日志状态追踪（assistant-agnostic）
# 只更新 log-state.json 中的 lastProcessedCount，不写 markdown
# markdown 由 generate-dialog-summary.sh 在 session-end 时统一生成
#
# 用途：session-start 时作为 catch-up，确保 log-state.json 反映最新处理进度
#
# 环境变量（由 adapter 设置）：
#   PROJECT_DIR     — 项目根目录（默认: pwd）
#   PROMPTS_SUBDIR  — prompts 子目录（默认: .github/prompts）

set -euo pipefail

export PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"
export PROMPTS_DIR="$PROJECT_DIR/$PROMPTS_SUBDIR"
export LOGS_DIR="$PROJECT_DIR/logs/dialogs"

mkdir -p "$LOGS_DIR"

node -e "
const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = process.env.PROMPTS_DIR;
const LOGS_DIR = process.env.LOGS_DIR;
const STATE_FILE = path.join(PROMPTS_DIR, 'log-state.json');

// 加载或初始化状态
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

const today = new Date().toISOString().slice(0, 10);
const jsonlFile = path.join(LOGS_DIR, today + '.jsonl');

if (!fs.existsSync(jsonlFile) || fs.statSync(jsonlFile).size === 0) {
  process.exit(0);
}

const jsonlContent = fs.readFileSync(jsonlFile, 'utf8');
const allLines = jsonlContent.split('\n').filter(l => l.trim());
const totalLines = allLines.length;

// 增量处理：只计算新条目的 entryId
let startIdx = 0;
if (state.lastProcessedDate === today && state.lastProcessedCount > 0) {
  if (state.lastProcessedCount >= totalLines) process.exit(0);
  startIdx = state.lastProcessedCount;
}

const newLines = allLines.slice(startIdx);
if (newLines.length === 0) process.exit(0);

// 更新 nextEntryId（每个 tool call 一个 entryId）
for (const line of newLines) {
  try {
    JSON.parse(line);
    state.nextEntryId++;
  } catch {}
}

// 更新状态
state.lastProcessedDate = today;
state.lastProcessedCount = totalLines;
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

console.log('日志状态更新: ' + newLines.length + ' 条新记录，总计 ' + totalLines + ' 条');
"

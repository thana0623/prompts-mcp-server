#!/bin/bash
# Claude Code adapter: UserPromptSubmit hook
# Captures user messages to session-level prompt log
#
# Claude Code input:
#   {"prompt":"user message","session_id":"abc123","hook_event_name":"UserPromptSubmit",...}
#
# Output: appends to logs/sessions/<session-id>.prompts.jsonl
#   {"time":"...","prompt":"user message (first 500 chars)"}

set -euo pipefail

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Read Claude Code stdin
input=$(cat)

# Parse and write to session prompt log
export PMCP_INPUT="$input"
node -e "
const fs = require('fs');
const path = require('path');

const data = JSON.parse(process.env.PMCP_INPUT);
const prompt = (data.prompt || '').trim();
if (!prompt) process.exit(0);

const session = data.session_id || 'unknown';
const sessionsDir = path.join(process.env.PROJECT_DIR, 'logs', 'sessions');
fs.mkdirSync(sessionsDir, { recursive: true });

// 清洗用户消息：剥离 ANSI 转义码、box-drawing 字符、合并空白
let cleaned = prompt
  .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')           // ANSI 转义码
  .replace(/[│├┤┬┴┼─━┃╔╗╚╝║═]/g, ' ')             // box-drawing 字符
  .replace(/\s+/g, ' ')                              // 合并空白
  .trim();

const entry = {
  time: new Date().toISOString(),
  prompt: cleaned.slice(0, 500)
};

const logFile = path.join(sessionsDir, session + '.prompts.jsonl');
fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
" 2>/dev/null || exit 0

exit 0

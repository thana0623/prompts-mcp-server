#!/bin/bash
# Shared auto-log hook (assistant-agnostic)
# Reads normalized JSON from stdin, appends to logs/dialogs/YYYY-MM-DD.jsonl
#
# Input format (normalized):
#   {"tool":"Edit","target":"src/file.ts","summary":"Modified src/file.ts","session":"abc","time":"...","assistant":"claude-code"}
#
# Environment variables (set by adapter):
#   PROJECT_DIR     — project root (default: pwd)
#   PROMPTS_SUBDIR  — prompts subdirectory (default: .github/prompts)

set -euo pipefail

export PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
export LOGS_DIR="$PROJECT_DIR/logs/dialogs"
mkdir -p "$LOGS_DIR"

# Read normalized JSON from stdin
input=$(cat)

# Use node for reliable JSON parsing
export INPUT_JSON="$input"
node -e "
const fs = require('fs');
const path = require('path');

try {
  const data = JSON.parse(process.env.INPUT_JSON);
  const tool = data.tool || 'unknown';
  const target = String(data.target || '').slice(0, 500);
  const summary = String(data.summary || 'Tool call').slice(0, 500);
  const session = data.session || 'unknown';
  const assistant = data.assistant || 'unknown';
  const time = data.time || new Date().toISOString();

  // Skip if target contains hook script paths (anti-feedback-loop)
  if (/auto-log\.sh|process-logs\.sh|session-end\.sh|normalize-log\.sh/.test(target)) return;

  const dateStr = time.slice(0, 10);
  const entry = JSON.stringify({ time, tool, target, summary, session, assistant });

  const logFile = path.join(process.env.LOGS_DIR, dateStr + '.jsonl');
  fs.appendFileSync(logFile, entry + '\n');
} catch (e) {
  // Silent fail — don't break the caller
}
"

exit 0

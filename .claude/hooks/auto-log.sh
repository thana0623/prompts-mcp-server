#!/bin/bash
# PostToolUse hook: auto-log tool calls to JSONL
# Reads hook JSON from stdin, appends to logs/dialogs/YYYY-MM-DD.jsonl
# Only logs state-changing tools (Edit, Write, Bash, etc.)
# Skips read-only tools (Read, Glob, Grep, Agent, etc.)

set -euo pipefail

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
export LOGS_DIR="$PROJECT_DIR/logs/dialogs"
mkdir -p "$LOGS_DIR"

# Use node for reliable JSON parsing (no jq dependency)
node -e "
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const tool = data.tool_name || 'unknown';

    const skip = ['Read','Glob','Grep','Agent','WebFetch','WebSearch',
                  'TaskList','TaskGet','TaskOutput','Skill'];
    if (skip.includes(tool)) return;

    const ti = data.tool_input || {};
    const session = data.session_id || 'unknown';
    let target = '';
    let summary = 'Tool call: ' + tool;

    switch (tool) {
      case 'Edit':
        target = ti.file_path || '';
        summary = 'Modified ' + target;
        break;
      case 'Write':
        target = ti.file_path || '';
        summary = 'Created/rewrote ' + target;
        break;
      case 'NotebookEdit':
        target = ti.notebook_path || '';
        summary = 'Edited notebook ' + target;
        break;
      case 'Bash':
        target = (ti.command || '').slice(0, 200);
        // Skip hook infrastructure commands (avoid feedback loop)
        if (/auto-log\.sh|process-logs\.sh|session-end\.sh/.test(target)) return;
        summary = 'Ran: ' + target.slice(0, 100);
        break;
      case 'TaskCreate':
        target = ti.subject || '';
        summary = 'Created task: ' + target;
        break;
      case 'TaskUpdate':
        target = ti.taskId || '';
        summary = 'Updated task ' + target + ' -> ' + (ti.status || '');
        break;
      default:
        summary = 'Called ' + tool;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const entry = JSON.stringify({
      time: now.toISOString(),
      tool,
      target: String(target).slice(0, 500),
      summary: String(summary).slice(0, 500),
      session
    });

    const logFile = path.join(process.env.LOGS_DIR, dateStr + '.jsonl');
    fs.appendFileSync(logFile, entry + '\n');
  } catch (e) {
    // Silent fail
  }
});
"

exit 0

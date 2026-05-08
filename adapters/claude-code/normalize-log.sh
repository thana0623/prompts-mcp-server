#!/bin/bash
# Claude Code adapter: PostToolUse hook
# Reads Claude Code's stdin JSON, normalizes it, pipes to shared auto-log.sh
#
# Claude Code input:
#   {"tool_name":"Edit","tool_input":{"file_path":"src/file.ts"},"session_id":"abc123",...}
#
# Normalized output:
#   {"tool":"Edit","target":"src/file.ts","summary":"Modified src/file.ts","session":"abc123","time":"...","assistant":"claude-code"}

set -euo pipefail

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"

HOOKS_DIR="$PROJECT_DIR/.prompts-mcp/hooks"

# Read Claude Code stdin
input=$(cat)

# Normalize and pipe to shared hook
export CLAUDE_INPUT="$input"
normalized=$(node -e "
const data = JSON.parse(process.env.CLAUDE_INPUT);
const tool = data.tool_name || 'unknown';
const ti = data.tool_input || {};
const session = data.session_id || 'unknown';

// Skip read-only tools
const skip = ['Read','Glob','Grep','Agent','WebFetch','WebSearch',
              'TaskList','TaskGet','TaskOutput','Skill'];
if (skip.includes(tool)) process.exit(0);

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

const entry = {
  tool,
  target: String(target).slice(0, 500),
  summary: String(summary).slice(0, 500),
  session,
  time: new Date().toISOString(),
  assistant: 'claude-code'
};

console.log(JSON.stringify(entry));
" 2>/dev/null) || exit 0

# If normalization produced output, pipe to shared hook
if [ -n "$normalized" ]; then
  echo "$normalized" | bash "$HOOKS_DIR/auto-log.sh"
fi

exit 0

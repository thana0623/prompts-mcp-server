#!/bin/bash
# Cline adapter: PostToolUse hook
# Reads Cline's stdin JSON, normalizes it, pipes to shared auto-log.sh
#
# Cline input:
#   {"taskId":"task-abc","hookName":"PostToolUse","toolName":"write_to_file","parameters":{"path":"src/file.ts"},...}
#
# Normalized output:
#   {"tool":"Write","target":"src/file.ts","summary":"Created/rewrote src/file.ts","session":"task-abc","time":"...","assistant":"cline"}

set -euo pipefail

export PROJECT_DIR="${CLINE_WORKSPACE_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"

HOOKS_DIR="$PROJECT_DIR/.prompts-mcp/hooks"

# Read Cline stdin
input=$(cat)

# Normalize and pipe to shared hook
export CLINE_INPUT="$input"
normalized=$(node -e "
const data = JSON.parse(process.env.CLINE_INPUT);
const tool = data.toolName || 'unknown';
const params = data.parameters || {};
const session = data.taskId || 'unknown';

// Skip read-only / non-meaningful tools
const skip = ['read_file','list_files','search_files','list_code_definition_names',
              'ask_followup_question','attempt_completion','search_and_replace'];
if (skip.includes(tool)) process.exit(0);

// Map Cline tool names to normalized names
const toolMap = {
  'write_to_file': 'Write',
  'edit_file': 'Edit',
  'execute_command': 'Bash',
  'browser_action': 'Browser',
  'use_mcp_tool': 'MCP',
  'access_mcp_resource': 'MCP'
};

const normalizedTool = toolMap[tool] || tool;
let target = '';
let summary = 'Called ' + normalizedTool;

switch (tool) {
  case 'write_to_file':
    target = params.path || '';
    summary = 'Created/rewrote ' + target;
    break;
  case 'edit_file':
    target = params.path || '';
    summary = 'Modified ' + target;
    break;
  case 'execute_command':
    target = (params.command || '').slice(0, 200);
    summary = 'Ran: ' + target.slice(0, 100);
    break;
  case 'use_mcp_tool':
    target = (params.server_name || '') + '/' + (params.tool_name || '');
    summary = 'MCP tool: ' + target;
    break;
  default:
    target = params.path || params.file_path || '';
}

const entry = {
  tool: normalizedTool,
  target: String(target).slice(0, 500),
  summary: String(summary).slice(0, 500),
  session,
  time: new Date().toISOString(),
  assistant: 'cline'
};

console.log(JSON.stringify(entry));
" 2>/dev/null) || exit 0

if [ -n "$normalized" ]; then
  echo "$normalized" | bash "$HOOKS_DIR/auto-log.sh"
fi

exit 0

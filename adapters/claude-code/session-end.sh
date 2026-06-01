#!/bin/bash
# Claude Code adapter: SessionEnd hook
# Reads stdin for session_id, sets env vars, delegates to shared session-end.sh

set -euo pipefail

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"

# Read stdin to extract session_id
INPUT=$(cat 2>/dev/null || echo '{}')
export SESSION_ID=$(echo "$INPUT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).session_id||'unknown'); } catch { console.log('unknown'); }
  });
" 2>/dev/null || echo 'unknown')

HOOKS_DIR="$PROJECT_DIR/.prompts-mcp/hooks"

if [ -f "$HOOKS_DIR/session-end.sh" ]; then
  bash "$HOOKS_DIR/session-end.sh"
else
  echo "Warning: shared session-end.sh not found at $HOOKS_DIR/session-end.sh"
fi

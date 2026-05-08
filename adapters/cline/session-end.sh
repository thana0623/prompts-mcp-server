#!/bin/bash
# Cline adapter: TaskComplete hook
# Sets env vars and delegates to shared session-end.sh

set -euo pipefail

export PROJECT_DIR="${CLINE_WORKSPACE_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"

HOOKS_DIR="$PROJECT_DIR/.prompts-mcp/hooks"

if [ -f "$HOOKS_DIR/session-end.sh" ]; then
  bash "$HOOKS_DIR/session-end.sh"
else
  echo "Warning: shared session-end.sh not found at $HOOKS_DIR/session-end.sh"
fi

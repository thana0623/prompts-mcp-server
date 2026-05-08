#!/bin/bash
# Claude Code adapter: SessionStart hook
# Checks if prompts are initialized, loads context

set -euo pipefail

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"

CONTEXT_FILE="$PROJECT_DIR/$PROMPTS_SUBDIR/context.md"

if [ ! -f "$CONTEXT_FILE" ]; then
  echo "WARNING: Prompts not initialized. $PROMPTS_SUBDIR/context.md not found."
  echo "Run: npx prompts-mcp init --assistant claude-code --project-root $PROJECT_DIR"
  exit 0
fi

# Run bootstrap to load all context
BOOTSTRAP_OUTPUT=$(cd "$PROJECT_DIR" && node build/cli.js bootstrap 2>&1)

# Print context to stdout (Claude Code will see this)
echo "$BOOTSTRAP_OUTPUT"

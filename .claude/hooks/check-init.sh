#!/bin/bash
# SessionStart hook: check if prompts are initialized, load context
# Stdout is visible to Claude as context

PROJECT_DIR="$CLAUDE_PROJECT_DIR"
PROMPTS_DIR="$PROJECT_DIR/.github/prompts"
CONTEXT_FILE="$PROMPTS_DIR/context.md"

if [ ! -f "$CONTEXT_FILE" ]; then
  echo "WARNING: Prompts not initialized. .github/prompts/context.md not found."
  echo "Please run the init_prompts MCP tool from prompts-mcp first."
  exit 0
fi

# Run bootstrap to load all context
BOOTSTRAP_OUTPUT=$(cd "$PROJECT_DIR" && node build/cli.js bootstrap 2>&1)

# Print context to stdout (Claude will see this)
echo "$BOOTSTRAP_OUTPUT"

#!/bin/bash
# SessionStart hook: check if prompts are initialized, load context
# Stdout is visible to Claude as context

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROMPTS_DIR="$PROJECT_DIR/.github/prompts"
CONTEXT_FILE="$PROMPTS_DIR/context.md"

if [ ! -f "$CONTEXT_FILE" ]; then
  echo "WARNING: Prompts not initialized. .github/prompts/context.md not found."
  echo "Run: npx prompts-mcp setup --project-root $PROJECT_DIR"
  exit 0
fi

# Read MCP server path from config
MCP_CONFIG="$PROJECT_DIR/.prompts-mcp/mcp-server-path"
if [ -f "$MCP_CONFIG" ]; then
  MCP_CLI_PATH=$(cat "$MCP_CONFIG")
else
  MCP_CLI_PATH="$PROJECT_DIR/build/cli.js"
fi

if [ ! -f "$MCP_CLI_PATH" ]; then
  echo "WARNING: MCP server CLI not found at $MCP_CLI_PATH"
  echo "Run: npx prompts-mcp setup --project-root $PROJECT_DIR"
  exit 0
fi

# Run bootstrap to load all context
BOOTSTRAP_OUTPUT=$(cd "$PROJECT_DIR" && node "$MCP_CLI_PATH" bootstrap 2>&1)

# Print context to stdout (Claude will see this)
echo "$BOOTSTRAP_OUTPUT"

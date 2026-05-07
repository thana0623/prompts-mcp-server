#!/bin/bash
# SessionEnd hook: auto-commit prompt changes on session exit

PROJECT_DIR="$CLAUDE_PROJECT_DIR"
PROMPTS_DIR="$PROJECT_DIR/.github/prompts"

if [ ! -d "$PROMPTS_DIR" ]; then
  echo "No prompts directory found, skipping."
  exit 0
fi

# Check if there are uncommitted changes in prompts dir
cd "$PROJECT_DIR"
CHANGES=$(git status --porcelain .github/prompts/ 2>/dev/null)

if [ -z "$CHANGES" ]; then
  echo "No uncommitted prompt changes."
  exit 0
fi

# Auto-commit prompt changes
git add .github/prompts/
git commit -m "auto: update prompts on session end" --no-verify 2>/dev/null

if [ $? -eq 0 ]; then
  echo "Prompt changes committed."
else
  echo "No changes to commit."
fi

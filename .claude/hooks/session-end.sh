#!/bin/bash
# SessionEnd hook: process logs then auto-commit on session exit

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROMPTS_DIR="$PROJECT_DIR/.github/prompts"

cd "$PROJECT_DIR"

# Step 1: Process JSONL logs into recent-5.md and summary-10.md
if [ -f ".claude/hooks/process-logs.sh" ]; then
  bash .claude/hooks/process-logs.sh 2>/dev/null || true
fi

# Step 2: Check for uncommitted changes in prompts + logs
CHANGES=$(git status --porcelain .github/prompts/ logs/ 2>/dev/null)

if [ -z "$CHANGES" ]; then
  echo "No uncommitted changes."
  exit 0
fi

# Step 3: Auto-commit
git add .github/prompts/ logs/
git commit -m "auto: update prompts and logs on session end" --no-verify 2>/dev/null

if [ $? -eq 0 ]; then
  echo "Changes committed (prompts + logs)."
else
  echo "No changes to commit."
fi

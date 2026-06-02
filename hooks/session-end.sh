#!/bin/bash
# Shared session-end hook (assistant-agnostic)
# Generates dialog summary, then auto-commits
#
# Environment variables (set by adapter):
#   PROJECT_DIR     — project root (default: pwd)
#   PROMPTS_SUBDIR  — prompts subdirectory (default: .github/prompts)
#   SESSION_ID      — current session identifier

set -euo pipefail

export PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
export PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"
export SESSION_ID="${SESSION_ID:-unknown}"

cd "$PROJECT_DIR"

# Step 1: Generate dialog summary from session prompts + git diff
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/generate-dialog-summary.sh" ]; then
  bash "$SCRIPT_DIR/generate-dialog-summary.sh" 2>/dev/null || true
fi

# Step 2: Check for uncommitted changes
CHANGES=$(git status --porcelain "$PROMPTS_SUBDIR/" logs/ 2>/dev/null)

if [ -z "$CHANGES" ]; then
  echo "No uncommitted changes."
  exit 0
fi

# Step 3: Auto-commit
git add "$PROMPTS_SUBDIR/" logs/
git commit -m "auto: update prompts and logs on session end" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "Changes committed (prompts + logs)."
else
  echo "No changes to commit."
fi

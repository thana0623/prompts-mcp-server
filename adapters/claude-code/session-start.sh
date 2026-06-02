#!/bin/bash
# Claude Code adapter: SessionStart hook
# Checks if prompts are initialized, loads context
# Supports monorepo: walks up directories to find .pmcp-root marker

set -euo pipefail

START_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROMPTS_SUBDIR="${PROMPTS_SUBDIR:-.github/prompts}"

# ─── 向上查找项目根目录 ─────────────────────────────────────────────────
# 优先级：
#   1. .pmcp-root 标记文件（精确定位）
#   2. .github/prompts/context.md 存在的目录（兼容无标记的项目）

find_project_root() {
  local dir="$1"

  # 策略 1: 查找 .pmcp-root 标记
  local check_dir="$dir"
  while true; do
    if [ -f "$check_dir/.pmcp-root" ]; then
      echo "$check_dir"
      return 0
    fi
    local parent
    parent=$(dirname "$check_dir")
    if [ "$parent" = "$check_dir" ]; then
      break  # 到达文件系统根目录
    fi
    check_dir="$parent"
  done

  # 策略 2: 查找 .github/prompts/context.md
  check_dir="$dir"
  while true; do
    if [ -f "$check_dir/$PROMPTS_SUBDIR/context.md" ]; then
      echo "$check_dir"
      return 0
    fi
    local parent
    parent=$(dirname "$check_dir")
    if [ "$parent" = "$check_dir" ]; then
      break
    fi
    check_dir="$parent"
  done

  return 1
}

# ─── Fallback: 告诉智能体如何初始化 ──────────────────────────────────────

print_fallback() {
  echo ""
  echo "## Prompts MCP - 未初始化"
  echo ""
  echo "当前项目未找到 prompts-mcp 配置。"
  echo ""
  echo "**请告知用户运行以下命令初始化：**"
  echo '```'
  echo "npx prompts-mcp setup"
  echo '```'
  echo ""
  echo "初始化完成后重新开始对话即可自动加载上下文。"
  echo ""
  echo "> 在此之前，请勿自由探索项目目录或执行任何操作。"
  echo "> 等待用户完成初始化后再继续。"
  echo ""
}

# ─── 主流程 ──────────────────────────────────────────────────────────────

PROJECT_DIR=$(find_project_root "$START_DIR") || {
  # 找不到项目根，输出 fallback 指令
  print_fallback
  exit 0
}

CONTEXT_FILE="$PROJECT_DIR/$PROMPTS_SUBDIR/context.md"

if [ ! -f "$CONTEXT_FILE" ]; then
  print_fallback
  exit 0
fi

# Read MCP server path from config (set by `setup` command)
MCP_CONFIG="$PROJECT_DIR/.prompts-mcp/mcp-server-path"
if [ -f "$MCP_CONFIG" ]; then
  MCP_CLI_PATH=$(cat "$MCP_CONFIG")
else
  # Fallback: try local build
  MCP_CLI_PATH="$PROJECT_DIR/build/cli.js"
fi

if [ ! -f "$MCP_CLI_PATH" ]; then
  echo ""
  echo "## Prompts MCP - Server 未找到"
  echo ""
  echo "MCP server CLI 不存在: \`$MCP_CLI_PATH\`"
  echo ""
  echo "**请告知用户重新运行 setup：**"
  echo '```'
  echo "npx prompts-mcp setup"
  echo '```'
  echo ""
  exit 0
fi

# 检查全局 skill 仓库是否已初始化
GLOBAL_SKILLS_DIR="${HOME:-$USERPROFILE}/.pmcp/skills"
if [ ! -d "$GLOBAL_SKILLS_DIR/core" ]; then
  echo ""
  echo "## ⚠️ 全局 Skill 仓库未初始化"
  echo ""
  echo "个人 skill 仓库尚未创建。建议运行以下命令初始化："
  echo '```'
  echo "npx prompts-mcp skill init"
  echo '```'
  echo ""
  echo "初始化后可获得："
  echo "- 核心角色 skill（architect, backend, frontend, review）"
  echo "- 跨项目共享的个人 skill 仓库"
  echo "- 分层 skill 管理（全局只读 + 项目可写）"
  echo ""
fi

# Step 0: Contract integrity check
STATE_FILE="$PROJECT_DIR/$PROMPTS_SUBDIR/task-state.json"
SPEC_FILE="$PROJECT_DIR/$PROMPTS_SUBDIR/focus-spec.md"
if [ -f "$STATE_FILE" ] && [ -f "$SPEC_FILE" ]; then
  STAGE=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')).stage||'')}catch(e){console.log('')}")
  if [ "$STAGE" = "confirmed" ]; then
    STORED_HASH=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')).contractHash||'')}catch(e){console.log('')}")
    if [ -n "$STORED_HASH" ]; then
      ACTUAL_HASH=$(node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync(process.argv[1],'utf8')).digest('hex'))" "$SPEC_FILE" 2>/dev/null)
      if [ "$STORED_HASH" != "$ACTUAL_HASH" ]; then
        echo ""
        echo "## ⚠️ 契约完整性校验失败"
        echo ""
        echo "focus-spec.md 在上次确认后被修改，hash 不匹配。"
        echo "stage 已回退到 spec-pending，请重新确认需求。"
        echo ""
        # Force stage back to spec-pending
        node -e "
          const fs=require('fs'),p='$STATE_FILE';
          const s=JSON.parse(fs.readFileSync(p,'utf8'));
          s.stage='spec-pending';
          s.history=s.history||[];
          s.history.unshift({stage:'spec-pending',entered:new Date().toISOString(),note:'session-start hash 校验失败，契约被篡改'});
          fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n');
        "
      fi
    fi
  fi
fi

# Step 0.5: Stage-aware lifecycle guidance
if [ -f "$STATE_FILE" ]; then
  STAGE=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')).stage||'')}catch(e){console.log('')}")
  if [ "$STAGE" = "completed" ]; then
    echo ""
    echo "## 📋 上一个需求已完成"
    echo ""
    echo "开发阶段已结束。请检查 focus-spec.md 中的 TODO 是否全部完成。"
    echo "完成后输入「归档」以归档当前需求，然后可以开始新需求。"
    echo ""
  elif [ "$STAGE" = "archived" ]; then
    echo ""
    echo "## ✅ 已归档"
    echo ""
    echo "上一个需求已归档完成。可以开始新需求。"
    echo ""
  fi
fi

# Step 1: Process any unprocessed logs from previous sessions
# This ensures recent-5.md and summary-10.md are up-to-date even if
# the previous session's SessionEnd hook didn't run (crash, force quit, etc.)
HOOKS_DIR="$PROJECT_DIR/.prompts-mcp/hooks"
if [ -f "$HOOKS_DIR/process-logs.sh" ]; then
  bash "$HOOKS_DIR/process-logs.sh" 2>/dev/null || true
fi

# Step 1.5: Refresh context.md with current project state
# Re-scans project structure, languages, frameworks, package manager
# Only updates section 1 (tech stack), preserves section 2+ (user-edited)
node "$MCP_CLI_PATH" refresh-context 2>/dev/null || true

# Step 1.6: Auto-transition archived → spec-pending for new requirement cycles
# When stage=archived and no focus-spec exists, reset to spec-pending to trigger Hard Gate
# Note: STATE_FILE already defined in Step 0 (contract integrity check)
if [ -f "$STATE_FILE" ]; then
  STAGE=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).stage||'')}catch{console.log('')}" "$STATE_FILE" 2>/dev/null)
  SPEC_EXISTS="no"
  if [ -f "$SPEC_FILE" ]; then SPEC_EXISTS="yes"; fi

  if [ "$STAGE" = "archived" ] && [ "$SPEC_EXISTS" = "no" ]; then
    node -e "
      const fs=require('fs'),p=process.argv[1];
      const s=JSON.parse(fs.readFileSync(p,'utf8'));
      s.stage='spec-pending';
      s.taskId='';
      s.contractHash='';
      s.history=s.history||[];
      s.history.unshift({stage:'spec-pending',entered:new Date().toISOString(),note:'session-start 自动重置：上一需求已归档，准备新需求'});
      fs.writeFileSync(p,JSON.stringify(s,null,2)+'\n');
    " "$STATE_FILE" 2>/dev/null || true
  fi
fi

# Run bootstrap to load all context
BOOTSTRAP_OUTPUT=$(cd "$PROJECT_DIR" && node "$MCP_CLI_PATH" bootstrap 2>&1)

# Print context to stdout (Claude Code will see this)
echo "$BOOTSTRAP_OUTPUT"

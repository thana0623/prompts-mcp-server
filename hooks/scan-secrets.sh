#!/bin/bash
# Sensitive information scanner (optimized)
# Usage:
#   scan-secrets.sh                    # scan staged files (for pre-commit)
#   scan-secrets.sh <file> [file...]   # scan specific files
#   scan-secrets.sh --stdin            # read from stdin (for PostToolUse)
#
# Exit code: 0 = clean, 1 = secrets found

set -uo pipefail

RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

FOUND=0
ISSUES=""

add_issue() {
  local file="$1" line="$2" pattern="$3" content="$4"
  FOUND=$((FOUND + 1))
  if [ -n "$file" ]; then
    ISSUES="${ISSUES}  ${file}:${line}  →  ${pattern}: ${content}\n"
  else
    ISSUES="${ISSUES}  line ${line}  →  ${pattern}: ${content}\n"
  fi
}

scan_content() {
  local content="$1"
  local file="${2:-}"
  local line_num=0
  local line ips ip octet val email

  while IFS= read -r line; do
    line_num=$((line_num + 1))

    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue

    # --- Private Key ---
    if [[ "$line" =~ -----BEGIN.*(PRIVATE|RSA|EC|OPENSSH).*KEY----- ]]; then
      add_issue "$file" "$line_num" "Private Key" "${line:0:60}..."
      continue
    fi

    # --- AWS Access Key ---
    if [[ "$line" =~ AKIA[0-9A-Z]{16} ]]; then
      val="${BASH_REMATCH[0]}"
      add_issue "$file" "$line_num" "AWS Access Key" "$val"
      continue
    fi

    # --- GCP Service Account ---
    if [[ "$line" =~ \"type\"[[:space:]]*:[[:space:]]*\"service_account\" ]]; then
      add_issue "$file" "$line_num" "GCP Service Account" "service_account JSON detected"
      continue
    fi

    # --- JWT Token ---
    if [[ "$line" =~ eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.+/=-]+ ]]; then
      val="${BASH_REMATCH[0]}"
      add_issue "$file" "$line_num" "JWT Token" "${val:0:30}..."
      continue
    fi

    # --- Database Connection String ---
    if [[ "$line" =~ (mysql|postgres|mongodb|redis|mssql):// ]]; then
      val="${BASH_REMATCH[0]}"
      add_issue "$file" "$line_num" "Database Connection String" "${val:0:40}..."
      continue
    fi

    # --- API Key / Secret / Token / Auth (generic) ---
    if [[ "$line" =~ (api[_-]?key|apikey|secret[_-]?key|secret|token|auth[_-]?token|access[_-]?token|private[_-]?key)[[:space:]]*[:=][[:space:]]*[\"\'][^\"\']{8,} ]]; then
      val="${BASH_REMATCH[0]}"
      add_issue "$file" "$line_num" "Secret/Key/Token" "${val:0:50}..."
      continue
    fi

    # --- Password ---
    if [[ "$line" =~ password[[:space:]]*[:=][[:space:]]*[\"\'][^\"\']{4,} ]]; then
      add_issue "$file" "$line_num" "Password" "password = \"****\""
      continue
    fi

    # --- Hardcoded high-confidence keys (sk-xxx, ghp_xxx, glpat-xxx, etc.) ---
    if [[ "$line" =~ (sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9-]{20,}|xox[bporas]-[a-zA-Z0-9-]+) ]]; then
      val="${BASH_REMATCH[0]}"
      add_issue "$file" "$line_num" "Platform API Key" "${val:0:20}..."
      continue
    fi

    # --- IP Address (exclude common safe ones) ---
    if [[ "$line" =~ [0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3} ]]; then
      ip="${BASH_REMATCH[0]}"
      case "$ip" in
        0.0.0.0|127.0.0.1|255.255.255.255|10.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|192.168.*) ;;
        *)
          valid=1
          for octet in ${ip//./ }; do
            [ "$octet" -gt 255 ] && valid=0
          done
          [ "$valid" -eq 1 ] && add_issue "$file" "$line_num" "Public IP Address" "$ip"
          ;;
      esac
    fi

    # --- Email Address ---
    if [[ "$line" =~ [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,} ]]; then
      email="${BASH_REMATCH[0]}"
      case "$email" in
        *@example.com|*@example.org|*@test.com|*@localhost|*@domain.com) ;;
        *) add_issue "$file" "$line_num" "Email Address" "$email" ;;
      esac
      continue
    fi

    # --- Phone Number (China mobile) ---
    if [[ "$line" =~ \b1[3-9][0-9]{9}\b ]]; then
      val="${BASH_REMATCH[0]}"
      add_issue "$file" "$line_num" "Phone Number" "$val"
      continue
    fi

    # --- ID Card Number (China 18-digit) ---
    if [[ "$line" =~ \b[1-9][0-9]{5}(19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx]\b ]]; then
      add_issue "$file" "$line_num" "ID Card Number" "****(masked)"
      continue
    fi

  done <<< "$content"
}

# --- Main ---

if [ "${1:-}" = "--stdin" ]; then
  CONTENT=$(cat)
  scan_content "$CONTENT" ""
elif [ $# -gt 0 ]; then
  for f in "$@"; do
    [ -f "$f" ] || continue
    file --mime-encoding "$f" 2>/dev/null | grep -q "binary" && continue
    scan_content "$(cat "$f")" "$f"
  done
else
  FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
  if [ -z "$FILES" ]; then
    exit 0
  fi
  for f in $FILES; do
    [ -f "$f" ] || continue
    case "$f" in
      node_modules/*|build/*|dist/*|*.min.js|*.min.css|*.map) continue ;;
      *.env.example|*.env.template) continue ;;
      package-lock.json|yarn.lock|pnpm-lock.yaml) continue ;;
      hooks/scan-secrets.sh|.prompts-mcp/hooks/scan-secrets.sh) continue ;;
      .github/prompts/recent-5.md|.github/prompts/summary-10.md) continue ;;
    esac
    file --mime-encoding "$f" 2>/dev/null | grep -q "binary" && continue
    scan_content "$(cat "$f")" "$f"
  done
fi

if [ "$FOUND" -gt 0 ]; then
  echo ""
  echo -e "${RED}[SECRETS BLOCKED]${NC} 检测到 ${FOUND} 处敏感信息，提交已阻止："
  echo ""
  echo -e "$ISSUES"
  echo -e "${YELLOW}请移除或替换为环境变量引用后重试。${NC}"
  echo ""
  exit 1
fi

exit 0

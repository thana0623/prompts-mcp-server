# Project: prompts-mcp-server

## Session Lifecycle

This project uses an automated context lifecycle via Claude Code hooks and the prompts-mcp MCP server.

### Phase 1: Session Start (automated by hook)

The `SessionStart` hook (`.claude/hooks/check-init.sh`) automatically:
- Checks if `.github/prompts/context.md` exists
- If initialized: loads all context (context.md, recent-5, summary-10, todos, dev-rules, user rules, modules)
- If not initialized: warns you to run `init_prompts` first

No manual action needed — context is injected at conversation start.

### Phase 2: During Conversation (Claude responsibility)

- Read context files to understand the project — do NOT scan the project filesystem directly
- Before coding: use `check_requirements` MCP tool, then `make_plan`
- Consult module history via `read_module` before modifying modules

### Phase 3: Per-Turn Logging (Claude responsibility)

After completing meaningful work (code changes, decisions, discussions), call the `log_dialog` MCP tool from `prompts-mcp` to record the turn:
- `title`: concise summary of what was done
- `request`: the user's original request (cleaned up)
- `changes`: list of files changed
- `decisions`: any technical decisions made
- `todos`: any remaining TODO items

This keeps the rolling windows (recent-5, summary-10) always up to date.

### Phase 4: Session End (automated by hook)

The `SessionEnd` hook (`.claude/hooks/session-end.sh`) automatically:
- Commits any uncommitted `.github/prompts/` changes to git

No manual action needed.

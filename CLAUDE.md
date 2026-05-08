# Project: prompts-mcp-server

## Architecture

This project is an AI-agnostic context lifecycle infrastructure. The MCP server and CLI are fully generic — they contain zero references to any specific AI assistant.

The hook system uses an adapter pattern:
- `hooks/` — shared core scripts (assistant-agnostic)
- `adapters/<assistant>/` — thin wrappers that normalize each assistant's format

This project is developed with Claude Code, so `.claude/settings.json` is configured to use the `adapters/claude-code/` adapter.

## Session Lifecycle

### Phase 1: Session Start (automated by hook)

The `adapters/claude-code/session-start.sh` hook automatically:
- Checks if `.github/prompts/context.md` exists
- Loads all context via `bootstrap` CLI command

### Phase 2: During Conversation

- Read context files to understand the project
- Before coding: use `check_requirements` MCP tool, then `make_plan`
- Consult module history via `read_module` before modifying modules

### Phase 3: Auto-Logging (automated by hook)

The `adapters/claude-code/normalize-log.sh` hook normalizes Claude Code's tool call data into a standard JSON format, then pipes it to `hooks/auto-log.sh` which appends to `logs/dialogs/YYYY-MM-DD.jsonl`.

### Phase 4: Session End (automated by hook)

The `adapters/claude-code/session-end.sh` hook delegates to `hooks/session-end.sh` which:
1. Runs `process-logs.sh` to update recent-5.md and summary-10.md
2. Git commits all changes

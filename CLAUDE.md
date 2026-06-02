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

## ECC Integration

PMCP can be combined with ECC (Everything Claude Code) for enterprise-grade workflows.

### Quick Start

```bash
# 1. Start PMCP with context loading
pmcp start

# 2. Select the ecc-workflow skill
#    This skill provides integrated ECC + PMCP workflows

# 3. Use ECC commands directly
/tdd              # Test-driven development
/code-review      # Code quality review
/security-scan    # Security scanning
/plan             # Implementation planning
```

### Combined Workflow

| Phase | PMCP | ECC |
|-------|------|-----|
| Init | `pmcp setup` | `/project-init` |
| Start | `pmcp start` | - |
| Plan | `pmcp check` + `pmcp plan` | `/plan` |
| Develop | - | `/tdd` |
| Review | - | `/code-review` + `/security-scan` |
| Log | `pmcp module-log` | `/save-session` |
| End | Auto (hook) | Auto (hook) |

### Available ECC Skills

- `/tdd` - Test-driven development
- `/plan` - Implementation planning
- `/code-review` - Quality review
- `/security-scan` - Security scanning
- `/build-fix` - Build error fixing
- `/learn` - Session pattern extraction
- `/skill-create` - Generate skills from git history

### Automation Hooks

Both PMCP and ECC provide hooks that run automatically:

- **PMCP**: Session start/end, context loading, log processing
- **ECC**: Quality gates, config protection, MCP health checks, continuous learning

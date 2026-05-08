# Prompts MCP Server Integration

This project uses prompts-mcp-server for context lifecycle management.

## MCP Server

The prompts-mcp MCP server provides tools for context management. Use them at the right lifecycle points:

### Session Start
At the beginning of each conversation, call the `auto_start` MCP tool to load project context.

### Before Coding
1. Call `check_requirements` to verify the task is well-defined
2. Call `make_plan` to generate an execution plan
3. Read module history via `read_module` before modifying modules

### After Completing Work
Call `log_dialog` to record what was done:
- `title`: concise summary
- `request`: what the user asked for
- `changes`: files modified
- `decisions`: technical decisions made

### Module Changes
After modifying a module, call `log_module` to record the change.

## File Structure

- `.github/prompts/context.md` — Project context overview
- `.github/prompts/recent-5.md` — Recent activity
- `.github/prompts/summary-10.md` — Rolling window summary
- `.github/prompts/todos.md` — TODO list
- `.github/prompts/modules/` — Module change history

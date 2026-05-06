# prompts-mcp-server

A **Model Context Protocol (MCP) server** for managing and serving a library of reusable prompts. It implements both the native MCP *Prompts* capability (so any MCP client can list and render prompts) and a set of *Tools* for full CRUD management of prompts at runtime.

---

## Features

- **MCP Prompts capability** – any MCP-compatible client can call `prompts/list` and `prompts/get`
- **Template rendering** – prompt templates use `{{argument_name}}` placeholders that are substituted at retrieval time
- **Full CRUD via MCP Tools** – `create_prompt`, `update_prompt`, `delete_prompt`, `list_prompts`, `get_prompt`
- **Tag-based filtering** – tag prompts and filter by tag when listing
- **Search** – filter prompts by name or description
- **TypeScript + Zod** – fully typed with runtime schema validation
- **Zero external storage dependency** – in-memory store by default; pluggable `PromptsStore` interface for custom backends

---

## Getting Started

### Prerequisites

- Node.js ≥ 18

### Install & build

```bash
npm install
npm run build
```

### Run the server

```bash
npm start
# or during development
npm run dev
```

The server communicates over **stdio** using the MCP protocol. Connect it from any MCP client by pointing at the `dist/index.js` entry point.

### Claude Desktop configuration example

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompts": {
      "command": "node",
      "args": ["/path/to/prompts-mcp-server/dist/index.js"]
    }
  }
}
```

---

## Prompt templates

Placeholders are written as `{{argument_name}}` (whitespace around the name is trimmed):

```
You are a helpful assistant. Summarise the following {{content_type}}:

{{content}}
```

Declare arguments when creating a prompt so MCP clients know what to supply:

```json
{
  "name": "summarise",
  "template": "Summarise the following {{content_type}}:\n\n{{content}}",
  "arguments": [
    { "name": "content_type", "description": "e.g. article, email, report", "required": true },
    { "name": "content", "required": true }
  ],
  "tags": ["utility", "writing"]
}
```

---

## MCP Tools reference

| Tool | Description |
|------|-------------|
| `create_prompt` | Create a new prompt in the library |
| `update_prompt` | Update an existing prompt by ID |
| `delete_prompt` | Delete a prompt by ID |
| `list_prompts` | List prompts, optionally filtered by `tag` or `search` |
| `get_prompt` | Retrieve a prompt by ID and render the template |

---

## Development

```bash
npm run typecheck   # TypeScript type checking
npm test            # Run all tests (vitest)
npm run test:watch  # Watch mode
npm run build       # Compile to dist/
```

---

## Architecture

```
src/
  index.ts     – Entry point; wires store, server, and stdio transport
  server.ts    – MCP Server: registers prompts + tools request handlers
  store.ts     – InMemoryPromptsStore (implements PromptsStore interface)
  template.ts  – Template resolution ({{placeholder}} substitution)
  types.ts     – Zod schemas and TypeScript types
  __tests__/   – Vitest test suites
```

---

## License

MIT

#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InMemoryPromptsStore } from "./store.js";
import { createServer } from "./server.js";

async function main() {
  const store = new InMemoryPromptsStore();
  const server = createServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { InMemoryPromptsStore } from "../store.js";
import { createServer } from "../server.js";

async function buildClientServer() {
  const store = new InMemoryPromptsStore();
  const server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, store };
}

describe("MCP Server – prompts capability", () => {
  it("lists prompts (empty initially)", async () => {
    const { client } = await buildClientServer();
    const result = await client.listPrompts();
    expect(result.prompts).toEqual([]);
  });

  it("returns a prompt by name via getPrompt", async () => {
    const { client, store } = await buildClientServer();
    await store.create({
      name: "greet",
      template: "Hello, {{name}}!",
      arguments: [{ name: "name", required: true }],
    });

    const result = await client.getPrompt({ name: "greet", arguments: { name: "Alice" } });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toBe("Hello, Alice!");
  });

  it("throws when prompt name is unknown", async () => {
    const { client } = await buildClientServer();
    await expect(client.getPrompt({ name: "unknown" })).rejects.toThrow();
  });
});

describe("MCP Server – tools", () => {
  let client: Client;
  let store: InMemoryPromptsStore;

  beforeEach(async () => {
    ({ client, store } = await buildClientServer());
  });

  it("lists available tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_prompt");
    expect(names).toContain("update_prompt");
    expect(names).toContain("delete_prompt");
    expect(names).toContain("list_prompts");
    expect(names).toContain("get_prompt");
  });

  describe("create_prompt tool", () => {
    it("creates a prompt and returns it", async () => {
      const result = await client.callTool({
        name: "create_prompt",
        arguments: {
          name: "summarise",
          template: "Summarise the following: {{text}}",
          arguments: [{ name: "text", required: true }],
          tags: ["utility"],
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const prompt = JSON.parse(content[0].text);
      expect(prompt.name).toBe("summarise");
      expect(prompt.tags).toEqual(["utility"]);
    });
  });

  describe("list_prompts tool", () => {
    it("returns all prompts", async () => {
      await store.create({ name: "A", template: "a" });
      await store.create({ name: "B", template: "b" });

      const result = await client.callTool({ name: "list_prompts", arguments: {} });
      const content = result.content as Array<{ type: string; text: string }>;
      const prompts = JSON.parse(content[0].text);
      expect(prompts).toHaveLength(2);
    });

    it("filters by tag", async () => {
      await store.create({ name: "Tagged", template: "t", tags: ["special"] });
      await store.create({ name: "Plain", template: "p" });

      const result = await client.callTool({
        name: "list_prompts",
        arguments: { tag: "special" },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const prompts = JSON.parse(content[0].text);
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe("Tagged");
    });
  });

  describe("update_prompt tool", () => {
    it("updates the prompt name", async () => {
      const p = await store.create({ name: "Old", template: "t" });
      const result = await client.callTool({
        name: "update_prompt",
        arguments: { id: p.id, name: "New" },
      });
      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const updated = JSON.parse(content[0].text);
      expect(updated.name).toBe("New");
    });

    it("returns error text for unknown id", async () => {
      const result = await client.callTool({
        name: "update_prompt",
        arguments: { id: "nope", name: "X" },
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("delete_prompt tool", () => {
    it("deletes an existing prompt", async () => {
      const p = await store.create({ name: "Del", template: "t" });
      const result = await client.callTool({
        name: "delete_prompt",
        arguments: { id: p.id },
      });
      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("deleted successfully");
    });

    it("returns 'not found' for unknown id", async () => {
      const result = await client.callTool({
        name: "delete_prompt",
        arguments: { id: "ghost" },
      });
      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("not found");
    });
  });

  describe("get_prompt tool", () => {
    it("returns the prompt with rendered template", async () => {
      const p = await store.create({
        name: "Render Me",
        template: "Count: {{n}}",
        arguments: [{ name: "n", required: true }],
      });

      const result = await client.callTool({
        name: "get_prompt",
        arguments: { id: p.id, arguments: { n: "42" } },
      });
      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.messages[0].content.text).toBe("Count: 42");
    });

    it("returns isError for unknown id", async () => {
      const result = await client.callTool({
        name: "get_prompt",
        arguments: { id: "missing" },
      });
      expect(result.isError).toBe(true);
    });
  });
});

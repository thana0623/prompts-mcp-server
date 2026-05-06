import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  CreatePromptInputSchema,
  DeletePromptInputSchema,
  GetPromptInputSchema,
  ListPromptsInputSchema,
  UpdatePromptInputSchema,
  type PromptsStore,
} from "./types.js";
import { promptToMcpMessages } from "./template.js";

export function createServer(store: PromptsStore): Server {
  const server = new Server(
    { name: "prompts-mcp-server", version: "1.0.0" },
    {
      capabilities: {
        prompts: { listChanged: false },
        tools: {},
      },
    }
  );

  // ─── MCP Prompts capability ─────────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const prompts = await store.list();
    return {
      prompts: prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: (p.arguments ?? []).map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required ?? false,
        })),
      })),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args: Record<string, string> = {};
    if (rawArgs) {
      for (const [k, v] of Object.entries(rawArgs)) {
        if (v !== undefined) args[k] = v;
      }
    }

    // Look up by name first, then by id
    let prompt = await store.getByName(name);
    if (!prompt) {
      prompt = await store.get(name);
    }
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    return {
      description: prompt.description,
      messages: promptToMcpMessages(prompt, args),
    };
  });

  // ─── MCP Tools ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "create_prompt",
        description: "Create a new prompt and add it to the prompt library",
        inputSchema: zodToJsonSchema(CreatePromptInputSchema),
      },
      {
        name: "update_prompt",
        description: "Update an existing prompt by its ID",
        inputSchema: zodToJsonSchema(UpdatePromptInputSchema),
      },
      {
        name: "delete_prompt",
        description: "Delete a prompt from the library by its ID",
        inputSchema: zodToJsonSchema(DeletePromptInputSchema),
      },
      {
        name: "list_prompts",
        description: "List prompts in the library, optionally filtered by tag or search query",
        inputSchema: zodToJsonSchema(ListPromptsInputSchema),
      },
      {
        name: "get_prompt",
        description:
          "Retrieve a prompt by ID and optionally render its template with argument values",
        inputSchema: zodToJsonSchema(GetPromptInputSchema),
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;

    try {
      switch (name) {
        case "create_prompt": {
          const input = CreatePromptInputSchema.parse(rawArgs);
          const prompt = await store.create(input);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(prompt, null, 2),
              },
            ],
          };
        }

        case "update_prompt": {
          const input = UpdatePromptInputSchema.parse(rawArgs);
          const prompt = await store.update(input);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(prompt, null, 2),
              },
            ],
          };
        }

        case "delete_prompt": {
          const input = DeletePromptInputSchema.parse(rawArgs);
          const deleted = await store.delete(input.id);
          return {
            content: [
              {
                type: "text",
                text: deleted
                  ? `Prompt ${input.id} deleted successfully.`
                  : `Prompt ${input.id} not found.`,
              },
            ],
          };
        }

        case "list_prompts": {
          const input = ListPromptsInputSchema.parse(rawArgs ?? {});
          const prompts = await store.list(input);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(prompts, null, 2),
              },
            ],
          };
        }

        case "get_prompt": {
          const input = GetPromptInputSchema.parse(rawArgs);
          const prompt = await store.get(input.id);
          if (!prompt) {
            return {
              isError: true,
              content: [{ type: "text", text: `Prompt not found: ${input.id}` }],
            };
          }
          const { promptToMcpMessages: ptm } = await import("./template.js");
          const messages = ptm(prompt, input.arguments ?? {});
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ prompt, messages }, null, 2),
              },
            ],
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  });

  return server;
}

/**
 * Minimal Zod → JSON Schema converter for tool input schemas.
 * Handles the shapes used in this project (objects with optional/required fields).
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return buildJsonSchema(schema);
}

function buildJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = buildJsonSchema(value);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return buildJsonSchema(schema._def.innerType as z.ZodTypeAny);
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: buildJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: buildJsonSchema(schema.valueSchema),
    };
  }

  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    if (schema.description) result["description"] = schema.description;
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  // Fallback
  return {};
}
